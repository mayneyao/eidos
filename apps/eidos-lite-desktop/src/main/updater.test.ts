import {
  EidosLiteUpdater,
  eidosLiteReleaseChannel,
  eidosLiteUpdateFeed,
  type EidosLiteAutoUpdater,
} from "./updater"

class FakeAutoUpdater implements EidosLiteAutoUpdater {
  autoDownload = false
  autoInstallOnAppQuit = false
  allowPrerelease = false
  channel: string | null = null
  feed: Parameters<EidosLiteAutoUpdater["setFeedURL"]>[0] | null = null
  checks = 0
  downloads = 0
  installs = 0
  private readonly listeners = new Map<
    string,
    Array<(value: unknown) => void>
  >()

  setFeedURL(options: Parameters<EidosLiteAutoUpdater["setFeedURL"]>[0]) {
    this.feed = options
  }

  on(event: string, listener: (value: unknown) => void) {
    const listeners = this.listeners.get(event) ?? []
    listeners.push(listener)
    this.listeners.set(event, listeners)
  }

  emit(event: string, value?: unknown) {
    for (const listener of this.listeners.get(event) ?? []) listener(value)
  }

  async checkForUpdates() {
    this.checks += 1
  }

  async downloadUpdate() {
    this.downloads += 1
  }

  quitAndInstall() {
    this.installs += 1
  }
}

describe("Eidos Lite updater", () => {
  it("uses a product-specific stable or beta feed", () => {
    expect(eidosLiteReleaseChannel("0.2.0")).toBe("stable")
    expect(eidosLiteReleaseChannel("0.2.0-beta.3")).toBe("beta")
    expect(eidosLiteUpdateFeed("0.2.0", "arm64")).toEqual({
      url: "https://download.eidos.space/lite/updates/stable/arm64",
      channel: "latest",
    })
  })

  it("never loads the updater outside an update-enabled production package", async () => {
    let loads = 0
    const updater = new EidosLiteUpdater({
      currentVersion: "0.1.0",
      platform: "darwin",
      architecture: "arm64",
      packaged: true,
      production: false,
      updatesEnabled: false,
      loadAutoUpdater: async () => {
        loads += 1
        return new FakeAutoUpdater()
      },
      broadcast: () => undefined,
      logger: { info: () => undefined, warn: () => undefined },
    })

    await expect(updater.check()).resolves.toMatchObject({
      state: "unavailable",
      unavailableReason: "non-production",
    })
    expect(loads).toBe(0)
  })

  it("reports check, download, and install state without exposing raw errors", async () => {
    const native = new FakeAutoUpdater()
    const states: string[] = []
    const updater = new EidosLiteUpdater({
      currentVersion: "0.2.0-beta.1",
      platform: "darwin",
      architecture: "arm64",
      packaged: true,
      production: true,
      updatesEnabled: true,
      loadAutoUpdater: async () => native,
      broadcast: (status) => states.push(status.state),
      logger: { info: () => undefined, warn: () => undefined },
    })

    await updater.start(false)
    expect(native.feed).toEqual({
      provider: "generic",
      url: "https://download.eidos.space/lite/updates/beta/arm64",
      channel: "beta",
    })
    expect(native.allowPrerelease).toBe(true)

    await updater.check()
    native.emit("update-available", { version: "0.2.0-beta.2" })
    expect(updater.getStatus()).toMatchObject({
      state: "available",
      version: "0.2.0-beta.2",
    })

    await updater.download()
    native.emit("download-progress", { percent: 42.5 })
    native.emit("update-downloaded", { version: "0.2.0-beta.2" })
    await updater.restartToInstall()
    expect(native.downloads).toBe(1)
    expect(native.installs).toBe(1)
    expect(states).toContain("checking")
    expect(states).toContain("downloaded")
  })

  it("contains initialization failures in the public error state", async () => {
    const logger = {
      info: vi.fn(),
      warn: vi.fn(),
    }
    const updater = new EidosLiteUpdater({
      currentVersion: "1.0.0",
      platform: "darwin",
      architecture: "arm64",
      packaged: true,
      production: true,
      updatesEnabled: true,
      loadAutoUpdater: vi.fn().mockRejectedValue(new Error("secret detail")),
      broadcast: vi.fn(),
      logger,
    })

    await expect(updater.check()).resolves.toMatchObject({ state: "error" })
    expect(logger.warn).toHaveBeenCalledWith("update.check.failed", {
      error: "secret detail",
    })
    expect(updater.getStatus()).not.toHaveProperty("error")
  })
})
