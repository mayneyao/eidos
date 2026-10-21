// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"

import type {
  EidosLiteApi,
  EidosSyncPreflight,
  EidosSyncProgress,
  EidosSyncRepositoryList,
  EidosSyncRunResponse,
  EidosSyncStatus,
  SpaceSnapshot,
} from "../shared/contracts"
import { SyncLocalVersionGate, SyncPanel } from "./sync-panel"
import {
  readSyncStatusSnapshot,
  writeSyncStatusSnapshot,
} from "./sync-status-cache"

const status: EidosSyncStatus = {
  defaultPasswordConfigured: true,
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
      relativePath: "generated/tracked.txt",
      size: 42,
      concerns: ["tracked-ignored"],
    },
  ],
  blockers: [],
}

describe("SyncPanel failure states", () => {
  it("requires local versioning before cloud sync", () => {
    const markup = renderToStaticMarkup(
      createElement(SyncLocalVersionGate, {
        variant: "inspector",
        platform: "darwin",
        onClose: () => undefined,
        onOpenVersions: () => undefined,
      })
    )
    expect(markup).toContain('data-sync-local-versions="required"')
    expect(markup).toContain("Enable local versions first")
    expect(markup).toContain("data-sync-open-versions")
    expect(markup).toContain("Open Versions")
    expect(markup).not.toContain("Connect this Space")
  })
  let root: Root
  let host: HTMLDivElement

  it("keeps setup and disconnect available for an unfinished enrollment", async () => {
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncStatus: vi.fn().mockResolvedValue({
          ...status,
          remote: { state: "not-connected" },
          canEnable: true,
        }),
        getSyncPreflight: vi.fn().mockResolvedValue(preflight),
        getSyncQueueStatus: vi.fn().mockResolvedValue(null),
        onSyncProgress: () => () => {},
        onSyncQueueChanged: () => () => {},
      },
    })
    await act(async () =>
      root.render(
        createElement(SyncPanel, {
          mode: "enable",
          platform: "darwin",
          variant: "inspector",
          hasCloudConnection: true,
          onClose() {},
        })
      )
    )
    expect(host.querySelector("[data-sync-disconnect]")).not.toBeNull()
    expect(host.querySelector("[data-sync-enable]")).not.toBeNull()
  })

  it("keeps local disconnect available when account and cloud services are offline", async () => {
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncStatus: vi
          .fn()
          .mockRejectedValue(new Error("The service could not be reached")),
        getSyncQueueStatus: vi.fn().mockResolvedValue(null),
        onSyncProgress: () => () => {},
        onSyncQueueChanged: () => () => {},
      },
    })
    await act(async () =>
      root.render(
        createElement(SyncPanel, {
          mode: "enable",
          platform: "darwin",
          variant: "inspector",
          onClose() {},
          syncHistory: { state: "unknown", ahead: 0, behind: 0 },
        })
      )
    )
    expect(host.querySelector("[data-sync-disconnect]")).not.toBeNull()
    expect(
      host.querySelector<HTMLButtonElement>("[data-sync-disconnect]")!.disabled
    ).toBe(false)
  })

  it.each([true, false])(
    "disconnects only after confirmation succeeds (%s), retaining the Space",
    async (confirmed) => {
      const disconnectedSnapshot = {
        id: "same-space",
        displayPath: "/same/folder",
        graft: { initialized: true, clean: false },
      } as SpaceSnapshot
      const disconnectSync = vi
        .fn()
        .mockResolvedValue(confirmed ? disconnectedSnapshot : null)
      const onSpaceChange = vi.fn()
      const nextStatus = {
        ...status,
        remote: { state: "not-connected" as const },
        canEnable: true,
      }
      const getSyncStatus = vi
        .fn()
        .mockResolvedValueOnce(status)
        .mockResolvedValue(confirmed ? nextStatus : status)
      Object.defineProperty(window, "eidosLite", {
        configurable: true,
        value: {
          getSyncStatus,
          disconnectSync,
          getSyncPreflight: vi.fn().mockResolvedValue(preflight),
          getSyncQueueStatus: vi.fn().mockResolvedValue(null),
          onSyncProgress: () => () => {},
          onSyncQueueChanged: () => () => {},
        },
      })
      await act(async () =>
        root.render(
          createElement(SyncPanel, {
            platform: "darwin",
            mode: "enable",
            variant: "inspector",
            onClose() {},
            onSpaceChange,
            syncHistory: { state: "ahead", ahead: 2, behind: 0 },
          })
        )
      )
      await act(async () =>
        host.querySelector<HTMLButtonElement>("[data-sync-disconnect]")!.click()
      )
      expect(disconnectSync).toHaveBeenCalledOnce()
      if (confirmed) {
        expect(onSpaceChange).toHaveBeenCalledWith(disconnectedSnapshot)
        expect(host.querySelector("[data-sync-disconnect]")).toBeNull()
        expect(host.textContent).toContain("Connect this Space")
      } else {
        expect(onSpaceChange).not.toHaveBeenCalled()
        expect(host.querySelector("[data-sync-disconnect]")).not.toBeNull()
      }
    }
  )

  it.each([true, false])(
    "unlocks a connected inspector without device choices (secure storage=%s)",
    async (secureStorage) => {
      const remembered = {
        ...status,
        deviceUnlockAvailable: secureStorage,
        encryption: { state: "unlocked" as const, remembered: true },
      }
      let finish: ((value: EidosSyncStatus) => void) | undefined
      const unlockSync = vi.fn(
        (_input: Parameters<EidosLiteApi["unlockSync"]>[0]) =>
          new Promise<EidosSyncStatus>((resolve) => {
            finish = resolve
          })
      )
      Object.defineProperty(window, "eidosLite", {
        configurable: true,
        value: {
          getSyncStatus: vi.fn().mockResolvedValue({
            ...remembered,
            encryption: { state: "locked", remembered: false },
          }),
          getSyncQueueStatus: vi.fn().mockResolvedValue(null),
          onSyncProgress: vi.fn().mockReturnValue(() => undefined),
          onSyncQueueChanged: vi.fn().mockReturnValue(() => undefined),
          unlockSync,
        },
      })
      await act(async () =>
        root.render(
          createElement(SyncPanel, {
            platform: "darwin",
            mode: "enable",
            variant: "inspector",
            onClose() {},
            syncHistory: {
              state: "up_to_date",
              ahead: 0,
              behind: 0,
              checkedAtMs: Date.now(),
            },
          })
        )
      )
      expect(host.querySelector("[data-sync-unlock]")).not.toBeNull()
      expect(host.querySelector("input[type=checkbox]")).toBeNull()
      expect(host.textContent).toContain(
        secureStorage
          ? "Saved securely on this device"
          : "Enter the password again after restarting."
      )
      expect(
        host.querySelector(".sync-inspector-b-status h2")?.textContent
      ).toBe("Encrypted Sync is locked")
      expect(host.querySelector("[data-sync-next]")).toBeNull()
      const password = host.querySelector<HTMLInputElement>(
        "[data-sync-unlock] input[type=password]"
      )!
      expect(password).not.toBeNull()
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value"
        )!.set!.call(password, "synthetic test password")
        password.dispatchEvent(new Event("input", { bubbles: true }))
      })
      await act(async () =>
        [...host.querySelectorAll("button")]
          .find((button) => button.textContent === "Unlock Sync")!
          .click()
      )
      expect(unlockSync).toHaveBeenCalledOnce()
      const request = unlockSync.mock.calls[0]![0]
      expect(new TextDecoder().decode(request.password)).toBe(
        "synthetic test password"
      )
      expect(request.remember === true).toBe(secureStorage)
      expect(host.querySelector("progress")).toBeNull()
      expect(host.querySelector("[data-sync-next]")).toBeNull()
      expect(
        [...host.querySelectorAll("button")].find(
          (button) => button.textContent === "Unlocking Sync…"
        )?.disabled
      ).toBe(true)
      await act(async () => finish?.(remembered))
      expect(request.password.every((byte) => byte === 0)).toBe(true)
      expect(host.querySelector("input[type=password]")).toBeNull()
      expect(host.querySelector("[data-sync-unlock]")).toBeNull()
      expect(host.querySelector("[data-sync-next]")).not.toBeNull()
    }
  )

  it("preserves an existing connection without offering retries against it", async () => {
    const onClose = vi.fn()
    const enableSync = vi.fn().mockResolvedValue({
      ...failureResponse,
      failure: {
        code: "remote-already-configured",
        state: "needs-attention",
        title: "This Space already has a cloud connection",
        message:
          "Its existing connection and local history have been preserved. Use an independent copy to set up encrypted Sync.",
        action: "work-locally",
        actionLabel: "Keep working locally",
        retryable: false,
        localSafe: true,
      },
    })
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncStatus: vi.fn().mockResolvedValue({
          ...status,
          remote: { state: "not-connected" },
          canEnable: true,
        }),
        getSyncPreflight: vi
          .fn()
          .mockResolvedValue({ ...preflight, warningCount: 0, warnings: [] }),
        getSyncQueueStatus: vi.fn().mockResolvedValue(null),
        onSyncProgress: vi.fn().mockReturnValue(() => undefined),
        onSyncQueueChanged: vi.fn().mockReturnValue(() => undefined),
        enableSync,
      },
    })
    await act(async () =>
      root.render(
        createElement(SyncPanel, {
          platform: "darwin",
          mode: "enable",
          onClose,
        })
      )
    )
    await act(async () =>
      host.querySelector<HTMLButtonElement>("[data-sync-enable]")!.click()
    )
    expect(host.querySelector("[data-sync-failure]")?.textContent).toContain(
      "independent copy"
    )
    expect(host.querySelector("[data-sync-failure-retry]")).toBeNull()
    expect(host.querySelector("[data-sync-check-remote]")).toBeNull()
    const continueLocally = [...host.querySelectorAll("button")].find(
      (button) => button.textContent === "Keep working locally"
    )!
    await act(async () => continueLocally.click())
    expect(onClose).toHaveBeenCalledOnce()
    expect(enableSync).toHaveBeenCalledOnce()
  })

  it("connects using the configured default without rendering or sending a password", async () => {
    const enableSync = vi
      .fn()
      .mockResolvedValue({ ok: true, status, telemetry: { phases: [] } })
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncStatus: vi.fn().mockResolvedValue({
          ...status,
          remote: { state: "not-connected" },
          canEnable: true,
        }),
        getSyncPasswordSettings: vi
          .fn()
          .mockResolvedValue({ available: true, configured: true }),
        getSyncPreflight: vi
          .fn()
          .mockResolvedValue({ ...preflight, warnings: [], warningCount: 0 }),
        getSyncQueueStatus: vi.fn().mockResolvedValue(null),
        onSyncProgress: vi.fn().mockReturnValue(() => undefined),
        onSyncQueueChanged: vi.fn().mockReturnValue(() => undefined),
        enableSync,
      },
    })
    await act(async () =>
      root.render(
        createElement(SyncPanel, {
          platform: "darwin",
          mode: "enable",
          onClose() {},
        })
      )
    )
    expect(host.querySelector("input[type=password]")).toBeNull()
    expect(host.textContent).toContain("End-to-end encrypted")
    expect(host.querySelector(".sync-password-options")).toBeNull()
    expect(host.querySelector("input[type=checkbox]")).toBeNull()
    await act(async () =>
      host.querySelector<HTMLButtonElement>("[data-sync-enable]")!.click()
    )
    expect(enableSync).toHaveBeenCalledWith({
      manifestId: preflight.manifestId,
    })
  })

  it("keeps a known configured password when the local status refresh fails", async () => {
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncStatus: async () => ({
          ...status,
          remote: { state: "not-connected" },
          canEnable: true,
        }),
        getSyncPasswordSettings: async () => {
          throw new Error("secure storage busy")
        },
        getSyncPreflight: async () => preflight,
        getSyncQueueStatus: async () => null,
        onSyncProgress: () => () => {},
        onSyncQueueChanged: () => () => {},
      },
    })
    await act(async () =>
      root.render(
        createElement(SyncPanel, {
          mode: "enable",
          platform: "darwin",
          onClose() {},
        })
      )
    )
    expect(host.querySelector('input[type="password"]')).toBeNull()
    expect(
      host.querySelector<HTMLButtonElement>("[data-sync-enable]")!.disabled
    ).toBe(false)
  })

  it.each(["staging", "production"] as const)(
    "offers first-time password setup in %s without encryption choices or a settings detour",
    async (environment) => {
      const openSettingsDestination = vi.fn()
      Object.defineProperty(window, "eidosLite", {
        configurable: true,
        value: {
          getSyncStatus: vi.fn().mockResolvedValue({
            ...status,
            environment,
            remote: { state: "not-connected" },
            canEnable: true,
          }),
          getSyncPasswordSettings: vi
            .fn()
            .mockResolvedValue({ available: true, configured: false }),
          getSyncPreflight: vi
            .fn()
            .mockResolvedValue({ ...preflight, warnings: [], warningCount: 0 }),
          getSyncQueueStatus: vi.fn().mockResolvedValue(null),
          onSyncProgress: vi.fn().mockReturnValue(() => undefined),
          onSyncQueueChanged: vi.fn().mockReturnValue(() => undefined),
          openSettingsDestination,
        },
      })
      await act(async () =>
        root.render(
          createElement(SyncPanel, {
            platform: "darwin",
            mode: "enable",
            onClose() {},
          })
        )
      )
      expect(
        host.querySelector<HTMLButtonElement>("[data-sync-enable]")!.disabled
      ).toBe(true)
      expect(host.querySelectorAll("input[type=password]")).toHaveLength(2)
      expect(host.querySelector("input[type=checkbox]")).toBeNull()
      expect(openSettingsDestination).not.toHaveBeenCalled()
    }
  )

  it.each([
    { platform: "darwin", secureStorage: false },
    { platform: "darwin", secureStorage: true },
    { platform: "win32", secureStorage: false },
  ])(
    "requires matching passwords on $platform and saves only with secure storage (available=$secureStorage)",
    async ({ platform, secureStorage }) => {
      const available = {
        ...status,
        environment: platform === "win32" ? "production" : status.environment,
        defaultPasswordConfigured: false,
        remote: { state: "not-connected" as const },
        canEnable: true,
        deviceUnlockAvailable: secureStorage,
      }
      let suppliedPassword = ""
      let savedPassword: Uint8Array | undefined
      const saveDefaultSyncPassword = vi.fn(
        async (input: { password: Uint8Array }) => {
          savedPassword = input.password
          suppliedPassword = new TextDecoder().decode(input.password)
        }
      )
      const enableSync = vi.fn(
        async (_approval, encryption?: { password: Uint8Array }) => {
          if (encryption)
            suppliedPassword = new TextDecoder().decode(encryption.password)
          return {
            ok: true,
            status: { ...status, encryption: { state: "unlocked" } },
            telemetry: {
              phases: [],
              startedAtMs: 1,
              completedAtMs: 2,
              durationMs: 1,
            },
          }
        }
      )
      Object.defineProperty(window, "eidosLite", {
        configurable: true,
        value: {
          getSyncStatus: vi.fn().mockResolvedValue(available),
          getSyncPreflight: vi
            .fn()
            .mockResolvedValue({ ...preflight, warningCount: 0, warnings: [] }),
          getSyncQueueStatus: vi.fn().mockResolvedValue(null),
          onSyncProgress: vi.fn().mockReturnValue(() => undefined),
          onSyncQueueChanged: vi.fn().mockReturnValue(() => undefined),
          enableSync,
          saveDefaultSyncPassword,
        },
      })
      await act(async () =>
        root.render(
          createElement(SyncPanel, {
            platform,
            mode: "enable",
            onClose() {},
          })
        )
      )
      expect(host.querySelector(".sync-setup-note")?.textContent).toContain(
        "Enter matching sync passwords to continue."
      )
      expect(host.querySelectorAll("input[type=checkbox]")).toHaveLength(0)
      expect(host.textContent).toContain(
        secureStorage
          ? "Saved securely on this device"
          : "Enter the password again after restarting."
      )
      const passwords = host.querySelectorAll<HTMLInputElement>(
        "[data-sync-password-setup] input[type=password]"
      )
      const enter = async (input: HTMLInputElement, value: string) =>
        act(async () => {
          Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
          )!.set!.call(input, value)
          input.dispatchEvent(new Event("input", { bubbles: true }))
        })
      await enter(passwords[0]!, "synthetic sync password")
      await enter(passwords[1]!, "different")
      expect(
        host.querySelector<HTMLButtonElement>("[data-sync-enable]")!.disabled
      ).toBe(true)
      await enter(passwords[1]!, "synthetic sync password")
      const enable =
        host.querySelector<HTMLButtonElement>("[data-sync-enable]")!
      expect(enable.disabled).toBe(false)
      await act(async () => {
        if (secureStorage)
          passwords[1]!.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "Enter",
              bubbles: true,
              cancelable: true,
            })
          )
        else enable.click()
      })
      expect(suppliedPassword).toBe("synthetic sync password")
      if (secureStorage) {
        expect(saveDefaultSyncPassword).toHaveBeenCalledOnce()
        expect(savedPassword?.every((byte) => byte === 0)).toBe(true)
        expect(enableSync.mock.calls[0]![1]).toBeUndefined()
      } else {
        expect(saveDefaultSyncPassword).not.toHaveBeenCalled()
        expect(enableSync.mock.calls[0]![1]).not.toHaveProperty(
          "remember",
          true
        )
        expect(
          enableSync.mock.calls[0]![1]?.password.every((byte) => byte === 0)
        ).toBe(true)
      }
      expect(passwords[0]!.value).toBe("")
      expect(passwords[1]!.value).toBe("")
    }
  )

  it("does not connect if the first sync password could not be saved", async () => {
    const enableSync = vi.fn()
    const saveDefaultSyncPassword = vi
      .fn()
      .mockRejectedValue(new Error("secure storage busy"))
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncStatus: vi.fn().mockResolvedValue({
          ...status,
          defaultPasswordConfigured: false,
          deviceUnlockAvailable: true,
          remote: { state: "not-connected" },
          canEnable: true,
        }),
        getSyncQueueStatus: vi.fn().mockResolvedValue(null),
        getSyncPreflight: vi.fn().mockResolvedValue(preflight),
        onSyncProgress: vi.fn().mockReturnValue(() => undefined),
        onSyncQueueChanged: vi.fn().mockReturnValue(() => undefined),
        saveDefaultSyncPassword,
        enableSync,
      },
    })
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      await act(async () =>
        root.render(
          createElement(SyncPanel, {
            platform: "darwin",
            mode: "enable",
            onClose() {},
          })
        )
      )
      await act(async () => {
        for (const field of host.querySelectorAll<HTMLInputElement>(
          "input[type=password]"
        )) {
          Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
          )!.set!.call(field, "synthetic setup password")
          field.dispatchEvent(new Event("input", { bubbles: true }))
        }
      })
      await act(async () =>
        host.querySelector<HTMLButtonElement>("[data-sync-enable]")!.click()
      )
      expect(saveDefaultSyncPassword).toHaveBeenCalledOnce()
      expect(enableSync).not.toHaveBeenCalled()
      expect(host.textContent).toContain("Could not save the sync password")
      expect(
        host.querySelector<HTMLInputElement>("input[type=password]")?.value
      ).toBe("")
    } finally {
      errorLog.mockRestore()
    }
  })

  it("opens an existing encrypted Space with its own password after the saved password fails", async () => {
    const repository = {
      name: "old-space",
      displayName: "Old notes",
      createdAtMs: 1,
      remoteUrl: "https://sync-staging.eidos.space/person/old-space",
      encryption: {
        profile: "encrypted-remote-v1",
        version: 1,
        suite: 1,
        uuid: "2f94f4c8-705b-4b5f-9808-84e0d1c394ee",
      },
    }
    const cloneSyncRepository = vi
      .fn()
      .mockResolvedValueOnce({
        ...failureResponse,
        failure: {
          ...failureResponse.failure,
          code: "encryption-locked",
          action: "work-locally",
          actionLabel: "Keep working locally",
        },
      })
      .mockResolvedValue({
        ok: true,
        snapshot: null,
        telemetry: { phases: [] },
      })
    const unlockSync = vi.fn()
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncStatus: vi.fn().mockResolvedValue({
          ...status,
          deviceUnlockAvailable: true,
          encryption: { state: "unlocked", remembered: true },
        }),
        getSyncQueueStatus: vi.fn().mockResolvedValue(null),
        listSyncRepositories: vi.fn().mockResolvedValue({
          namespace: "person",
          repositories: [repository],
        }),
        onSyncProgress: vi.fn().mockReturnValue(() => undefined),
        onSyncQueueChanged: vi.fn().mockReturnValue(() => undefined),
        cloneSyncRepository,
        unlockSync,
      },
    })
    await act(async () =>
      root.render(
        createElement(SyncPanel, {
          platform: "darwin",
          mode: "clone",
          onClose() {},
        })
      )
    )
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[data-sync-open-space="Old notes"]')!
        .click()
    )
    expect(host.textContent).toContain("Could not unlock this Space")
    expect(host.textContent).toContain(
      "Try the password used when Sync was enabled."
    )
    expect(host.querySelector("[data-sync-failure-retry]")).toBeNull()
    expect(host.textContent).not.toContain("Unlock Sync")
    const field = host.querySelector<HTMLInputElement>("input[type=password]")!
    expect(document.activeElement).toBe(field)
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )!.set!.call(field, "old synthetic password")
      field.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () =>
      [...host.querySelectorAll("button")]
        .find((button) => button.textContent === "Open Space")!
        .click()
    )
    expect(cloneSyncRepository).toHaveBeenCalledTimes(2)
    expect(cloneSyncRepository.mock.calls[1]![2].remember).toBe(true)
    expect(
      cloneSyncRepository.mock.calls[1]![2].password.every(
        (byte: number) => byte === 0
      )
    ).toBe(true)
    expect(field.value).toBe("")
    expect(unlockSync).not.toHaveBeenCalled()
  })

  it("does not offer encrypted preview creation in production", async () => {
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncStatus: vi.fn().mockResolvedValue({
          ...status,
          environment: "production",
          remote: { state: "not-connected" },
          canEnable: true,
        }),
        getSyncPreflight: vi.fn().mockResolvedValue(preflight),
        getSyncQueueStatus: vi.fn().mockResolvedValue(null),
        onSyncProgress: vi.fn().mockReturnValue(() => undefined),
        onSyncQueueChanged: vi.fn().mockReturnValue(() => undefined),
      },
    })
    await act(async () =>
      root.render(
        createElement(SyncPanel, {
          platform: "darwin",
          mode: "enable",
          onClose() {},
        })
      )
    )
    expect(host.querySelector(".sync-encryption")).toBeNull()
  })

  it.each(["dialog", "inspector"] as const)(
    "keeps ready Sync free of device management in the %s",
    async (variant) => {
      const remembered: EidosSyncStatus = {
        ...status,
        deviceUnlockAvailable: true,
        encryption: { state: "unlocked", remembered: true },
      }
      const forgetSyncUnlock = vi.fn()
      Object.defineProperty(window, "eidosLite", {
        configurable: true,
        value: {
          getSyncStatus: vi.fn().mockResolvedValue(remembered),
          getSyncQueueStatus: vi.fn().mockResolvedValue(null),
          onSyncProgress: vi.fn().mockReturnValue(() => undefined),
          onSyncQueueChanged: vi.fn().mockReturnValue(() => undefined),
          forgetSyncUnlock,
        },
      })
      await act(async () =>
        root.render(
          createElement(SyncPanel, {
            platform: "darwin",
            mode: "enable",
            variant,
            onClose() {},
          })
        )
      )
      expect(host.textContent).not.toMatch(
        /Forget this device|Remember on this device|Encryption & device|Unlock Sync/
      )
      expect(host.querySelector("[data-sync-unlock]")).toBeNull()
      expect(forgetSyncUnlock).not.toHaveBeenCalled()
    }
  )

  it("keeps a failed password save visible while Sync is unlocked", async () => {
    const rememberError =
      "Could not update remembered unlock. Check this device's secure storage before restarting."
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncStatus: vi.fn().mockResolvedValue({
          ...status,
          encryption: { state: "unlocked", remembered: false, rememberError },
        }),
        getSyncQueueStatus: vi.fn().mockResolvedValue(null),
        onSyncProgress: vi.fn().mockReturnValue(() => undefined),
        onSyncQueueChanged: vi.fn().mockReturnValue(() => undefined),
      },
    })
    await act(async () =>
      root.render(
        createElement(SyncPanel, {
          platform: "darwin",
          mode: "enable",
          variant: "inspector",
          onClose() {},
        })
      )
    )
    expect(host.querySelector("[role=alert]")?.textContent).toBe(rememberError)
    expect(host.querySelector("input[type=password]")).toBeNull()
    expect(host.querySelector("[data-sync-next]")).not.toBeNull()
  })

  it("keeps remote checks and uploads available with unsaved local changes", async () => {
    const runSync = vi.fn().mockResolvedValue({
      ...conflictResponse,
      result: { ...conflictResponse.result, state: "checked" },
    })
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncStatus: vi.fn().mockResolvedValue(status),
        getSyncQueueStatus: vi.fn().mockResolvedValue(null),
        onSyncProgress: vi.fn().mockReturnValue(() => undefined),
        onSyncQueueChanged: vi.fn().mockReturnValue(() => undefined),
        runSync,
      },
    })
    await act(async () =>
      root.render(
        createElement(SyncPanel, {
          platform: "darwin",
          mode: "enable",
          hasUncheckpointedChanges: true,
          syncHistory: {
            state: "ahead",
            ahead: 2,
            behind: 0,
            checkedAtMs: Date.now(),
          },
          onClose: () => undefined,
        })
      )
    )
    const upload = host.querySelector<HTMLButtonElement>("[data-sync-push]")!
    expect(upload.disabled).toBe(false)
    expect(upload.hidden).toBe(false)
    expect(
      host.querySelector<HTMLButtonElement>("[data-sync-pull]")?.hidden
    ).toBe(true)
    expect(
      host.querySelector<HTMLDetailsElement>("[data-sync-version-summary]")
        ?.open
    ).toBe(false)
    expect(
      host.querySelector<HTMLDetailsElement>(".sync-account-details")?.open
    ).toBe(false)
    expect(
      host.querySelector<HTMLButtonElement>("[data-sync-pull]")?.disabled
    ).toBe(true)
    await act(async () => upload.click())
    expect(runSync).toHaveBeenLastCalledWith("push")
    await act(async () =>
      host.querySelector<HTMLButtonElement>("[data-sync-run]")!.click()
    )
    expect(runSync).toHaveBeenLastCalledWith("fetch")
    expect(host.textContent).not.toContain("Everything is up to date")
  })

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
          platform: "win32",
          onClose: () => undefined,
        })
      )
    })

    expect(host.querySelector("[data-sync-overview]")).toBeNull()
    expect(
      host.querySelector(".sync-dialog-backdrop")?.getAttribute("data-platform")
    ).toBe("win32")
    expect(host.textContent).toContain("Sync couldn’t be checked")
    expect(host.textContent).toContain("Try again")
    expect(host.querySelector("[data-sync-sign-in]")).toBeNull()
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
          platform: "darwin",
          mode: "enable",
          cacheKey: "space-1",
          onClose: () => undefined,
        })
      )
    })

    expect(host.textContent).toContain("person@example.com")
    expect(host.textContent).toContain("Checking this Space")
    expect(host.textContent).not.toContain("Last synced 2m ago")
    expect(host.textContent).toContain("Remote history has not been checked.")
    const storage = host.querySelector<HTMLElement>("[data-sync-storage-used]")
    expect(storage?.textContent).toContain("2 GiB of 10 GiB")
    expect(storage?.textContent).toContain("Cloud used")
    expect(storage?.textContent).toContain("Plan total")
    expect(storage?.textContent).toContain("10 GiB")
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

  it("retries a first-load network failure without claiming the user is signed out", async () => {
    const getSyncStatus = vi
      .fn()
      .mockRejectedValueOnce(new Error("network offline"))
      .mockResolvedValue({ ...status, account: { state: "signed-out" } })
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncStatus,
        getSyncQueueStatus: async () => null,
        onSyncProgress: () => () => {},
        onSyncQueueChanged: () => () => {},
      },
    })
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      await act(async () =>
        root.render(
          createElement(SyncPanel, {
            mode: "enable",
            platform: "darwin",
            onClose() {},
          })
        )
      )
      expect(host.querySelector('[role="alert"]')?.textContent).toContain(
        "Sync could not be reached"
      )
      expect(host.textContent).not.toContain("Showing the last known")
      expect(host.querySelector("[data-sync-sign-in]")).toBeNull()
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>("[data-sync-check-access]")!
          .click()
      )
      expect(host.querySelector("[data-sync-sign-in]")).not.toBeNull()
      expect(host.querySelector('[role="alert"]')).toBeNull()
    } finally {
      errorLog.mockRestore()
    }
  })

  it("discards a previous account's delayed Space list", async () => {
    let accountChanged!: Parameters<EidosLiteApi["onAccountChanged"]>[0]
    let finishOldList!: (value: EidosSyncRepositoryList) => void
    const secondStatus: EidosSyncStatus = {
      ...status,
      account: {
        state: "signed-in",
        user: { id: "account-b", email: "b@example.com" },
      },
    }
    const ownList: EidosSyncRepositoryList = {
      namespace: "account-b",
      repositories: [
        {
          name: "b-notes",
          displayName: "B notes",
          createdAtMs: 1,
          remoteUrl: "https://sync-staging.eidos.space/account-b/b-notes",
        },
      ],
    }
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncStatus: vi
          .fn()
          .mockResolvedValueOnce(status)
          .mockResolvedValue(secondStatus),
        listSyncRepositories: vi
          .fn()
          .mockImplementationOnce(
            () =>
              new Promise<EidosSyncRepositoryList>((resolve) => {
                finishOldList = resolve
              })
          )
          .mockResolvedValue(ownList),
        getSyncQueueStatus: async () => null,
        onSyncProgress: () => () => {},
        onSyncQueueChanged: () => () => {},
        onAccountChanged: (listener: typeof accountChanged) => {
          accountChanged = listener
          return () => {}
        },
      },
    })
    await act(async () =>
      root.render(
        createElement(SyncPanel, {
          mode: "clone",
          platform: "darwin",
          onClose() {},
        })
      )
    )
    await act(async () => accountChanged(secondStatus.account))
    expect(host.textContent).toContain("B notes")
    await act(async () =>
      finishOldList({
        namespace: "account-a",
        repositories: [
          {
            name: "a-private",
            displayName: "A private Space",
            createdAtMs: 1,
            remoteUrl: "https://sync-staging.eidos.space/account-a/a-private",
          },
        ],
      })
    )
    expect(host.textContent).toContain("B notes")
    expect(host.textContent).not.toContain("A private Space")
    expect(readSyncStatusSnapshot("welcome")?.repositories).toEqual(ownList)
  })

  it.each([false, true])(
    "discards the sign-in Space list after another window switches account (panel closed=%s)",
    async (closed) => {
      let accountChanged!: Parameters<EidosLiteApi["onAccountChanged"]>[0]
      let finishOldList!: (value: EidosSyncRepositoryList) => void
      const secondStatus: EidosSyncStatus = {
        ...status,
        account: {
          state: "signed-in",
          user: { id: "account-b", email: "b@example.com" },
        },
      }
      const ownList: EidosSyncRepositoryList = {
        namespace: "account-b",
        repositories: [
          {
            name: "b-notes",
            displayName: "B notes",
            createdAtMs: 1,
            remoteUrl: "https://sync-staging.eidos.space/account-b/b-notes",
          },
        ],
      }
      Object.defineProperty(window, "eidosLite", {
        configurable: true,
        value: {
          getSyncStatus: vi
            .fn()
            .mockResolvedValueOnce({
              ...status,
              account: { state: "signed-out" },
              canClone: false,
            })
            .mockResolvedValue(secondStatus),
          beginSyncSignIn: vi.fn().mockResolvedValue(status),
          listSyncRepositories: vi
            .fn()
            .mockImplementationOnce(
              () =>
                new Promise<EidosSyncRepositoryList>((resolve) => {
                  finishOldList = resolve
                })
            )
            .mockResolvedValue(ownList),
          getSyncQueueStatus: async () => null,
          onSyncProgress: () => () => {},
          onSyncQueueChanged: () => () => {},
          onAccountChanged: (listener: typeof accountChanged) => {
            accountChanged = listener
            return () => {}
          },
        },
      })
      await act(async () =>
        root.render(
          createElement(SyncPanel, {
            mode: "clone",
            platform: "darwin",
            onClose() {},
          })
        )
      )
      await act(async () =>
        host.querySelector<HTMLButtonElement>("[data-sync-sign-in]")!.click()
      )
      if (closed) {
        await act(async () => root.render(null))
        writeSyncStatusSnapshot("welcome", {
          version: 1,
          status: secondStatus,
          checkedAtMs: Date.now(),
          repositories: ownList,
        })
      } else {
        await act(async () => accountChanged(secondStatus.account))
        expect(host.textContent).toContain("B notes")
      }
      await act(async () =>
        finishOldList({
          namespace: "account-a",
          repositories: [
            {
              name: "a-private",
              displayName: "A private Space",
              createdAtMs: 1,
              remoteUrl: "https://sync-staging.eidos.space/account-a/a-private",
            },
          ],
        })
      )
      if (!closed) expect(host.textContent).toContain("B notes")
      expect(host.textContent).not.toContain("A private Space")
      expect(readSyncStatusSnapshot("welcome")?.repositories).toEqual(ownList)
    }
  )

  it("uses the account broadcast when it arrives before the sign-in response", async () => {
    let accountChanged!: Parameters<EidosLiteApi["onAccountChanged"]>[0]
    let finishSignIn!: (value: EidosSyncStatus) => void
    const listSyncRepositories = vi.fn().mockResolvedValue({
      namespace: "person",
      repositories: [
        {
          name: "notes",
          displayName: "My notes",
          createdAtMs: 1,
          remoteUrl: "https://sync-staging.eidos.space/person/notes",
        },
      ],
    })
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncStatus: vi
          .fn()
          .mockResolvedValueOnce({
            ...status,
            account: { state: "signed-out" },
            canClone: false,
          })
          .mockResolvedValue(status),
        beginSyncSignIn: () =>
          new Promise<EidosSyncStatus>((resolve) => {
            finishSignIn = resolve
          }),
        listSyncRepositories,
        getSyncQueueStatus: async () => null,
        onSyncProgress: () => () => {},
        onSyncQueueChanged: () => () => {},
        onAccountChanged: (listener: typeof accountChanged) => {
          accountChanged = listener
          return () => {}
        },
      },
    })
    await act(async () =>
      root.render(
        createElement(SyncPanel, {
          mode: "clone",
          platform: "darwin",
          onClose() {},
        })
      )
    )
    await act(async () =>
      host.querySelector<HTMLButtonElement>("[data-sync-sign-in]")!.click()
    )
    await act(async () => accountChanged(status.account))
    await act(async () => finishSignIn(status))
    expect(listSyncRepositories).toHaveBeenCalledOnce()
    expect(host.textContent).toContain("My notes")
    expect(
      host.querySelector<HTMLButtonElement>(
        '[data-sync-open-space="My notes"]'
      )!.disabled
    ).toBe(false)
  })

  it("does not replace a new account with a delayed sign-out response", async () => {
    let accountChanged!: Parameters<EidosLiteApi["onAccountChanged"]>[0]
    let finishSignOut!: (value: EidosSyncStatus) => void
    const secondStatus: EidosSyncStatus = {
      ...status,
      account: {
        state: "signed-in",
        user: { id: "account-b", email: "b@example.com" },
      },
    }
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncStatus: vi
          .fn()
          .mockResolvedValueOnce(status)
          .mockResolvedValue(secondStatus),
        signOutSync: () =>
          new Promise<EidosSyncStatus>((resolve) => {
            finishSignOut = resolve
          }),
        getSyncQueueStatus: async () => null,
        onSyncProgress: () => () => {},
        onSyncQueueChanged: () => () => {},
        onAccountChanged: (listener: typeof accountChanged) => {
          accountChanged = listener
          return () => {}
        },
      },
    })
    await act(async () =>
      root.render(
        createElement(SyncPanel, {
          mode: "enable",
          platform: "darwin",
          onClose() {},
        })
      )
    )
    await act(async () =>
      host.querySelector<HTMLButtonElement>(".sync-sign-out")!.click()
    )
    await act(async () => accountChanged(secondStatus.account))
    await act(async () =>
      finishSignOut({ ...status, account: { state: "signed-out" } })
    )
    expect(host.textContent).toContain("b@example.com")
    expect(host.querySelector("[data-sync-sign-in]")).toBeNull()
    expect(readSyncStatusSnapshot("current-space")?.status.account).toEqual(
      secondStatus.account
    )
  })

  it.each(["win32", "unknown"])(
    "keeps legacy copies usable on %s and requires a password for supported encrypted copies",
    async (platform) => {
      let suppliedPassword = ""
      const cloneSyncRepository = vi.fn(
        async (
          _remote: string,
          _name: string,
          encryption?: { password: Uint8Array; remember?: boolean }
        ) => {
          if (encryption)
            suppliedPassword = new TextDecoder().decode(encryption.password)
          return { ok: true, snapshot: null, telemetry: { phases: [] } }
        }
      )
      Object.defineProperty(window, "eidosLite", {
        configurable: true,
        value: {
          getSyncStatus: async () => ({
            ...status,
            defaultPasswordConfigured: platform !== "win32",
            deviceUnlockAvailable: false,
          }),
          getSyncQueueStatus: async () => null,
          onSyncProgress: () => () => {},
          onSyncQueueChanged: () => () => {},
          listSyncRepositories: async () => ({
            namespace: "person",
            repositories: [
              {
                name: "legacy",
                displayName: "Legacy notes",
                createdAtMs: 1,
                remoteUrl: "https://sync-staging.eidos.space/person/legacy",
              },
              {
                name: "encrypted",
                displayName: "Private notes",
                createdAtMs: 1,
                remoteUrl: "https://sync-staging.eidos.space/person/encrypted",
                encryption: {
                  profile: "encrypted-remote-v1",
                  version: 1,
                  suite: 1,
                  uuid: "2f94f4c8-705b-4b5f-9808-84e0d1c394ee",
                },
              },
            ],
          }),
          cloneSyncRepository,
        },
      })
      await act(async () =>
        root.render(
          createElement(SyncPanel, {
            mode: "clone",
            platform,
            onClose() {},
          })
        )
      )
      expect(
        host.querySelector<HTMLButtonElement>(
          '[data-sync-open-space="Private notes"]'
        )!.disabled
      ).toBe(true)
      if (platform === "unknown")
        expect(host.textContent).toContain(
          "Encrypted cloud sync is not available on this platform yet"
        )
      else
        expect(host.textContent).not.toContain(
          "Encrypted cloud sync is not available on this platform yet"
        )
      await act(async () =>
        host
          .querySelector<HTMLButtonElement>(
            '[data-sync-open-space="Legacy notes"]'
          )!
          .click()
      )
      expect(cloneSyncRepository).toHaveBeenCalledWith(
        "https://sync-staging.eidos.space/person/legacy",
        "Legacy notes"
      )
      if (platform === "win32") {
        expect(cloneSyncRepository).toHaveBeenCalledOnce()
        const field = host.querySelector<HTMLInputElement>(
          "input[type=password]"
        )!
        expect(field).not.toBeNull()
        await act(async () => {
          Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            "value"
          )!.set!.call(field, "synthetic Windows clone password")
          field.dispatchEvent(new Event("input", { bubbles: true }))
        })
        const open = host.querySelector<HTMLButtonElement>(
          '[data-sync-open-space="Private notes"]'
        )!
        expect(open.disabled).toBe(false)
        await act(async () => open.click())
        expect(suppliedPassword).toBe("synthetic Windows clone password")
        expect(cloneSyncRepository).toHaveBeenCalledTimes(2)
        const request = cloneSyncRepository.mock.calls[1]![2]!
        expect(request.remember).not.toBe(true)
        expect(request.password.every((byte) => byte === 0)).toBe(true)
        expect(field.value).toBe("")
      }
    }
  )

  it("does not open a delayed clone result after signing out in another window", async () => {
    let accountChanged!: Parameters<EidosLiteApi["onAccountChanged"]>[0]
    let finishClone!: (value: {
      ok: true
      snapshot: SpaceSnapshot
      telemetry: { phases: [] }
    }) => void
    const onClone = vi.fn()
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncStatus: vi
          .fn()
          .mockResolvedValueOnce(status)
          .mockResolvedValue({ ...status, account: { state: "signed-out" } }),
        getSyncQueueStatus: async () => null,
        onSyncProgress: () => () => {},
        onSyncQueueChanged: () => () => {},
        onAccountChanged: (listener: typeof accountChanged) => {
          accountChanged = listener
          return () => {}
        },
        listSyncRepositories: async () => ({
          namespace: "person",
          repositories: [
            {
              name: "notes",
              displayName: "My notes",
              createdAtMs: 1,
              remoteUrl: "https://sync-staging.eidos.space/person/notes",
            },
          ],
        }),
        cloneSyncRepository: () =>
          new Promise((resolve) => {
            finishClone = resolve
          }),
      },
    })
    await act(async () =>
      root.render(
        createElement(SyncPanel, {
          mode: "clone",
          platform: "darwin",
          onClose() {},
          onClone,
        })
      )
    )
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[data-sync-open-space="My notes"]')!
        .click()
    )
    await act(async () => accountChanged({ state: "signed-out" }))
    await act(async () =>
      finishClone({
        ok: true,
        snapshot: {} as SpaceSnapshot,
        telemetry: { phases: [] },
      })
    )
    expect(onClone).not.toHaveBeenCalled()
    expect(host.querySelector("[data-sync-sign-in]")).not.toBeNull()
    expect(host.textContent).not.toContain("My notes")
  })

  it.each(["unknown"])(
    "does not create a plaintext connection on unsupported platform %s",
    async (platform) => {
      const enableSync = vi.fn()
      Object.defineProperty(window, "eidosLite", {
        configurable: true,
        value: {
          getSyncStatus: async () => ({
            ...status,
            environment: "production",
            remote: { state: "not-connected" },
            canEnable: true,
          }),
          getSyncPreflight: async () => preflight,
          getSyncQueueStatus: async () => null,
          onSyncProgress: () => () => {},
          onSyncQueueChanged: () => () => {},
          enableSync,
        },
      })
      await act(async () =>
        root.render(
          createElement(SyncPanel, { mode: "enable", platform, onClose() {} })
        )
      )
      expect(host.textContent).toContain(
        "Encrypted cloud sync is not available on this platform yet"
      )
      const button =
        host.querySelector<HTMLButtonElement>("[data-sync-enable]")!
      expect(button.disabled).toBe(true)
      await act(async () => button.click())
      expect(enableSync).not.toHaveBeenCalled()
      expect(host.querySelector('input[type="password"]')).toBeNull()
    }
  )

  it("does not show a signed-out state before the first account check completes", async () => {
    let finishStatus: ((value: EidosSyncStatus) => void) | undefined
    const api = {
      getSyncStatus: vi.fn(
        () =>
          new Promise<EidosSyncStatus>((resolve) => {
            finishStatus = resolve
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
          platform: "darwin",
          mode: "enable",
          cacheKey: "first-open",
          onClose: () => undefined,
        })
      )
    })

    expect(host.textContent).not.toContain("Sign in")
    expect(host.textContent).toContain("Checking Sync access")
    expect(host.querySelector("[data-sync-sign-in]")).toBeNull()
    await act(async () =>
      finishStatus?.({ ...status, account: { state: "signed-out" } })
    )
    expect(host.textContent).toContain("Sign in to use Sync")
    expect(host.textContent).not.toContain("Checking Sync access")
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
          platform: "darwin",
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
          platform: "darwin",
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
    const checkNow = host.querySelector<HTMLButtonElement>(
      '[data-sync-next="fetch"]'
    )
    expect(checkNow?.textContent).toContain("Check remote updates")
    expect(checkNow?.classList.contains("primary-action")).toBe(true)
    expect(host.querySelector(".sync-hero-copy p")).toBeNull()
    expect(host.querySelector(".sync-hero-meta")).toBeNull()
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
          platform: "darwin",
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
          platform: "darwin",
          mode: "enable",
          onClose: () => undefined,
        })
      )
    })

    expect(host.textContent).toContain("Sync access required")
    expect(host.textContent).not.toContain("Storage")
    expect(host.textContent).not.toContain("Breakdown")
    expect(host.textContent).not.toContain("Connection")
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
          platform: "darwin",
          mode: "enable",
          cacheKey: "space-offline",
          onClose: () => undefined,
        })
      )
    })

    expect(host.textContent).toContain("We’ll sync when you’re back online")
    expect(host.textContent).toContain("person@example.com")
    expect(host.textContent).toContain("2 GiB of 10 GiB")
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
          platform: "darwin",
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
    expect(storage?.textContent).toContain("2 GiB of 10 GiB")
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
    expect(storage?.textContent).toContain("Pending upload")
    expect(storage?.textContent).toContain("512 MiB · 2.5 GiB projected")
    expect(storage?.textContent).toContain("not its billed cloud contribution")
    expect(storage?.textContent).toContain("history and deduplication")
    expect(storage?.textContent).toContain("Cloud used")
    expect(storage?.textContent).toContain("2 GiB")
    expect(storage?.textContent).toContain("Plan total")
    expect(storage?.textContent).toContain("10 GiB")
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
          platform: "darwin",
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
          platform: "darwin",
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
          platform: "darwin",
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
    expect(host.textContent).toContain("List updated")
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
          platform: "darwin",
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
          platform: "darwin",
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
    expect(storage?.textContent).toContain("2 GiB of 10 GiB")
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
          platform: "darwin",
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
          platform: "darwin",
          mode: "enable",
          onClose: () => undefined,
        })
      )
    })

    const overview = host.querySelector<HTMLElement>("[data-sync-overview]")
    expect(overview?.dataset.syncOverview).toBe("neutral")
    expect(overview?.textContent).not.toContain("cloud storage left")
    expect(
      host.querySelector("[data-sync-storage-disclosure]")?.hasAttribute("open")
    ).toBe(false)
    const storage = host.querySelector<HTMLElement>("[data-sync-storage-used]")
    expect(storage?.dataset.syncStorageState).toBe("warning")
    expect(storage?.textContent).toContain("Running low")
    expect(storage?.textContent).toContain("9.5 GiB of 10 GiB")
    expect(storage?.textContent).toContain("95% used")
    expect(storage?.textContent).toContain("Plan total")
    expect(
      [...(storage?.querySelectorAll(".sync-kv dt") ?? [])].find(
        (entry) => entry.textContent === "Available"
      )?.nextElementSibling?.textContent
    ).toContain("512 MiB")

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
          platform: "darwin",
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
    expect(storage?.textContent).toContain("Pending upload")
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
    expect(
      host.querySelector("[data-sync-storage-disclosure]")?.hasAttribute("open")
    ).toBe(true)
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
          platform: "darwin",
          mode: "enable",
          hasUncheckpointedChanges: true,
          onClose: () => undefined,
          onReviewLocal: () => undefined,
        })
      )
    })

    const overview = host.querySelector<HTMLElement>("[data-sync-overview]")
    expect(overview?.textContent).toContain("Unsaved changes")
    expect(overview?.textContent).toContain("Local edits stay on this device")
    expect(overview?.textContent).not.toMatch(
      /checkpoint|repository|remote|transport|segment/i
    )
    expect(
      host.querySelector<HTMLButtonElement>("[data-sync-review-local]")
        ?.textContent
    ).toContain("Review changes")
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
          platform: "darwin",
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
      [...host.querySelectorAll(".sync-about dt")].some(
        (entry) => entry.textContent === "Environment"
      )
    ).toBe(false)
    const storage = host.querySelector("[data-sync-storage-used]")
    expect(storage?.textContent).toContain("2 GiB of 10 GiB")
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
    expect(host.querySelector("[data-sync-failure-retry]")).toBeNull()

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
    const runSync = vi.fn().mockResolvedValue(uploadTooLarge)
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncStatus: vi.fn().mockResolvedValue(status),
        getSyncQueueStatus: vi.fn().mockResolvedValue(null),
        runSync,
        onSyncProgress: vi.fn().mockReturnValue(() => undefined),
        onSyncQueueChanged: vi.fn().mockReturnValue(() => undefined),
      } as unknown as EidosLiteApi,
    })

    await act(async () => {
      root.render(
        createElement(SyncPanel, {
          platform: "darwin",
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
      host.querySelector<HTMLButtonElement>(
        "[data-sync-failure-primary-action]"
      )?.textContent
    ).toContain("Keep working locally")
    expect(
      host.querySelector("[data-sync-storage-used]")?.textContent
    ).toContain("2 GiB")

    await act(async () => {
      host
        .querySelector<HTMLButtonElement>("[data-sync-failure-retry]")
        ?.click()
    })
    expect(runSync).toHaveBeenCalledOnce()
  })

  it("re-fetches instead of replaying an upload after a Remote conflict", async () => {
    const remoteConflict = {
      ok: false,
      runId: "race-run",
      failure: {
        code: "remote-conflict",
        state: "needs-attention",
        title: "Cloud updates changed",
        message: "Another device uploaded a newer version.",
        action: "retry-now",
        actionLabel: "Fetch again",
        retryable: true,
        localSafe: true,
        status: 409,
      },
      telemetry: {
        startedAtMs: 0,
        completedAtMs: 1,
        durationMs: 1,
        phases: [],
      },
    } satisfies EidosSyncRunResponse
    const checked = {
      ...conflictResponse,
      result: {
        ...conflictResponse.result,
        state: "checked",
        ahead: 0,
        behind: 0,
      },
    } satisfies EidosSyncRunResponse
    const runSync = vi
      .fn()
      .mockResolvedValueOnce(remoteConflict)
      .mockResolvedValueOnce(checked)
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncStatus: vi.fn().mockResolvedValue(status),
        getSyncQueueStatus: vi.fn().mockResolvedValue(null),
        onSyncProgress: vi.fn().mockReturnValue(() => undefined),
        onSyncQueueChanged: vi.fn().mockReturnValue(() => undefined),
        runSync,
      } as unknown as EidosLiteApi,
    })

    await act(async () => {
      root.render(
        createElement(SyncPanel, {
          platform: "darwin",
          mode: "enable",
          syncHistory: {
            state: "ahead",
            ahead: 1,
            behind: 0,
            localHead: "local",
            remoteHead: "remote",
            commonAncestor: "base",
          },
          onClose: () => undefined,
        })
      )
    })

    await act(async () => {
      host.querySelector<HTMLButtonElement>("[data-sync-push]")?.click()
    })
    expect(runSync).toHaveBeenNthCalledWith(1, "push")
    expect(
      host.querySelector<HTMLElement>("[data-sync-failure]")?.dataset
        .syncFailure
    ).toBe("remote-conflict")

    await act(async () => {
      host
        .querySelector<HTMLButtonElement>("[data-sync-failure-retry]")
        ?.click()
    })
    expect(runSync).toHaveBeenNthCalledWith(2, "fetch")
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
          platform: "darwin",
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
          platform: "darwin",
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
    expect(host.querySelector("[data-sync-overview]")?.textContent).toContain(
      "Review conflicting files and tables in Changes"
    )
    expect(host.querySelector("[data-sync-run]")).not.toBeNull()
    expect(host.querySelector("[data-sync-merge-start]")).not.toBeNull()
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

  it.each(["dialog", "inspector"] as const)(
    "enables Sync without confirmation and keeps tracked ignored files informational (%s)",
    async (variant) => {
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
            platform: "darwin",
            mode: "enable",
            variant,
            onClose: () => undefined,
          })
        )
      })

      if (variant === "inspector") {
        expect(host.querySelector('[data-sync-setup="true"]')).not.toBeNull()
        expect(host.querySelector(".sync-account-details")).toBeNull()
        expect(host.querySelector(".sync-inspector-empty")).toBeNull()
        const account = host.querySelector<HTMLButtonElement>(
          ".sync-account-meter"
        )
        await act(async () => account?.click())
        expect(
          host.querySelector(".sync-inspector-settings")?.textContent
        ).toContain("Sync settings")
        await act(async () =>
          document.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
          )
        )
      }

      const scope = host.querySelector<HTMLElement>("[data-sync-preflight]")
      const enable = host.querySelector<HTMLButtonElement>("[data-sync-enable]")
      expect(scope?.textContent).toContain("4 files")
      expect(scope?.textContent).toContain("120 MiB")
      expect(scope?.textContent).toContain("generated/tracked.txt")
      expect(enable?.disabled).toBe(false)
      expect(
        scope?.querySelector(".sync-review-details > summary")?.textContent
      ).toContain("Already in version history")
      if (variant === "inspector") {
        expect(enable?.closest(".sync-setup-footer")).not.toBeNull()
        expect(
          host.querySelector(".sync-inspector-b-content")?.contains(enable)
        ).toBe(false)
      }

      expect(host.querySelector("[data-sync-preflight-confirm]")).toBeNull()
      expect(scope?.textContent).not.toContain("private information")

      let completeCheck: ((value: EidosSyncPreflight) => void) | undefined
      vi.mocked(api.getSyncPreflight).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            completeCheck = resolve
          })
      )
      await act(async () => {
        scope
          ?.querySelector<HTMLButtonElement>('[aria-label="Recheck files"]')
          ?.click()
      })
      expect(api.getSyncPreflight).toHaveBeenCalledTimes(2)
      expect(enable?.disabled).toBe(true)
      expect(scope?.textContent).toContain("4 files")
      await act(async () => completeCheck?.(preflight))
      expect(enable?.disabled).toBe(false)

      await act(async () => {
        enable?.click()
      })
      expect(enableSync).toHaveBeenCalledWith({
        manifestId: preflight.manifestId,
      })
      if (variant === "inspector") {
        expect(host.querySelector('[data-sync-design="b"]')).not.toBeNull()
        expect(host.querySelector('[data-sync-setup="true"]')).toBeNull()
        expect(host.querySelector("[data-sync-preflight]")).toBeNull()
        expect(host.querySelector(".sync-account-meter")).not.toBeNull()
      }
    }
  )

  it.each(["dialog", "inspector"] as const)(
    "blocks only unsupported upload entries and becomes ready after rechecking (%s)",
    async (variant) => {
      const blocked: EidosSyncPreflight = {
        ...preflight,
        blockerCount: 3,
        blockers: [
          {
            relativePath: "oversized.bin",
            size: 1_073_741_825,
            concerns: ["file-too-large"],
          },
          { relativePath: "linked-folder", size: 0, concerns: ["symlink"] },
          {
            relativePath: "named-pipe",
            size: 0,
            concerns: ["unsupported-entry"],
          },
        ],
      }
      const getSyncPreflight = vi.fn().mockResolvedValue(blocked)
      const enableSync = vi.fn()
      Object.defineProperty(window, "eidosLite", {
        configurable: true,
        value: {
          getSyncStatus: vi.fn().mockResolvedValue({
            ...status,
            remote: { state: "not-connected" },
            canEnable: true,
          }),
          getSyncPreflight,
          getSyncQueueStatus: vi.fn().mockResolvedValue(null),
          onSyncProgress: vi.fn().mockReturnValue(() => undefined),
          onSyncQueueChanged: vi.fn().mockReturnValue(() => undefined),
          enableSync,
        },
      })
      await act(async () =>
        root.render(
          createElement(SyncPanel, {
            platform: "darwin",
            mode: "enable",
            variant,
            onClose: () => undefined,
          })
        )
      )
      const scope = host.querySelector<HTMLElement>("[data-sync-preflight]")!
      const enable =
        host.querySelector<HTMLButtonElement>("[data-sync-enable]")!
      expect(scope.querySelector('[role="alert"]')?.textContent).toContain(
        "oversized.bin"
      )
      expect(scope.querySelector('[role="alert"]')?.textContent).toContain(
        "linked-folder"
      )
      expect(scope.querySelector('[role="alert"]')?.textContent).toContain(
        "named-pipe"
      )
      expect(enable.disabled).toBe(true)
      await act(async () => enable.click())
      expect(enableSync).not.toHaveBeenCalled()
      getSyncPreflight.mockResolvedValue(preflight)
      await act(async () =>
        scope
          .querySelector<HTMLButtonElement>('[aria-label="Recheck files"]')!
          .click()
      )
      expect(scope.querySelector('[role="alert"]')).toBeNull()
      expect(enable.disabled).toBe(false)
      expect(scope.querySelector("[data-sync-preflight-confirm]")).toBeNull()
    }
  )

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
          platform: "darwin",
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
        transfer: {
          direction: "upload",
          transferredBytes: 64 * 1024 * 1024,
          totalBytes: 128 * 1024 * 1024,
          bytesPerSecond: 8 * 1024 * 1024,
          estimatedRemainingMs: 8_000,
        },
      })
    })

    const progress = host.querySelector<HTMLElement>("[data-sync-progress]")
    expect(progress?.dataset.syncOperation).toBe("connect")
    expect(progress?.textContent).toContain(
      "Uploading this Space for the first time"
    )
    expect(progress?.textContent).not.toContain("repository segments")
    expect(progress?.textContent).toContain("Uploaded 64 MiB of 128 MiB")
    expect(progress?.textContent).toContain("8 MiB/s")
    expect(progress?.textContent).toContain("8.0 s left")
    expect(progress?.textContent).toContain("50%")
    expect(host.querySelector("[data-sync-overview]")?.textContent).toContain(
      "Connecting this Space"
    )

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
      "Sync is ready"
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
          platform: "darwin",
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
        startedAtMs: Date.now() - 50,
        phaseStartedAtMs: Date.now() - 30,
        elapsedMs: 50,
        transfer: {
          direction: "download",
          transferredBytes: 1 * 1024 * 1024,
          totalBytes: null,
          bytesPerSecond: 2 * 1024 * 1024,
          estimatedRemainingMs: null,
        },
      })
    })

    const pendingTotal = host.querySelector<HTMLElement>("[data-sync-progress]")
    expect(pendingTotal?.textContent).toContain("Downloaded 1 MiB")
    expect(pendingTotal?.querySelector("[data-sync-transfer-total]")).toBeNull()
    expect(pendingTotal?.textContent).toContain("2 MiB/s")
    expect(
      pendingTotal?.querySelector("[data-sync-transfer-remaining]")
    ).toBeNull()
    expect(
      pendingTotal
        ?.querySelector<HTMLElement>("[role='progressbar']")
        ?.getAttribute("aria-valuetext")
    ).toBe("Downloaded 1 MiB")

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
        transfer: {
          direction: "download",
          transferredBytes: 25 * 1024 * 1024,
          totalBytes: 100 * 1024 * 1024,
          bytesPerSecond: 5 * 1024 * 1024,
          estimatedRemainingMs: 15_000,
        },
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
    expect(progress?.textContent).toContain("Downloaded 25 MiB of 100 MiB")
    expect(progress?.textContent).toContain("5 MiB/s")
    expect(progress?.textContent).toContain("15 s left")
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
          platform: "darwin",
          mode: "enable",
          onClose: () => undefined,
        })
      )
    })

    expect(host.querySelector("[data-sync-overview]")?.textContent).toContain(
      "Sync writes are paused"
    )
    expect(host.querySelector("[data-sync-readonly]")?.textContent).toContain(
      "read-only or expired"
    )
    expect(host.querySelector("[data-sync-pull]")?.textContent).toContain(
      "Receive updates"
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
          platform: "darwin",
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

  it("refreshes open files after Sync materializes cloud updates", async () => {
    const snapshot = {} as SpaceSnapshot
    const onSpaceChange = vi.fn()
    const onFilesMaterialized = vi.fn().mockResolvedValue(undefined)
    const api = {
      getSyncStatus: vi.fn().mockResolvedValue(status),
      getSyncQueueStatus: vi.fn().mockResolvedValue(null),
      runSync: vi.fn().mockResolvedValue({
        ok: true,
        result: {
          state: "synced",
          message: "Cloud updates were downloaded.",
          pulled: true,
          pushed: false,
          materializedPaths: ["records.eidos", "notes.md"],
          ahead: 0,
          behind: 0,
          snapshot,
          runId: "sync-pull-1",
          telemetry: {
            startedAtMs: 100,
            completedAtMs: 200,
            durationMs: 100,
            phases: [],
          },
        },
      } satisfies EidosSyncRunResponse),
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
          platform: "darwin",
          mode: "enable",
          onClose: () => undefined,
          onSpaceChange,
          onFilesMaterialized,
        })
      )
    })
    await act(async () => {
      host.querySelector<HTMLButtonElement>("[data-sync-run]")?.click()
    })

    expect(onSpaceChange).toHaveBeenCalledWith(snapshot)
    expect(onFilesMaterialized).toHaveBeenCalledWith(snapshot, [
      "records.eidos",
      "notes.md",
    ])
  })

  it("keeps the sync direction visible next to any status", async () => {
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
          platform: "darwin",
          mode: "enable",
          hasUncheckpointedChanges: true,
          syncHistory: {
            state: "ahead",
            ahead: 3,
            behind: 0,
          },
          onClose: () => undefined,
          onReviewLocal: () => undefined,
        })
      )
    })

    const upload = host.querySelector<HTMLElement>(
      "[data-sync-direction='upload']"
    )
    expect(upload?.textContent).toContain("3 to upload")
    expect(host.querySelector("[data-sync-direction='download']")).toBeNull()
    expect(host.querySelector("[data-sync-overview]")?.textContent).toContain(
      "Unsaved changes"
    )
  })

  it("shows both directions of a divergence with exact counts", async () => {
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
          platform: "darwin",
          mode: "enable",
          syncHistory: {
            state: "diverged",
            ahead: 2,
            behind: 3,
          },
          onClose: () => undefined,
        })
      )
    })

    expect(
      host.querySelector("[data-sync-direction='upload']")?.textContent
    ).toContain("2 to upload")
    expect(
      host.querySelector("[data-sync-direction='download']")?.textContent
    ).toContain("3 to download")
    expect(host.querySelector("[data-sync-recovery]")?.textContent).toContain(
      "will not merge or overwrite"
    )
  })

  it("names the pending counts on the directional sync actions", async () => {
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
          platform: "darwin",
          mode: "enable",
          syncHistory: {
            state: "behind",
            ahead: 0,
            behind: 2,
          },
          onClose: () => undefined,
        })
      )
    })

    expect(host.querySelector("[data-sync-pull]")?.textContent).toContain(
      "Receive updates"
    )
    expect(
      host.querySelector("[data-sync-direction='download']")?.textContent
    ).toContain("2 to download")
    expect(host.querySelector("[data-sync-direction='upload']")).toBeNull()
  })

  it("hides the direction row when Local and Hosted match", async () => {
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
          platform: "darwin",
          mode: "enable",
          syncHistory: {
            state: "up_to_date",
            ahead: 0,
            behind: 0,
          },
          onClose: () => undefined,
        })
      )
    })

    expect(host.querySelector("[data-sync-direction]")).toBeNull()
    expect(host.querySelector("[data-sync-overview]")?.textContent).toContain(
      "Sync is on"
    )
  })

  it("refreshes the queue after an account change even when entitlement stays the same", async () => {
    let accountChanged!: Parameters<EidosLiteApi["onAccountChanged"]>[0]
    const getSyncQueueStatus = vi.fn().mockResolvedValue({
      spaceId: "space-1",
      state: "paused",
      attempt: 1,
      maxAttempts: 5,
      lastFailure: {
        code: "authentication-required",
        state: "paused-sign-in",
        title: "Sign in again to resume Sync",
        message: "Session expired",
        action: "sign-in",
        actionLabel: "Sign in again",
        retryable: false,
        localSafe: true,
      },
    })
    const getSyncStatus = vi
      .fn()
      .mockImplementation(async () => ({ ...status }))
    const runSync = vi.fn()
    const unsubscribe = vi.fn()
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        getSyncStatus,
        getSyncQueueStatus,
        runSync,
        onAccountChanged: (listener: typeof accountChanged) => {
          accountChanged = listener
          return unsubscribe
        },
        onSyncProgress: () => () => undefined,
        onSyncQueueChanged: () => () => undefined,
      },
    })
    await act(async () =>
      root.render(
        createElement(SyncPanel, {
          platform: "darwin",
          mode: "enable",
          onClose: () => undefined,
        })
      )
    )
    expect(host.textContent).toContain("Sign in again to resume Sync")
    getSyncQueueStatus.mockResolvedValue({
      spaceId: "space-1",
      state: "idle",
      attempt: 0,
      maxAttempts: 5,
    })
    await act(async () => accountChanged(status.account))
    expect(getSyncStatus).toHaveBeenCalledTimes(2)
    expect(getSyncQueueStatus).toHaveBeenCalledTimes(2)
    expect(host.textContent).not.toContain("Sign in again to resume Sync")
    expect(runSync).not.toHaveBeenCalled()
    await act(async () => root.unmount())
    expect(unsubscribe).toHaveBeenCalledOnce()
    root = createRoot(host)
  })

  it("turns an expired session into a direct sign-in recovery", async () => {
    const beginSyncSignIn = vi.fn().mockResolvedValue(status)
    const authenticationFailure = {
      code: "authentication-required",
      state: "paused-sign-in",
      title: "Sign in again to resume Sync",
      message: "The account session expired. Local editing remains available.",
      action: "sign-in",
      actionLabel: "Sign in again",
      retryable: false,
      localSafe: true,
    } as const
    const runSync = vi.fn().mockResolvedValue({
      ...failureResponse,
      failure: authenticationFailure,
    } satisfies EidosSyncRunResponse)
    const api = {
      getSyncStatus: vi.fn().mockResolvedValue(status),
      getSyncQueueStatus: vi.fn().mockResolvedValue({
        spaceId: "space-1",
        state: "paused",
        trigger: "manual",
        attempt: 1,
        maxAttempts: 5,
        lastFailure: authenticationFailure,
      }),
      beginSyncSignIn,
      runSync,
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
          platform: "darwin",
          mode: "enable",
          onClose: () => undefined,
        })
      )
    })
    expect(host.querySelector("[data-sync-overview]")?.textContent).toContain(
      "Sign in again to resume Sync"
    )
    expect(host.querySelector("[data-sync-failure-retry]")).toBeNull()
    expect(host.querySelector("[data-sync-check-remote]")).toBeNull()
    expect(runSync).not.toHaveBeenCalled()

    await act(async () => {
      host
        .querySelector<HTMLButtonElement>("[data-sync-failure-primary-action]")
        ?.click()
    })
    expect(beginSyncSignIn).toHaveBeenCalledOnce()
  })
})
