// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosLiteApi,
  EidosSyncStatus,
  SyncAccountStatus,
} from "../shared/contracts"
import { DEFAULT_RENDERER_PREFERENCES } from "./app-appearance"
import { SettingsPage } from "./settings-page"
import { writePublishAccountSnapshot } from "./publish-account"
import {
  readSyncAccountContext,
  writeSyncStatusSnapshot,
} from "./sync-status-cache"

const signedIn: EidosSyncStatus = {
  environment: "staging",
  account: {
    state: "signed-in",
    user: { id: "account-a", name: "Mayne", email: "test@example.com" },
  },
  device: { state: "active" },
  entitlement: {
    state: "read-write",
    detail: "",
    usedBytes: 1024,
    quotaBytes: 4096,
  },
  remote: { state: "not-connected" },
  canEnable: true,
  canClone: true,
  blocker: null,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe("Settings account continuity", () => {
  let host: HTMLDivElement
  let root: Root
  let accountChanged: (account: SyncAccountStatus) => void
  const getSyncStatus = vi.fn<() => Promise<EidosSyncStatus>>()
  const getSyncPasswordSettings = vi.fn(async () => ({
    available: true,
    configured: true,
  }))
  const getPublishAccountStatus = vi.fn(async () => ({
    state: "active",
    plan: "free",
    privatePublications: false,
    removeBranding: false,
    usedStorageBytes: "200",
    maxStorageBytes: "100",
    activeSlugs: [],
    accountUrl: "https://eidos.space/account",
    pricingUrl: "https://eidos.space/pricing",
  }))

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    window.history.replaceState(null, "", "#/settings/account-sync")
    window.localStorage.clear()
    getSyncStatus.mockReset().mockResolvedValue(signedIn)
    getSyncPasswordSettings.mockClear()
    getPublishAccountStatus.mockClear()
    Object.assign(window, {
      eidosLite: {
        getAppInfo: async () => ({
          name: "Eidos Lite",
          version: "0.2.2",
          platform: "darwin",
          architecture: "arm64",
          services: { name: "staging" },
        }),
        getPreferences: async () => DEFAULT_RENDERER_PREFERENCES,
        onPreferencesChanged: () => () => {},
        listTerminalShells: async () => [],
        getUpdateStatus: async () => ({
          state: "unavailable",
          currentVersion: "0.2.2",
        }),
        onUpdateStatusChanged: () => () => {},
        getAccountStatus: async () => signedIn.account,
        onAccountChanged: (listener: (account: SyncAccountStatus) => void) => {
          accountChanged = listener
          return () => {}
        },
        getSyncStatus,
        getSyncPasswordSettings,
        getPublishAccountStatus,
      } as unknown as EidosLiteApi,
    })
    writePublishAccountSnapshot({
      state: "active",
      plan: "free",
      privatePublications: false,
      removeBranding: false,
      usedStorageBytes: "200",
      maxStorageBytes: "100",
      activeSlugs: Array.from({ length: 28 }, (_, i) => `page-${i}`),
      accountUrl: "https://eidos.space/account",
      pricingUrl: "https://eidos.space/pricing",
    })
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.restoreAllMocks()
  })
  const mount = () => act(async () => root.render(createElement(SettingsPage)))
  const syncSection = () =>
    host.querySelector<HTMLElement>("[data-settings-sync]")!
  const refreshButton = () =>
    host.querySelector<HTMLButtonElement>(
      'button[aria-label="Refresh account status"]'
    )!

  it("keeps local password controls mounted while a stale cloud status refresh is pending", async () => {
    writeSyncStatusSnapshot("settings", {
      version: 1,
      status: signedIn,
      checkedAtMs: 1,
    })
    const pending = deferred<EidosSyncStatus>()
    getSyncStatus.mockReturnValue(pending.promise)
    await mount()
    const password = syncSection().querySelector(".sync-password-settings")
    expect(password).not.toBeNull()
    expect(getSyncPasswordSettings).toHaveBeenCalledOnce()
    expect(syncSection().textContent).toContain("1.0 KiB")
    expect(refreshButton().getAttribute("aria-busy")).toBe("true")
    await act(async () => pending.resolve(signedIn))
    expect(syncSection().querySelector(".sync-password-settings")).toBe(
      password
    )
    expect(getSyncPasswordSettings).toHaveBeenCalledOnce()
    expect(refreshButton().getAttribute("aria-busy")).toBe("false")
  })

  it.each(["darwin", "linux", "win32", "unknown"])(
    "shows production password settings only on supported platform %s",
    async (platform) => {
      const appInfo = await window.eidosLite.getAppInfo()
      vi.spyOn(window.eidosLite, "getAppInfo").mockResolvedValue({
        ...appInfo,
        platform,
        services: { ...appInfo.services, name: "production" },
      })
      const production: EidosSyncStatus = {
        ...signedIn,
        environment: "production",
      }
      getSyncStatus.mockResolvedValue(production)
      if (platform === "win32")
        getSyncPasswordSettings.mockResolvedValueOnce({
          available: false,
          configured: false,
        })
      writeSyncStatusSnapshot("settings", {
        version: 1,
        status: production,
        checkedAtMs: Date.now(),
      })
      await mount()
      expect(
        Boolean(syncSection().querySelector(".sync-password-settings"))
      ).toBe(platform !== "unknown")
      if (platform === "win32") {
        const password = syncSection().querySelector(".sync-password-settings")!
        expect(password.textContent).toContain(
          "Enter the password again after restarting."
        )
        expect(password.querySelector("button")).toBeNull()
      }
      expect(syncSection().textContent).toContain("1.0 KiB")
    }
  )

  it("reuses fresh account status and coalesces manual refreshes without discarding content on failure", async () => {
    writeSyncStatusSnapshot("settings", {
      version: 1,
      status: signedIn,
      checkedAtMs: Date.now(),
    })
    await mount()
    expect(getSyncStatus).not.toHaveBeenCalled()
    expect(syncSection().textContent).not.toContain("Download and upload")
    expect(host.querySelectorAll('button[aria-label^="Refresh"]')).toHaveLength(
      1
    )
    const pending = deferred<EidosSyncStatus>()
    getSyncStatus.mockReturnValue(pending.promise)
    const button = refreshButton()
    button.focus()
    await act(async () => {
      button.click()
      button.click()
    })
    expect(getSyncStatus).toHaveBeenCalledOnce()
    expect(getPublishAccountStatus).toHaveBeenCalledOnce()
    vi.spyOn(console, "error").mockImplementation(() => {})
    await act(async () => pending.reject(new Error("offline")))
    expect(syncSection().textContent).toContain("Could not refresh Sync")
    expect(syncSection().textContent).toContain("1.0 KiB")
    expect(button.getAttribute("aria-busy")).toBe("false")
    expect(document.activeElement).toBe(button)
  })

  it("discards a delayed signed-in response after another window signs out", async () => {
    writeSyncStatusSnapshot("settings", {
      version: 1,
      status: signedIn,
      checkedAtMs: 1,
    })
    const pending = deferred<EidosSyncStatus>()
    getSyncStatus.mockReturnValue(pending.promise)
    await mount()
    await act(async () => accountChanged({ state: "signed-out" }))
    await act(async () => pending.resolve(signedIn))
    expect(readSyncAccountContext()?.account.state).not.toBe("signed-in")
    expect(
      host.querySelector(".settings-account-summary")?.textContent
    ).not.toContain("test@example.com")
    expect(syncSection().querySelector(".sync-password-settings")).toBeNull()
    expect(syncSection().textContent).toContain("Sign in to use Sync")
  })

  it("marks over-quota Publish usage visibly and accessibly", async () => {
    writeSyncStatusSnapshot("settings", {
      version: 1,
      status: signedIn,
      checkedAtMs: Date.now(),
    })
    await mount()
    expect(
      host.querySelectorAll(
        '[data-settings-publish] .usage-meter[data-over-limit="true"]'
      )
    ).toHaveLength(2)
    expect(
      host.querySelector("[data-settings-publish]")?.textContent
    ).toContain("Storage limit exceeded")
  })
  it.each(["read-only", "blocked", "none"] as const)(
    "explains a real Sync restriction (%s) without device-registration jargon",
    async (state) => {
      writeSyncStatusSnapshot("settings", {
        version: 1,
        status: {
          ...signedIn,
          device: { state: "not-registered" },
          entitlement: { state, detail: "" },
        },
        checkedAtMs: Date.now(),
      })
      await mount()
      expect(
        syncSection().querySelector('[role="status"]')?.textContent
      ).toContain("Sync")
      expect(syncSection().textContent).not.toContain("Not registered")
      expect(syncSection().textContent).toContain("Manage Sync")
    }
  )
})
