// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"

import type {
  EidosLiteApi,
  EidosSyncPreflight,
  EidosSyncProgress,
  EidosSyncRepositoryList,
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

    expect(host.querySelector("[data-sync-overview]")).toBeNull()
    expect(host.textContent).toContain("Sign in")
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
    expect(host.textContent).toContain("Cloud used")
    expect(host.textContent).toContain("2 GiB")
    expect(host.textContent).toContain("Plan total")
    expect(host.textContent).toContain("10 GiB")
    expect(host.textContent).not.toContain("Checking account and cloud status")
    expect(host.textContent).not.toContain("Checking Sync")
    expect(
      host.querySelector<HTMLElement>("[data-sync-account-summary]")?.dataset
        .syncAccountChecking
    ).toBe("true")
    expect(
      host.querySelector<HTMLButtonElement>("[data-sync-run]")?.disabled
    ).toBe(false)

    await act(async () => finishStatus?.(status))
    expect(
      host.querySelector<HTMLElement>("[data-sync-account-summary]")?.dataset
        .syncAccountChecking
    ).toBe("false")
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

    expect(host.textContent).toContain("Sign in")
    expect(host.textContent).not.toContain("Checking Sync")
    expect(host.querySelector(".sync-loading")).toBeNull()
  })

  it("reuses the global account identity while checking a new Space", async () => {
    writeSyncStatusSnapshot("welcome", {
      version: 1,
      status,
      checkedAtMs: Date.now() - 60_000,
    })
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
          cacheKey: "never-opened-space",
          onClose: () => undefined,
        })
      )
    })

    expect(host.textContent).toContain("person@example.com")
    expect(host.textContent).toContain("Checking this Space")
    expect(host.textContent).not.toContain("Local only")
    expect(host.textContent).not.toContain("Manage account")
  })

  it("renders current-Space Sync as a non-modal inspector", async () => {
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
          variant: "inspector",
          onClose: () => undefined,
        })
      )
    })

    expect(host.querySelector(".sync-dialog-backdrop")).toBeNull()
    expect(host.querySelector(".sync-inspector-host")).not.toBeNull()
    expect(host.querySelector("aside")?.getAttribute("role")).toBe(
      "complementary"
    )
    expect(host.querySelector("aside")?.hasAttribute("aria-modal")).toBe(false)
  })

  it("removes cached identity when the secure session is signed out", async () => {
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

    expect(host.textContent).not.toContain("person@example.com")
    expect(host.textContent).not.toContain("Storage")
    expect(
      host.querySelector(".sync-dialog")?.getAttribute("data-sync-can-enable")
    ).toBe("false")
    expect(
      [...host.querySelectorAll("button")].filter(
        (button) => button.textContent?.trim() === "Sign in"
      )
    ).toHaveLength(1)
    const signIn = [...host.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Sign in"
    )
    await act(async () => signIn?.click())
    expect(beginSyncSignIn).toHaveBeenCalledOnce()
  })

  it("delegates access enrollment to eidos.space and refreshes the grant", async () => {
    const accessRequiredStatus: EidosSyncStatus = {
      ...status,
      entitlement: {
        state: "none",
        detail: "No Eidos Sync access grant is attached to this account.",
      },
      remote: { state: "not-connected" },
      canEnable: false,
      canClone: false,
      blocker: { code: "access-required", message: "Sync access is required." },
    }
    const getSyncStatus = vi
      .fn()
      .mockResolvedValueOnce(accessRequiredStatus)
      .mockResolvedValueOnce(status)
    const openSyncHelp = vi.fn().mockResolvedValue(undefined)
    const api = {
      getSyncStatus,
      openSyncHelp,
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

    expect(host.textContent).toContain("Sync access required")
    expect(host.textContent).not.toContain("Storage")
    expect(host.textContent).not.toContain("Details")
    expect(
      host.querySelector(".sync-dialog")?.getAttribute("data-sync-can-enable")
    ).toBe("false")
    const manage = host.querySelector<HTMLButtonElement>(
      "[data-sync-manage-access]"
    )
    expect(manage?.textContent).toContain("Manage Sync access")
    await act(async () => manage?.click())
    expect(openSyncHelp).toHaveBeenCalledWith("sync-access")

    const refresh = host.querySelector<HTMLButtonElement>(
      "[data-sync-check-access]"
    )
    await act(async () => refresh?.click())
    expect(getSyncStatus).toHaveBeenCalledTimes(2)
    expect(host.querySelector("[data-sync-access-gate]")).toBeNull()
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
    expect(host.textContent).toContain("Cloud used")
    expect(host.textContent).toContain("2 GiB")
    expect(host.textContent).toContain("Plan total")
    expect(host.textContent).toContain("10 GiB")
    expect(host.textContent).toContain("You can keep working on this device")
    expect(host.textContent).not.toContain("network offline")
    expect(host.querySelectorAll("[data-sync-run]")).toHaveLength(0)
  })

  it("loads the current Space size independently for an already connected Space", async () => {
    let finishPreflight: ((value: EidosSyncPreflight) => void) | undefined
    const getSyncPreflight = vi.fn(
      () =>
        new Promise<EidosSyncPreflight>((resolve) => {
          finishPreflight = resolve
        })
    )
    const api = {
      getSyncStatus: vi.fn().mockResolvedValue(status),
      getSyncPreflight,
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
          cacheKey: "connected-space",
          onClose: () => undefined,
        })
      )
    })

    const storage = host.querySelector<HTMLElement>(
      "[data-sync-space-size-state]"
    )
    expect(storage?.dataset.syncSpaceSizeState).toBe("loading")
    expect(storage?.textContent).toContain("This Space")
    expect(storage?.textContent).toContain("Calculating")
    expect(storage?.textContent).toContain("Cloud used")
    expect(storage?.textContent).toContain("2 GiB")
    expect(
      storage
        ?.querySelector("[data-sync-storage-segment='cloud-used']")
        ?.getAttribute("data-sync-storage-segment-bytes")
    ).toBe(status.entitlement.usedBytes?.toString())
    expect(
      storage?.querySelector("[data-sync-storage-segment='space']")
    ).toBeNull()
    expect(
      storage
        ?.querySelector("[data-sync-storage-segment='pending']")
        ?.getAttribute("data-sync-storage-segment-bytes")
    ).toBe(status.entitlement.reservedBytes?.toString())

    await act(async () => finishPreflight?.(preflight))

    expect(storage?.dataset.syncSpaceSizeState).toBe("available")
    expect(storage?.dataset.syncSpaceBytes).toBe(
      preflight.totalBytes.toString()
    )
    expect(storage?.textContent).toContain("120 MiB")
    expect(storage?.textContent).toContain("Pending")
    expect(storage?.textContent).toContain("512 MiB · 2.5 GiB projected")
    expect(storage?.textContent).toContain("not its billed cloud contribution")
    expect(storage?.textContent).toContain("history and deduplication")
    expect(
      storage?.querySelector(".sync-storage-header")?.textContent
    ).toContain("2 GiB of 10 GiB used")
    expect(
      storage
        ?.querySelector("[data-sync-storage-segment='cloud-used']")
        ?.getAttribute("data-sync-storage-segment-bytes")
    ).toBe(status.entitlement.usedBytes?.toString())
    const progress = storage?.querySelector<HTMLProgressElement>("progress")
    expect(progress?.value).toBe(status.entitlement.usedBytes)
    expect(progress?.max).toBe(status.entitlement.quotaBytes)
    expect(progress?.getAttribute("aria-label")).toBe(
      "2 GiB of 10 GiB cloud storage used"
    )
    expect(getSyncPreflight).toHaveBeenCalledOnce()
  })

  it("keeps the cached Space size visible while refreshing it", async () => {
    let finishPreflight: ((value: EidosSyncPreflight) => void) | undefined
    writeSyncStatusSnapshot("cached-size-space", {
      version: 1,
      status,
      checkedAtMs: Date.now() - 60_000,
      spaceBytes: preflight.totalBytes,
      spaceSizeCheckedAtMs: Date.now() - 120_000,
    })
    const api = {
      getSyncStatus: vi.fn().mockResolvedValue(status),
      getSyncPreflight: vi.fn(
        () =>
          new Promise<EidosSyncPreflight>((resolve) => {
            finishPreflight = resolve
          })
      ),
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
          cacheKey: "cached-size-space",
          onClose: () => undefined,
        })
      )
    })

    const storage = host.querySelector<HTMLElement>(
      "[data-sync-space-size-state]"
    )
    expect(storage?.dataset.syncSpaceSizeState).toBe("cached")
    expect(storage?.dataset.syncSpaceBytes).toBe(
      preflight.totalBytes.toString()
    )
    expect(storage?.textContent).toContain("120 MiB")
    expect(storage?.textContent).not.toContain("Calculating")

    await act(async () => finishPreflight?.(preflight))
    expect(storage?.dataset.syncSpaceSizeState).toBe("available")
  })

  it("shows cached synced Spaces while refreshing the cloud list", async () => {
    let finishStatus: ((value: EidosSyncStatus) => void) | undefined
    const repositories = {
      namespace: "person",
      repositories: [
        {
          name: "space-id",
          displayName: "Design notes",
          createdAtMs: 100,
          remoteUrl: "https://sync-staging.eidos.space/person/space-id",
        },
      ],
    }
    writeSyncStatusSnapshot("welcome", {
      version: 1,
      status,
      checkedAtMs: Date.now() - 60_000,
      repositories,
      repositoriesCheckedAtMs: Date.now() - 120_000,
    })
    const api = {
      getSyncStatus: vi.fn(
        () =>
          new Promise<EidosSyncStatus>((resolve) => {
            finishStatus = resolve
          })
      ),
      listSyncRepositories: vi.fn(
        () => new Promise<EidosSyncRepositoryList>(() => undefined)
      ),
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
          cacheKey: "welcome",
          onClose: () => undefined,
        })
      )
    })

    expect(host.textContent).toContain("Design notes")
    expect(host.textContent).not.toContain("Loading your synced Spaces")

    await act(async () => finishStatus?.(status))
    expect(host.textContent).toContain("Design notes")
    expect(host.textContent).not.toContain("Loading your synced Spaces")
  })

  it("makes opaque cloud repositories recognizable and searchable", async () => {
    const opaqueNames = Array.from(
      { length: 8 },
      (_, index) => `${index.toString(16)}${"a".repeat(31)}`
    )
    writeSyncStatusSnapshot("repository-names", {
      version: 1,
      status,
      checkedAtMs: Date.now() - 60_000,
      repositoriesCheckedAtMs: Date.now() - 120_000,
      repositories: {
        namespace: "person",
        repositories: [
          ...opaqueNames.map((name, index) => ({
            name,
            displayName: name,
            createdAtMs: index + 1,
            remoteUrl: `https://sync-staging.eidos.space/person/${name}`,
          })),
          {
            name: "design-notes-id",
            displayName: "Design notes",
            createdAtMs: 20,
            remoteUrl:
              "https://sync-staging.eidos.space/person/design-notes-id",
          },
        ],
      },
    })
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
          mode: "clone",
          cacheKey: "repository-names",
          onClose: () => undefined,
        })
      )
    })

    const repositoryButtons = [
      ...host.querySelectorAll<HTMLElement>("[data-sync-open-space]"),
    ]
    expect(repositoryButtons[0]?.dataset.syncOpenSpace).toBe("Design notes")
    expect(repositoryButtons[1]?.dataset.syncOpenSpace).toBe("Unnamed Space")
    expect(host.querySelector('input[type="search"]')).not.toBeNull()
    expect(host.textContent).toContain("Cloud list updated")
  })

  it("keeps an oversized local Space separate from the cloud used bar", async () => {
    const oversizedPreflight: EidosSyncPreflight = {
      ...preflight,
      totalBytes: 21_474_836_480,
    }
    const api = {
      getSyncStatus: vi.fn().mockResolvedValue(status),
      getSyncPreflight: vi.fn().mockResolvedValue(oversizedPreflight),
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

    const storage = host.querySelector<HTMLElement>("[data-sync-storage-used]")
    expect(
      storage
        ?.querySelector("[data-sync-storage-segment='cloud-used']")
        ?.getAttribute("data-sync-storage-segment-bytes")
    ).toBe(status.entitlement.usedBytes?.toString())
    expect(
      storage?.querySelector("[data-sync-storage-segment='space']")
    ).toBeNull()
    expect(storage?.textContent).toContain("This Space on this device")
    expect(storage?.textContent).toContain("20 GiB")
    expect(storage?.textContent).toContain("not its billed cloud contribution")
    const progress = storage?.querySelector<HTMLProgressElement>("progress")
    expect(progress?.value).toBe(status.entitlement.usedBytes)
    expect(progress?.max).toBe(status.entitlement.quotaBytes)
  })

  it("degrades only the current Space size when its local scan fails", async () => {
    const api = {
      getSyncStatus: vi.fn().mockResolvedValue(status),
      getSyncPreflight: vi
        .fn()
        .mockRejectedValue(new Error("local scan unavailable")),
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

    const storage = host.querySelector<HTMLElement>(
      "[data-sync-space-size-state]"
    )
    expect(storage?.dataset.syncSpaceSizeState).toBe("unavailable")
    expect(
      storage?.querySelector("[data-sync-space-size]")?.textContent
    ).toContain("Unavailable")
    expect(storage?.textContent).toContain("Cloud used")
    expect(storage?.textContent).toContain("2 GiB")
    expect(host.querySelector("[data-sync-run]")).not.toBeNull()
    expect(host.textContent).not.toContain("Sync couldn’t be checked")
  })

  it("shows a truthful sub-one-percent label without inflating the progress value", async () => {
    const tinyUsageStatus: EidosSyncStatus = {
      ...status,
      entitlement: {
        ...status.entitlement,
        usedBytes: 1_048_576,
        reservedBytes: 0,
        remainingBytes: 10_736_369_664,
      },
    }
    const api = {
      getSyncStatus: vi.fn().mockResolvedValue(tinyUsageStatus),
      getSyncPreflight: vi.fn().mockResolvedValue(preflight),
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

    const storage = host.querySelector<HTMLElement>("[data-sync-storage-used]")
    expect(storage?.textContent).toContain("<1% used")
    expect(storage?.textContent).not.toContain("0% used")
    const progress = storage?.querySelector<HTMLProgressElement>("progress")
    expect(progress?.value).toBe(1_048_576)
    expect(progress?.max).toBe(10_737_418_240)
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
    expect(storage?.dataset.syncStorageState).toBe("warning")
    expect(storage?.textContent).toContain("Cloud used")
    expect(storage?.textContent).toContain("9.5 GiB")
    expect(storage?.textContent).toContain("Plan total")
    expect(storage?.textContent).toContain("10 GiB")
    expect(storage?.textContent).toContain("512 MiB available")

    const manage = host.querySelector<HTMLButtonElement>(
      "[data-sync-manage-storage]"
    )
    await act(async () => {
      manage?.dispatchEvent(new MouseEvent("click", { bubbles: true }))
    })
    expect(openSyncHelp).toHaveBeenCalledWith("account")
  })

  it("marks a pending upload that would exceed the plan without inflating the used bar", async () => {
    const projectedOverStatus: EidosSyncStatus = {
      ...status,
      entitlement: {
        ...status.entitlement,
        usedBytes: 10_200_547_328,
        reservedBytes: 1_073_741_824,
        remainingBytes: 0,
      },
    }
    const api = {
      getSyncStatus: vi.fn().mockResolvedValue(projectedOverStatus),
      getSyncPreflight: vi.fn().mockResolvedValue(preflight),
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

    const overview = host.querySelector<HTMLElement>("[data-sync-overview]")
    expect(overview?.dataset.syncOverview).toBe("danger")
    expect(overview?.textContent).toContain("Pending upload exceeds your plan")
    const storage = host.querySelector<HTMLElement>("[data-sync-storage-state]")
    expect(storage?.dataset.syncStorageState).toBe("over")
    expect(storage?.textContent).toContain("Pending")
    expect(storage?.textContent).toContain("1 GiB · 10.5 GiB projected")
    expect(storage?.textContent).toContain("512 MiB over plan")
    expect(
      storage
        ?.querySelector("[data-sync-storage-segment='pending']")
        ?.getAttribute("data-sync-storage-segment-bytes")
    ).toBe("536870912")
    expect(storage?.querySelector<HTMLProgressElement>("progress")?.value).toBe(
      projectedOverStatus.entitlement.usedBytes
    )
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
    expect(overview?.textContent).toContain("Save a version before uploading")
    expect(overview?.textContent).toContain("aren’t part of a saved version")
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
    const storage = host.querySelector("[data-sync-storage-used]")
    expect(storage?.textContent).toContain("Cloud used")
    expect(storage?.textContent).toContain("2 GiB")
    expect(storage?.textContent).toContain("Plan total")
    expect(storage?.textContent).toContain("10 GiB")

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

  it("does not call a gateway upload limit full cloud storage", async () => {
    const uploadTooLarge = {
      ...failureResponse,
      failure: {
        code: "upload-too-large",
        state: "needs-attention",
        title: "This upload is too large",
        message:
          "Eidos Sync could not accept this upload yet. Keep working locally; your files and checkpoints remain safe.",
        action: "work-locally",
        actionLabel: "Keep working locally",
        retryable: false,
        localSafe: true,
        status: 413,
      },
    } satisfies EidosSyncRunResponse
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncStatus: vi.fn().mockResolvedValue(status),
        getSyncQueueStatus: vi.fn().mockResolvedValue(null),
        runSync: vi.fn().mockResolvedValue(uploadTooLarge),
        onSyncProgress: vi.fn().mockReturnValue(() => undefined),
        onSyncQueueChanged: vi.fn().mockReturnValue(() => undefined),
      } as unknown as EidosLiteApi,
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

    const failure = host.querySelector<HTMLElement>("[data-sync-failure]")
    expect(failure?.dataset.syncFailure).toBe("upload-too-large")
    expect(failure?.textContent).toContain("This upload is too large")
    expect(failure?.textContent).toContain("Local files safe")
    expect(failure?.textContent).not.toMatch(
      /storage is full|increase your limit/i
    )
    expect(
      host.querySelector("[data-sync-storage-used]")?.textContent
    ).toContain("2 GiB")
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
    const getSyncPreflight = vi.fn().mockResolvedValue(preflight)
    const api = {
      getSyncStatus: vi.fn().mockResolvedValue(status),
      getSyncPreflight,
      getSyncQueueStatus: vi.fn().mockResolvedValue(null),
      listSyncRepositories: vi.fn().mockResolvedValue({
        namespace: "person",
        repositories: [
          {
            name: "7f4fd60c",
            displayName: "Research",
            createdAtMs: 100,
            remoteUrl: "https://sync-staging.eidos.space/person/7f4fd60c",
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
    expect(getSyncPreflight).not.toHaveBeenCalled()
    expect(host.querySelector("[data-sync-space-size-state]")).toBeNull()
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
    expect(cloneSyncRepository).toHaveBeenCalledWith(
      "https://sync-staging.eidos.space/person/7f4fd60c",
      "Research"
    )
    expect(progress?.textContent).toContain("Downloading files from the cloud")
    expect(progress?.textContent).not.toContain("Remote URL")
    expect(host.querySelector("[data-sync-overview]")?.textContent).toContain(
      "Opening Research"
    )
    expect(
      host.querySelector("[data-sync-overview]")?.textContent
    ).not.toContain("7f4fd60c")

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
      "Latest saved version is in the cloud"
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
