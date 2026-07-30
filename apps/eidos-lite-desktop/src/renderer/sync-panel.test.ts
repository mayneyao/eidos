// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"

import type {
  EidosLiteApi,
  EidosSyncPreflight,
  EidosSyncRunResponse,
  EidosSyncStatus,
  SpaceSnapshot,
} from "../shared/contracts"
import { SyncPanel } from "./sync-panel"

const status: EidosSyncStatus = {
  environment: "staging",
  account: {
    state: "signed-in",
    user: { id: "user-1", email: "person@example.com" },
  },
  device: { state: "active" },
  entitlement: {
    state: "read-write",
    detail: "Account, device, write access, and quota checks passed.",
    quotaBytes: 10_737_418_240,
  },
  remote: {
    state: "connected",
    url: "https://sync-staging.eidos.space/person/space",
  },
  canEnable: false,
  canClone: true,
  blocker: null,
}

const failureResponse: EidosSyncRunResponse = {
  ok: false,
  runId: "run-1",
  failure: {
    code: "quota-exceeded",
    state: "paused-storage-full",
    title: "Hosted storage is full",
    message: "No new Hosted version was published. Local work remains safe.",
    action: "manage-account",
    actionLabel: "Manage storage",
    retryable: false,
    localSafe: true,
    status: 413,
  },
  telemetry: {
    startedAtMs: 100,
    completedAtMs: 125,
    durationMs: 25,
    phases: [
      {
        phase: "push",
        detail: "Pushing Local checkpoints to Hosted Space",
        durationMs: 25,
      },
    ],
  },
}

const conflictResponse = {
  ok: true,
  result: {
    state: "conflict",
    message: "Local and Hosted history have diverged.",
    pulled: false,
    pushed: false,
    ahead: 2,
    behind: 3,
    snapshot: {} as SpaceSnapshot,
    runId: "conflict-run",
    telemetry: {
      startedAtMs: 100,
      completedAtMs: 140,
      durationMs: 40,
      phases: [],
    },
  },
} satisfies EidosSyncRunResponse

const preflight: EidosSyncPreflight = {
  manifestId: "a".repeat(64),
  generatedAtMs: 100,
  fileCount: 4,
  eidosFileCount: 2,
  totalBytes: 125_829_120,
  excludedCount: 1,
  warningCount: 1,
  blockerCount: 0,
  excluded: [{ relativePath: ".graft", reason: "graft-metadata" }],
  warnings: [
    {
      relativePath: ".env.local",
      size: 42,
      concerns: ["hidden", "suspected-secret"],
    },
  ],
  blockers: [],
}

describe("SyncPanel failure states", () => {
  let root: Root
  let host: HTMLDivElement

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it("renders an actionable Local-safe failure instead of a generic string", async () => {
    const openSyncHelp = vi.fn().mockResolvedValue(undefined)
    const api = {
      getSyncStatus: vi.fn().mockResolvedValue(status),
      getSyncQueueStatus: vi.fn().mockResolvedValue(null),
      runSync: vi.fn().mockResolvedValue(failureResponse),
      onSyncProgress: vi.fn().mockReturnValue(() => undefined),
      onSyncQueueChanged: vi.fn().mockReturnValue(() => undefined),
      openSyncHelp,
    } as unknown as EidosLiteApi
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: api,
    })

    await act(async () => {
      root.render(
        createElement(SyncPanel, {
          mode: "enable",
          onClose: () => undefined,
        })
      )
    })
    const sync = host.querySelector<HTMLButtonElement>("[data-sync-run]")
    expect(sync).not.toBeNull()
    expect(
      host.querySelector(
        '.sync-dialog-title-line .environment-badge[data-service-environment="staging"]'
      )?.textContent
    ).toBe("Staging")
    expect(
      [...host.querySelectorAll(".sync-status-list dt")].some(
        (entry) => entry.textContent === "Environment"
      )
    ).toBe(false)

    await act(async () => {
      sync?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    const failure = host.querySelector<HTMLElement>("[data-sync-failure]")
    expect(failure?.dataset.syncFailure).toBe("quota-exceeded")
    expect(failure?.dataset.syncFailureState).toBe("paused-storage-full")
    expect(failure?.dataset.syncLocalSafe).toBe("true")
    expect(failure?.textContent).toContain("Hosted storage is full")
    expect(failure?.textContent).toContain("Local files safe")
    expect(host.querySelector("[data-sync-phase='push']")).not.toBeNull()

    const action = host.querySelector<HTMLButtonElement>(
      "[data-sync-failure-primary-action]"
    )
    await act(async () => {
      action?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(openSyncHelp).toHaveBeenCalledWith("account")
  })

  it("surfaces a pending background retry without hiding Local safety", async () => {
    const api = {
      getSyncStatus: vi.fn().mockResolvedValue(status),
      getSyncQueueStatus: vi.fn().mockResolvedValue({
        spaceId: "space-1",
        state: "retry-wait",
        trigger: "local-checkpoint",
        attempt: 2,
        maxAttempts: 5,
        queuedAtMs: 100,
        nextAttemptAtMs: Date.now() + 2_000,
        lastFailure: {
          code: "offline",
          state: "offline",
          title: "Eidos Sync is offline",
          message: "Local files remain safe.",
          action: "retry-now",
          actionLabel: "Retry now",
          retryable: true,
          localSafe: true,
        },
      }),
      onSyncProgress: vi.fn().mockReturnValue(() => undefined),
      onSyncQueueChanged: vi.fn().mockReturnValue(() => undefined),
    } as unknown as EidosLiteApi
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: api,
    })

    await act(async () => {
      root.render(
        createElement(SyncPanel, {
          mode: "enable",
          onClose: () => undefined,
        })
      )
    })

    const queue = host.querySelector<HTMLElement>("[data-sync-queue-state]")
    expect(queue?.dataset.syncQueueState).toBe("retry-wait")
    expect(queue?.textContent).toContain("Background retry scheduled")
    expect(queue?.textContent).toContain("Attempt 3 of 5")
    expect(host.textContent).toContain("Local files remain available")
    expect(host.querySelector("[data-sync-failure='offline']")).not.toBeNull()
  })

  it("shows both sides of a divergence and creates independent recoveries", async () => {
    const copyLocalRecoverySpace = vi.fn().mockResolvedValue({
      kind: "local-copy",
      name: "Project Local Recovery",
      displayPath: "/tmp/Project Local Recovery",
      connected: false,
    })
    const cloneHostedRecoverySpace = vi.fn().mockResolvedValue({
      kind: "hosted-clone",
      name: "Project Hosted Recovery",
      displayPath: "/tmp/Project Hosted Recovery",
      connected: true,
    })
    const api = {
      getSyncStatus: vi.fn().mockResolvedValue(status),
      getSyncQueueStatus: vi.fn().mockResolvedValue(null),
      runSync: vi.fn().mockResolvedValue(conflictResponse),
      onSyncProgress: vi.fn().mockReturnValue(() => undefined),
      onSyncQueueChanged: vi.fn().mockReturnValue(() => undefined),
      copyLocalRecoverySpace,
      cloneHostedRecoverySpace,
    } as unknown as EidosLiteApi
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: api,
    })

    await act(async () => {
      root.render(
        createElement(SyncPanel, {
          mode: "enable",
          onClose: () => undefined,
        })
      )
    })
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>("[data-sync-run]")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })

    const recovery = host.querySelector<HTMLElement>("[data-sync-recovery]")
    expect(recovery?.textContent).toContain("does not merge or overwrite")
    expect(
      recovery?.querySelector("[data-sync-local-ahead]")?.textContent
    ).toBe("2")
    expect(
      recovery?.querySelector("[data-sync-hosted-ahead]")?.textContent
    ).toBe("3")

    await act(async () => {
      recovery
        ?.querySelector<HTMLButtonElement>("[data-sync-recover-local]")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(copyLocalRecoverySpace).toHaveBeenCalledOnce()
    expect(host.textContent).toContain("Local Recovery Space created")

    await act(async () => {
      recovery
        ?.querySelector<HTMLButtonElement>("[data-sync-recover-hosted]")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(cloneHostedRecoverySpace).toHaveBeenCalledOnce()
    expect(host.textContent).toContain("Hosted Recovery Space cloned")
  })

  it("requires explicit review of the whole-Space manifest before first push", async () => {
    const enableStatus: EidosSyncStatus = {
      ...status,
      remote: { state: "not-connected" },
      canEnable: true,
    }
    const enableSync = vi.fn().mockResolvedValue(status)
    const api = {
      getSyncStatus: vi.fn().mockResolvedValue(enableStatus),
      getSyncPreflight: vi.fn().mockResolvedValue(preflight),
      getSyncQueueStatus: vi.fn().mockResolvedValue(null),
      onSyncProgress: vi.fn().mockReturnValue(() => undefined),
      onSyncQueueChanged: vi.fn().mockReturnValue(() => undefined),
      enableSync,
    } as unknown as EidosLiteApi
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: api,
    })

    await act(async () => {
      root.render(
        createElement(SyncPanel, {
          mode: "enable",
          onClose: () => undefined,
        })
      )
    })

    const scope = host.querySelector<HTMLElement>("[data-sync-preflight]")
    const enable = host.querySelector<HTMLButtonElement>("[data-sync-enable]")
    expect(scope?.textContent).toContain("4")
    expect(scope?.textContent).toContain("120 MiB")
    expect(scope?.textContent).toContain(".env.local")
    expect(enable?.disabled).toBe(true)

    const confirm = host.querySelector<HTMLInputElement>(
      "[data-sync-preflight-confirm]"
    )
    await act(async () => {
      confirm?.click()
    })
    expect(enable?.disabled).toBe(false)

    await act(async () => {
      enable?.click()
    })
    expect(enableSync).toHaveBeenCalledWith({
      manifestId: preflight.manifestId,
      confirmWarnings: true,
    })
  })
})
