import type { EidosLiteUpdateStatus } from "../shared/contracts"

export type EidosLiteReleaseChannel = "stable" | "beta"

interface UpdateInfoLike {
  version?: unknown
}

interface DownloadProgressLike {
  percent?: unknown
}

export interface EidosLiteAutoUpdater {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  channel: string | null
  setFeedURL(options: {
    provider: "generic"
    url: string
    channel: "latest" | "beta"
  }): void
  on(event: string, listener: (value: unknown) => void): unknown
  checkForUpdates(): Promise<unknown> | null
  downloadUpdate(): Promise<unknown>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
}

interface EidosLiteUpdaterLogger {
  info(event: string, context?: Record<string, unknown>): void
  warn(event: string, context?: Record<string, unknown>): void
}

interface EidosLiteUpdaterOptions {
  currentVersion: string
  platform: NodeJS.Platform
  architecture: string
  packaged: boolean
  production: boolean
  updatesEnabled: boolean
  loadAutoUpdater(): Promise<EidosLiteAutoUpdater>
  broadcast(status: EidosLiteUpdateStatus): void
  logger: EidosLiteUpdaterLogger
}

export function eidosLiteReleaseChannel(
  version: string
): EidosLiteReleaseChannel {
  return /-(?:alpha|beta|rc)(?:\.|$)/u.test(version) ? "beta" : "stable"
}

export function eidosLiteUpdateFeed(
  version: string,
  architecture: string
): {
  url: string
  channel: "latest" | "beta"
} {
  const releaseChannel = eidosLiteReleaseChannel(version)
  return {
    url: `https://download.eidos.space/lite/updates/${releaseChannel}/${architecture}`,
    channel: releaseChannel === "beta" ? "beta" : "latest",
  }
}

function versionFrom(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const version = (value as UpdateInfoLike).version
  return typeof version === "string" && version ? version : undefined
}

function progressFrom(value: unknown): number {
  if (typeof value !== "object" || value === null) return 0
  const percent = (value as DownloadProgressLike).percent
  return typeof percent === "number" && Number.isFinite(percent)
    ? Math.min(100, Math.max(0, percent))
    : 0
}

export class EidosLiteUpdater {
  private readonly supported: boolean
  private status: EidosLiteUpdateStatus
  private automaticDownloads = true
  private updaterPromise: Promise<EidosLiteAutoUpdater> | null = null

  constructor(private readonly options: EidosLiteUpdaterOptions) {
    const unavailableReason = !options.packaged
      ? "development"
      : !options.production || !options.updatesEnabled
        ? "non-production"
        : (options.platform !== "darwin" &&
              options.platform !== "win32" &&
              options.platform !== "linux") ||
            (options.architecture !== "arm64" && options.architecture !== "x64")
          ? "unsupported-platform"
          : undefined
    this.supported = unavailableReason === undefined
    this.status = unavailableReason
      ? {
          state: "unavailable",
          currentVersion: options.currentVersion,
          unavailableReason,
        }
      : { state: "idle", currentVersion: options.currentVersion }
  }

  getStatus(): EidosLiteUpdateStatus {
    return { ...this.status }
  }

  setAutomaticDownloads(enabled: boolean): void {
    this.automaticDownloads = enabled
    void this.updaterPromise
      ?.then((updater) => {
        updater.autoDownload = enabled
      })
      .catch(() => undefined)
  }

  async start(automaticDownloads: boolean): Promise<EidosLiteUpdateStatus> {
    this.setAutomaticDownloads(automaticDownloads)
    if (!this.supported) return this.getStatus()
    try {
      await this.ensureUpdater()
    } catch (error) {
      this.options.logger.warn("update.initialize.failed", {
        error: error instanceof Error ? error.message : String(error),
      })
      this.update({
        state: "error",
        currentVersion: this.options.currentVersion,
      })
      return this.getStatus()
    }
    return automaticDownloads ? this.check() : this.getStatus()
  }

  async check(): Promise<EidosLiteUpdateStatus> {
    if (!this.supported) return this.getStatus()
    if (
      this.status.state === "checking" ||
      this.status.state === "downloading"
    ) {
      return this.getStatus()
    }
    this.update({
      state: "checking",
      currentVersion: this.options.currentVersion,
    })
    try {
      const updater = await this.ensureUpdater()
      await updater.checkForUpdates()
    } catch (error) {
      this.options.logger.warn("update.check.failed", {
        error: error instanceof Error ? error.message : String(error),
      })
      this.update({
        state: "error",
        currentVersion: this.options.currentVersion,
      })
    }
    return this.getStatus()
  }

  async download(): Promise<EidosLiteUpdateStatus> {
    if (!this.supported || this.status.state !== "available") {
      return this.getStatus()
    }
    this.update({
      state: "downloading",
      currentVersion: this.options.currentVersion,
      version: this.status.version,
      progressPercent: 0,
    })
    try {
      const updater = await this.ensureUpdater()
      await updater.downloadUpdate()
    } catch (error) {
      this.options.logger.warn("update.download.failed", {
        error: error instanceof Error ? error.message : String(error),
      })
      this.update({
        state: "error",
        currentVersion: this.options.currentVersion,
      })
    }
    return this.getStatus()
  }

  async restartToInstall(): Promise<void> {
    if (!this.supported || this.status.state !== "downloaded") return
    const updater = await this.ensureUpdater()
    updater.quitAndInstall(false, true)
  }

  private ensureUpdater(): Promise<EidosLiteAutoUpdater> {
    this.updaterPromise ??= this.options
      .loadAutoUpdater()
      .then((updater) => {
        const feed = eidosLiteUpdateFeed(
          this.options.currentVersion,
          this.options.architecture
        )
        updater.autoDownload = this.automaticDownloads
        updater.autoInstallOnAppQuit = true
        updater.allowPrerelease = feed.channel === "beta"
        updater.channel = feed.channel
        updater.setFeedURL({ provider: "generic", ...feed })
        this.bindEvents(updater)
        this.options.logger.info("update.initialized", {
          channel: feed.channel,
          feed: feed.url,
        })
        return updater
      })
      .catch((error) => {
        this.updaterPromise = null
        throw error
      })
    return this.updaterPromise
  }

  private bindEvents(updater: EidosLiteAutoUpdater): void {
    updater.on("checking-for-update", () =>
      this.update({
        state: "checking",
        currentVersion: this.options.currentVersion,
      })
    )
    updater.on("update-available", (info) =>
      this.update({
        state: "available",
        currentVersion: this.options.currentVersion,
        version: versionFrom(info),
      })
    )
    updater.on("update-not-available", () =>
      this.update({
        state: "up-to-date",
        currentVersion: this.options.currentVersion,
      })
    )
    updater.on("download-progress", (progress) =>
      this.update({
        state: "downloading",
        currentVersion: this.options.currentVersion,
        version: this.status.version,
        progressPercent: progressFrom(progress),
      })
    )
    updater.on("update-downloaded", (info) =>
      this.update({
        state: "downloaded",
        currentVersion: this.options.currentVersion,
        version: versionFrom(info) ?? this.status.version,
        progressPercent: 100,
      })
    )
    updater.on("error", (error) => {
      this.options.logger.warn("update.failed", {
        error: error instanceof Error ? error.message : String(error),
      })
      this.update({
        state: "error",
        currentVersion: this.options.currentVersion,
      })
    })
  }

  private update(status: EidosLiteUpdateStatus): void {
    this.status = status
    this.options.broadcast(this.getStatus())
  }
}
