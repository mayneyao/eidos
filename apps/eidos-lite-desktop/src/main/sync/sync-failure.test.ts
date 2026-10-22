import type { EidosSyncFailureCode } from "../../shared/contracts"
import { classifySyncFailure, shouldReconcileHostedPush } from "./sync-failure"

const missingLocalSnapshotSegment =
  "local snapshot hydrate failed: Object store error: NotFound (permanent) at read, context: { service: memory, path: segments/private-segment-id, range: 0- } => memory doesn't have this path"

describe("classifySyncFailure", () => {
  it.each([
    [
      { code: "authentication-required", status: 401 },
      "authentication-required",
    ],
    [{ code: "device-conflict", status: 409 }, "device-revoked"],
    [{ code: "quota-exceeded", status: 413 }, "quota-exceeded"],
    [
      { code: "protocol-version-mismatch", status: 426 },
      "protocol-version-mismatch",
    ],
    [{ code: "service-unavailable", status: 503 }, "service-unavailable"],
    [{ code: "EIDOS_LITE_GRAFT_WORKER_CRASHED" }, "sync-process-crashed"],
  ] satisfies Array<[Record<string, unknown>, EidosSyncFailureCode]>)(
    "maps structured error %o to %s",
    (source, expected) => {
      const error = Object.assign(new Error("safe diagnostic"), source)
      expect(classifySyncFailure(error, "fetch")).toMatchObject({
        code: expected,
        localSafe: true,
      })
    }
  )

  it.each([
    [401, "authentication-required"],
    [403, "device-revoked"],
    [404, "remote-not-found"],
    [409, "remote-conflict"],
    [413, "upload-too-large"],
    [426, "protocol-version-mismatch"],
    [429, "rate-limited"],
    [500, "remote-persistence-failed"],
    [503, "service-unavailable"],
  ] satisfies Array<[number, EidosSyncFailureCode]>)(
    "maps HTTP %i to %s",
    (status, expected) => {
      expect(
        classifySyncFailure(
          Object.assign(new Error(`Remote failed with HTTP ${status}`), {
            code: "GRAFT_SDK_REPOSITORY_COMMAND",
          }),
          "push"
        )
      ).toMatchObject({ code: expected, status })
    }
  )

  it("uses a safe repository-command fallback without exposing diagnostics", () => {
    const classified = classifySyncFailure(
      Object.assign(
        new Error(
          "Remote persistence failed; Authorization: Bearer do-not-expose"
        ),
        { code: "GRAFT_SDK_REPOSITORY_COMMAND" }
      ),
      "push"
    )

    expect(classified).toMatchObject({
      code: "remote-persistence-failed",
      action: "retry-now",
      retryable: true,
      localSafe: true,
    })
    expect(JSON.stringify(classified)).not.toContain("do-not-expose")
  })

  it("explains an existing origin without offering an upload retry", () => {
    expect(
      classifySyncFailure(
        Object.assign(new Error("private old remote URL"), {
          code: "GRAFT_SDK_E2EE_ORIGIN_CONFLICT",
        }),
        "push"
      )
    ).toMatchObject({
      code: "remote-already-configured",
      action: "work-locally",
      retryable: false,
      localSafe: true,
    })
  })

  it("stops retrying when a local snapshot references missing storage", () => {
    const classified = classifySyncFailure(
      Object.assign(
        new Error(
          "Command error: snapshot references missing storage commit 4Fe8EPM1JWDDV/15"
        ),
        { code: "GRAFT_SDK_REPOSITORY_COMMAND" }
      ),
      "push"
    )

    expect(classified).toMatchObject({
      code: "repository-invalid",
      action: "clone-hosted",
      retryable: false,
      localSafe: true,
    })
    expect(JSON.stringify(classified)).not.toContain("4Fe8EPM1JWDDV")
  })

  it.each(["fetch", "pull", "push"] as const)(
    "keeps a missing encrypted snapshot object distinct from account access during %s",
    (phase) => {
      const classified = classifySyncFailure(
        Object.assign(
          new Error(
            `${missingLocalSnapshotSegment}; remote snapshot hydrate failed: HTTP remote returned 404 for \`encrypted object\`: object missing`
          ),
          { code: "GRAFT_SDK_REPOSITORY_COMMAND" }
        ),
        phase
      )

      expect(classified).toMatchObject({
        code: "history-data-missing",
        title: "Sync history is temporarily unavailable",
        action: "retry-now",
        retryable: true,
        retryAfterMs: 2_000,
        localSafe: true,
        status: 404,
      })
      expect(classified.message).toContain(
        "current files have not been replaced"
      )
      expect(classified.message).toContain(
        "Keep this Space and its local versions"
      )
      expect(JSON.stringify(classified)).not.toMatch(
        /private-segment-id|encrypted object|signed-in account|fresh cloud copy/
      )
    }
  )

  it("identifies a local snapshot's missing segment without a misleading account error", () => {
    expect(
      classifySyncFailure(
        Object.assign(new Error(missingLocalSnapshotSegment), {
          code: "GRAFT_SDK_REPOSITORY_COMMAND",
        }),
        "push"
      )
    ).toMatchObject({
      code: "history-data-missing",
      action: "retry-now",
      retryable: true,
    })
  })

  it("keeps authentication recovery available when remote hydration needs a new login", () => {
    expect(
      classifySyncFailure(
        Object.assign(
          new Error(
            `${missingLocalSnapshotSegment}; remote snapshot hydrate failed: HTTP remote returned 401`
          ),
          { code: "GRAFT_SDK_REPOSITORY_COMMAND" }
        ),
        "push"
      )
    ).toMatchObject({ code: "authentication-required", retryable: false })
  })

  it("keeps network recovery available when remote hydration cannot be reached", () => {
    expect(
      classifySyncFailure(
        Object.assign(
          new Error(
            `${missingLocalSnapshotSegment}; remote snapshot hydrate failed: network connection reset`
          ),
          { code: "GRAFT_SDK_REPOSITORY_COMMAND" }
        ),
        "push"
      )
    ).toMatchObject({ code: "offline", retryable: true })
  })

  it("recognizes a missing plaintext snapshot segment without claiming the whole Space is unavailable", () => {
    expect(
      classifySyncFailure(
        Object.assign(
          new Error(
            `${missingLocalSnapshotSegment}; remote snapshot hydrate failed: HTTP remote returned 404 for \`segments/private-segment-id\`: {"title":"object_not_found","status":404,"detail":"Object not found"}`
          ),
          { code: "GRAFT_SDK_REPOSITORY_COMMAND" }
        ),
        "push"
      )
    ).toMatchObject({
      code: "history-data-missing",
      action: "retry-now",
      retryable: true,
      status: 404,
    })
  })

  it.each([
    "HTTP remote returned 404 for `encrypted object`: object missing",
    'HTTP remote returned 404 for `segments/private-segment-id`: {"title":"object_not_found","status":404}',
    `${missingLocalSnapshotSegment}; remote snapshot hydrate failed: HTTP remote returned 404 for \`repository\`: {"title":"repository_not_found"}`,
  ])(
    "does not generalize non-snapshot or repository HTTP 404: %s",
    (message) => {
      expect(
        classifySyncFailure(
          Object.assign(new Error(message), {
            code: "GRAFT_SDK_REPOSITORY_COMMAND",
          }),
          "push"
        )
      ).toMatchObject({ code: "remote-not-found", status: 404 })
    }
  )

  it("keeps an edge upload limit distinct from account storage quota", () => {
    const classified = classifySyncFailure(
      Object.assign(
        new Error(
          "Graft repository error: HTTP remote returned 413 for `segments/redacted`: 413 Payload Too Large"
        ),
        { code: "GRAFT_SDK_REPOSITORY_COMMAND" }
      ),
      "push"
    )

    expect(classified).toMatchObject({
      code: "upload-too-large",
      title: "This upload is too large",
      action: "work-locally",
      retryable: false,
      localSafe: true,
      status: 413,
    })
    expect(classified.title).not.toMatch(/storage|quota/i)
    expect(classified.message).not.toMatch(/free some storage|increase/i)
  })

  it.each([
    ["GRAFT_SDK_REMOTE_TRANSPORT_TIMEOUT", "offline"],
    ["GRAFT_SDK_REPOSITORY_STALE", "remote-conflict"],
    ["GRAFT_SDK_REMOTE_PUBLICATION_UNCONFIRMED", "remote-persistence-failed"],
    [
      "GRAFT_SDK_REMOTE_PUBLICATION_OUTCOME_UNKNOWN",
      "remote-persistence-failed",
    ],
  ] satisfies Array<[string, EidosSyncFailureCode]>)(
    "maps structured Graft SDK error %s to %s",
    (code, expected) => {
      expect(
        classifySyncFailure(
          Object.assign(new Error("safe structured Graft failure"), { code }),
          "push"
        )
      ).toMatchObject({ code: expected, localSafe: true })
    }
  )

  it("maps the SDK missing-main normalization to a missing Remote", () => {
    const classified = classifySyncFailure(
      Object.assign(
        new Error(
          "Graft repository error: remote `origin` has no branch `main`"
        ),
        { code: "GRAFT_SDK_REPOSITORY_COMMAND" }
      ),
      "fetch"
    )

    expect(classified).toMatchObject({
      code: "remote-not-found",
      action: "clone-hosted",
      localSafe: true,
    })
    expect(classified).not.toHaveProperty("status")
  })

  it("keeps local checkpoint and divergence failures distinct", () => {
    expect(
      classifySyncFailure(
        new Error("Create a checkpoint for local changes before Sync"),
        "fetch"
      ).code
    ).toBe("local-changes")
    expect(
      classifySyncFailure(
        new Error("Hosted history changed before push. Sync again."),
        "push"
      ).code
    ).toBe("remote-conflict")
  })
})

describe("shouldReconcileHostedPush", () => {
  it.each([
    [{ code: "GRAFT_SDK_REPOSITORY_STALE" }, true],
    [{ code: "GRAFT_SDK_REMOTE_PUBLICATION_UNCONFIRMED" }, true],
    [{ code: "GRAFT_SDK_REMOTE_PUBLICATION_OUTCOME_UNKNOWN" }, true],
    [{ code: "GRAFT_SDK_REPOSITORY_COMMAND", status: 409 }, true],
    [{ code: "GRAFT_SDK_REPOSITORY_COMMAND" }, true],
    [{ code: "GRAFT_SDK_REPOSITORY_COMMAND", status: 500 }, false],
    [{ code: "GRAFT_SDK_REMOTE_TRANSPORT_TIMEOUT" }, false],
  ] satisfies Array<[Record<string, unknown>, boolean]>)(
    "decides %o -> %s",
    (source, expected) => {
      expect(
        shouldReconcileHostedPush(
          Object.assign(new Error("safe diagnostic"), source)
        )
      ).toBe(expected)
    }
  )

  it("recognizes an unclassified remote race without an SDK code", () => {
    expect(shouldReconcileHostedPush(new Error("Hosted history changed"))).toBe(
      true
    )
    expect(
      shouldReconcileHostedPush(new Error("Remote head changed (CAS)"))
    ).toBe(true)
    expect(shouldReconcileHostedPush(new Error("Network offline"))).toBe(false)
  })
})
