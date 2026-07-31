// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"

import type {
  EidosLiteApi,
  EidosSyncPreflight,
  EidosSyncProgress,
  EidosSyncRunResponse,
  EidosSyncStatus,
  SpaceSnapshot,
} from "../shared/contracts"
import { SyncPanel } from "./sync-panel"
import { writeSyncStatusSnapshot } from "./sync-status-cache"

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
    usedBytes: 2_147_483_648,
    reservedBytes: 536_870_912,
    quotaBytes: 10_737_418_240,
    remainingBytes: 8_053_063_680,
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
    window.localStorage.clear()
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    window.localStorage.clear()
    host.remove()
  })

  it("promotes a status-loading failure into the main Sync overview", async () => {
    const api = {
      getSyncStatus: vi.fn().mockRejectedValue(new Error("keychain denied")),
      getSyncQueueStatus: vi.fn().mockResolvedValue(null),
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
          mode: "clone",
          onClose: () => undefined,
        })
      )
    })

    const overview = host.querySelector<HTMLElement>("[data-sync-overview]")
    expect(overview?.dataset.syncOverview).toBe("danger")
    expect(overview?.textContent).toContain("Sync couldn’t be checked")
    expect(overview?.textContent).toContain("Your local files are safe")
    expect(overview?.textContent).not.toContain("Checking Sync")
    expect(host.textContent).not.toContain("keychain denied")
  })

  it("renders the cached account and status before background verification finishes", async () => {
    let finishStatus: ((value: EidosSyncStatus) => void) | undefined
    const getSyncStatus = vi.fn(
      () =>
        new Promise<EidosSyncStatus>((resolve) => {
          finishStatus = resolve
        })
    )
    writeSyncStatusSnapshot("space-1", {
      version: 1,
      status,
      checkedAtMs: Date.now() - 60_000,
      lastSyncedAtMs: Date.now() - 120_000,
    })
    const api = {
      getSyncStatus,
      getSyncQueueStatus: vi.fn().mockResolvedValue(null),
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
          cacheKey: "space-1",
          onClose: () => undefined,
        })
      )
    })

    expect(host.textContent).toContain("person@example.com")
    expect(host.textContent).toContain("2 GiB of 10 GiB used")
    expect(host.textContent).toContain("Checking account and cloud status")
    expect(host.textContent).not.toContain("Checking Sync")

    await act(async () => finishStatus?.(status))
    expect(host.textContent).not.toContain("Checking account and cloud status")
    expect(getSyncStatus).toHaveBeenCalledOnce()
  })

  it("shows the signed-out value state immediately on a first open", async () => {
    const api = {
      getSyncStatus: vi.fn(() => new Promise<EidosSyncStatus>(() => undefined)),
      getSyncQueueStatus: vi.fn().mockResolvedValue(null),
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
          cacheKey: "first-open",
          onClose: () => undefined,
        })
      )
    })

    expect(host.textContent).toContain("Keep this Space in sync")
    expect(host.textContent).not.toContain("Checking Sync")
    expect(host.querySelector(".sync-loading")).toBeNull()
  })

  it("keeps the cached identity when the secure session has expired", async () => {
    writeSyncStatusSnapshot("space-expired", {
      version: 1,
      status,
      checkedAtMs: Date.now() - 60_000,
      lastSyncedAtMs: Date.now() - 120_000,
    })
    const beginSyncSignIn = vi.fn().mockResolvedValue(status)
    const api = {
      getSyncStatus: vi.fn().mockResolvedValue({
        ...status,
        account: { state: "signed-out" },
        device: { state: "not-registered" },
        canEnable: false,
        canClone: false,
      } satisfies EidosSyncStatus),
      beginSyncSignIn,
      getSyncQueueStatus: vi.fn().mockResolvedValue(null),
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
          cacheKey: "space-expired",
          onClose: () => undefined,
        })
      )
    })

    expect(host.textContent).toContain("person@example.com")
    expect(host.textContent).toContain("Sign in again to continue syncing")
    expect(host.textContent).not.toContain("No synced Spaces yet")
    expect(
      [...host.querySelectorAll("button")].filter((button) =>
        button.textContent?.includes("Sign in again")
      )
    ).toHaveLength(1)
    const signIn = [...host.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("Sign in again")
    )
    await act(async () => signIn?.click())
    expect(beginSyncSignIn).toHaveBeenCalledOnce()
  })

  it("keeps cached account and storage context available while offline", async () => {
    writeSyncStatusSnapshot("space-offline", {
      version: 1,
      status,
      checkedAtMs: Date.now() - 60_000,
      lastSyncedAtMs: Date.now() - 120_000,
    })
    const api = {
      getSyncStatus: vi.fn().mockRejectedValue(new Error("network offline")),
      getSyncQueueStatus: vi.fn().mockResolvedValue(null),
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
          cacheKey: "space-offline",
          onClose: () => undefined,
        })
      )
    })

    expect(host.textContent).toContain("We’ll sync when you’re back online")
    expect(host.textContent).toContain("person@example.com")
    expect(host.textContent).toContain("2 GiB of 10 GiB used")
    expect(host.textContent).toContain("You can keep working on this device")
    expect(host.textContent).not.toContain("network offline")
    expect(host.querySelectorAll("[data-sync-run]")).toHaveLength(0)
  })

  it("shows real storage usage and promotes low capacity into an action", async () => {
    const lowStorageStatus: EidosSyncStatus = {
      ...status,
      entitlement: {
        ...status.entitlement,
        usedBytes: 10_200_547_328,
        reservedBytes: 0,
        remainingBytes: 536_870_912,
      },
    }
    const openSyncHelp = vi.fn().mockResolvedValue(undefined)
    const api = {
      getSyncStatus: vi.fn().mockResolvedValue(lowStorageStatus),
      getSyncQueueStatus: vi.fn().mockResolvedValue(null),
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

    const overview = host.querySelector<HTMLElement>("[data-sync-overview]")
    expect(overview?.dataset.syncOverview).toBe("warning")
    expect(overview?.textContent).toContain("512 MiB cloud storage left")
    const storage = host.querySelector<HTMLElement>("[data-sync-storage-used]")
    expect(storage?.textContent).toContain("9.5 GiB of 10 GiB used")
    expect(storage?.textContent).toContain("512 MiB available")

    const manage = host.querySelector<HTMLButtonElement>(
      "[data-sync-manage-storage]"
    )
    await act(async () => {
      manage?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(openSyncHelp).toHaveBeenCalledWith("account")
  })

  it("keeps unsaved-change guidance task-focused", async () => {
    const api = {
      getSyncStatus: vi.fn().mockResolvedValue(status),
      getSyncQueueStatus: vi.fn().mockResolvedValue(null),
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
          hasUncheckpointedChanges: true,
          onClose: () => undefined,
        })
      )
    })

    const overview = host.querySelector<HTMLElement>("[data-sync-overview]")
    expect(overview?.textContent).toContain("Review your latest changes")
    expect(overview?.textContent).toContain("before uploading them")
    expect(overview?.textContent).not.toMatch(
      /checkpoint|repository|remote|transport|segment/i
    )
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
    expect(
      host.querySelector("[data-sync-storage-used]")?.textContent
    ).toContain("2 GiB of 10 GiB used")

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
    expect(queue?.textContent).toContain("Sync will try again soon")
    expect(queue?.textContent).toContain("local files are safe")
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
    expect(recovery?.textContent).toContain("will not merge or overwrite")
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
    expect(host.textContent).toContain("Cloud Recovery Space opened")
  })

  it("requires explicit review of the whole-Space manifest before first push", async () => {
    const enableStatus: EidosSyncStatus = {
      ...status,
      remote: { state: "not-connected" },
      canEnable: true,
    }
    const enableSync = vi.fn().mockResolvedValue({
      ok: true,
      status,
      telemetry: {
        startedAtMs: 100,
        completedAtMs: 120,
        durationMs: 20,
        phases: [],
      },
    })
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

  it("shows user-facing progress while connecting a Space", async () => {
    const enableStatus: EidosSyncStatus = {
      ...status,
      remote: { state: "not-connected" },
      canEnable: true,
    }
    let progressListener: ((progress: EidosSyncProgress) => void) | undefined
    let finish:
      | ((value: Awaited<ReturnType<EidosLiteApi["enableSync"]>>) => void)
      | undefined
    const enableSync = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<EidosLiteApi["enableSync"]>>>(
          (resolve) => {
            finish = resolve
          }
        )
    )
    const api = {
      getSyncStatus: vi.fn().mockResolvedValue(enableStatus),
      getSyncPreflight: vi.fn().mockResolvedValue({
        ...preflight,
        warningCount: 0,
        warnings: [],
      }),
      getSyncQueueStatus: vi.fn().mockResolvedValue(null),
      onSyncProgress: vi.fn((listener) => {
        progressListener = listener
        return () => undefined
      }),
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
    await act(async () => {
      host.querySelector<HTMLButtonElement>("[data-sync-enable]")?.click()
    })
    await act(async () => {
      progressListener?.({
        runId: "connect-1",
        operation: "connect",
        state: "active",
        phase: "push",
        detail: "Pushing repository segments",
        startedAtMs: Date.now() - 200,
        phaseStartedAtMs: Date.now() - 50,
        elapsedMs: 200,
      })
    })

    const progress = host.querySelector<HTMLElement>("[data-sync-progress]")
    expect(progress?.dataset.syncOperation).toBe("connect")
    expect(progress?.textContent).toContain(
      "Uploading this Space for the first time"
    )
    expect(progress?.textContent).not.toContain("repository segments")

    await act(async () => {
      progressListener?.({
        runId: "connect-1",
        operation: "connect",
        state: "completed",
        phase: "validate",
        detail: "Space is connected",
        startedAtMs: Date.now() - 200,
        phaseStartedAtMs: Date.now() - 20,
        elapsedMs: 200,
      })
      finish?.({
        ok: true,
        status,
        telemetry: {
          startedAtMs: 100,
          completedAtMs: 300,
          durationMs: 200,
          phases: [],
        },
      })
    })
    expect(host.querySelector("[data-sync-overview]")?.textContent).toContain(
      "This Space is ready to sync"
    )
  })

  it("shows download progress when opening a synced Space", async () => {
    let progressListener: ((progress: EidosSyncProgress) => void) | undefined
    let finish:
      | ((
          value: Awaited<ReturnType<EidosLiteApi["cloneSyncRepository"]>>
        ) => void)
      | undefined
    const cloneSyncRepository = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<EidosLiteApi["cloneSyncRepository"]>>>(
          (resolve) => {
            finish = resolve
          }
        )
    )
    const api = {
      getSyncStatus: vi.fn().mockResolvedValue(status),
      getSyncQueueStatus: vi.fn().mockResolvedValue(null),
      listSyncRepositories: vi.fn().mockResolvedValue({
        namespace: "person",
        repositories: [
          {
            name: "Research",
            createdAtMs: 100,
            remoteUrl: "https://sync-staging.eidos.space/person/research",
          },
        ],
      }),
      cloneSyncRepository,
      onSyncProgress: vi.fn((listener) => {
        progressListener = listener
        return () => undefined
      }),
      onSyncQueueChanged: vi.fn().mockReturnValue(() => undefined),
    } as unknown as EidosLiteApi
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: api,
    })

    await act(async () => {
      root.render(
        createElement(SyncPanel, {
          mode: "clone",
          onClose: () => undefined,
        })
      )
    })
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>("[data-sync-open-space='Research']")
        ?.click()
    })
    await act(async () => {
      progressListener?.({
        runId: "clone-1",
        operation: "clone",
        state: "active",
        phase: "fetch",
        detail: "Cloning Remote URL",
        startedAtMs: Date.now() - 100,
        phaseStartedAtMs: Date.now() - 80,
        elapsedMs: 100,
      })
    })

    const progress = host.querySelector<HTMLElement>("[data-sync-progress]")
    expect(progress?.dataset.syncOperation).toBe("clone")
    expect(progress?.textContent).toContain("Downloading files from the cloud")
    expect(progress?.textContent).not.toContain("Remote URL")

    await act(async () => {
      finish?.({
        ok: true,
        snapshot: null,
        telemetry: {
          startedAtMs: 100,
          completedAtMs: 200,
          durationMs: 100,
          phases: [],
        },
      })
    })
  })

  it("makes read-only access a clear download-only state", async () => {
    const readOnlyStatus: EidosSyncStatus = {
      ...status,
      entitlement: {
        state: "read-only",
        detail: "Existing cloud data remains readable.",
      },
      blocker: {
        code: "read-only",
        message: "This account cannot upload changes.",
      },
    }
    const api = {
      getSyncStatus: vi.fn().mockResolvedValue(readOnlyStatus),
      getSyncQueueStatus: vi.fn().mockResolvedValue(null),
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

    expect(host.querySelector("[data-sync-overview]")?.textContent).toContain(
      "Ready to get updates"
    )
    expect(host.querySelector("[data-sync-run]")?.textContent).toContain(
      "Get cloud updates"
    )
  })

  it("keeps daily Sync progress simple and reports when there are no updates", async () => {
    let progressListener: ((progress: EidosSyncProgress) => void) | undefined
    let finish: ((value: EidosSyncRunResponse) => void) | undefined
    const runSync = vi.fn(
      () =>
        new Promise<EidosSyncRunResponse>((resolve) => {
          finish = resolve
        })
    )
    const api = {
      getSyncStatus: vi.fn().mockResolvedValue(status),
      getSyncQueueStatus: vi.fn().mockResolvedValue(null),
      runSync,
      onSyncProgress: vi.fn((listener) => {
        progressListener = listener
        return () => undefined
      }),
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
    await act(async () => {
      host.querySelector<HTMLButtonElement>("[data-sync-run]")?.click()
      progressListener?.({
        runId: "sync-1",
        operation: "sync",
        state: "active",
        phase: "fetch",
        detail: "Fetching origin/main segments",
        startedAtMs: Date.now() - 100,
        phaseStartedAtMs: Date.now() - 80,
        elapsedMs: 100,
      })
    })

    const progress = host.querySelector<HTMLElement>("[data-sync-progress]")
    expect(progress?.textContent).toContain("Checking for cloud updates")
    expect(progress?.textContent).not.toContain("origin/main")

    await act(async () => {
      progressListener?.({
        runId: "sync-1",
        operation: "sync",
        state: "completed",
        phase: "analyze",
        detail: "Local and cloud Space history are up to date",
        startedAtMs: Date.now() - 100,
        phaseStartedAtMs: Date.now() - 20,
        elapsedMs: 100,
      })
      finish?.({
        ok: true,
        result: {
          state: "synced",
          message: "Local and cloud Space history are up to date.",
          pulled: false,
          pushed: false,
          ahead: 0,
          behind: 0,
          snapshot: {} as SpaceSnapshot,
          runId: "sync-1",
          telemetry: {
            startedAtMs: 100,
            completedAtMs: 200,
            durationMs: 100,
            phases: [],
          },
        },
      })
    })

    expect(host.querySelector("[data-sync-overview]")?.textContent).toContain(
      "Everything is up to date"
    )
  })

  it("turns an expired session into a direct sign-in recovery", async () => {
    const beginSyncSignIn = vi.fn().mockResolvedValue(status)
    const api = {
      getSyncStatus: vi.fn().mockResolvedValue(status),
      getSyncQueueStatus: vi.fn().mockResolvedValue({
        spaceId: "space-1",
        state: "paused",
        trigger: "manual",
        attempt: 1,
        maxAttempts: 5,
        lastFailure: {
          code: "authentication-required",
          state: "paused-sign-in",
          title: "Sign in again to resume Sync",
          message:
            "The account session expired. Local editing remains available.",
          action: "sign-in",
          actionLabel: "Sign in again",
          retryable: false,
          localSafe: true,
        },
      }),
      beginSyncSignIn,
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
    expect(host.querySelector("[data-sync-overview]")?.textContent).toContain(
      "Sign in again to resume Sync"
    )

    await act(async () => {
      host
        .querySelector<HTMLButtonElement>("[data-sync-failure-primary-action]")
        ?.click()
    })
    expect(beginSyncSignIn).toHaveBeenCalledOnce()
  })
})
