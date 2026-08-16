import type { EidosSyncFailureCode } from "../../shared/contracts"
import { classifySyncFailure } from "./sync-failure"

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
