// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"

import type {
  EidosLiteApi,
  EidosSyncRunResponse,
  EidosSyncStatus,
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
})
