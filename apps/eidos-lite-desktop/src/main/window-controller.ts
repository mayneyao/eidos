import { installHtmlPreviewGuestGuard } from "./html-preview-view"
import { fileURLToPath } from "node:url"
import fs from "node:fs/promises"
import path from "node:path"
import type { GraftEncryptedInput } from "../shared/graft-sdk-contracts"
import type { FileHookEvent, FileHookPlan } from "@eidos.space/plugin-sdk"
import { installWindowZoom } from "./window-zoom"
import { filePropertiesIconDataUrl } from "./file-properties-icon"
import { FilePropertiesCloseCoordinator } from "./file-properties-close"
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  nativeTheme,
  screen,
  shell,
  type Event,
  type Input,
  type WebContents,
} from "electron"

import {
  IPC_CHANNELS,
  type EidosLiteAppearance,
  type EidosLiteDiagnostics,
  type EidosLitePathClipboardMode,
  type EidosLitePreferences,
  type EidosLiteSettingsDestination,
  type EidosSyncRecoveryResult,
  type SpaceSnapshot,
} from "../shared/contracts"
import { resolveEidosLiteAppearance } from "../shared/appearance"
import type { EidosLiteServiceEnvironment } from "../shared/service-environment"
import type { SparkFeature } from "../shared/spark"
import { SPACE_FILE_METADATA_PATH } from "../shared/file-metadata"
import { isEidosLiteShortcutEnabled } from "../shared/built-in-plugins"
import type { GraftTransferProgress } from "../shared/graft-sdk-contracts"
import {
  DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
  eidosLiteShortcutCommandForKeyboardEvent,
  isEidosLiteWorkspaceShortcutCommand,
} from "../shared/keyboard-shortcuts"
import { PLUGIN_CHANNELS } from "../shared/plugins"
import {
  availablePluginShortcuts,
  pluginShortcutForEvent,
} from "../shared/plugin-shortcuts"
import {
  resolveEidosLiteLocale,
  translateEidosLite,
  type EidosLiteLocale,
} from "../shared/i18n"
import {
  createEidosLiteDiagnostics,
  serializeEidosLiteDiagnostics,
} from "./diagnostics"
import {
  DEFAULT_EIDOS_LITE_PREFERENCES,
  EidosLitePreferencesStore,
} from "./app-preferences"
import { GraftClient } from "./graft/graft-client"
import { GraftUtilityTransport } from "./graft/graft-utility-transport"
import { resolveEidosFileLaunchIntent } from "./launch-intent"
import { LaunchNotificationRetry } from "./launch-notification-retry"
import { eidosLiteLogSummary, logCorrelationKey } from "./logging"
import { RuntimePool } from "./runtime/runtime-pool"
import {
  canonicalizeSpaceRoot,
  flattenSpaceTree,
  listSpaceTree,
  normalizeMutableRelativePath,
  normalizeRelativePath,
  resolveSpacePath,
} from "./space/space-paths"
import type { SpaceSession } from "./space/space-session"
import { RecentSpacesStore } from "./space/recent-spaces"
import { SessionCloseTracker } from "./space/session-close-tracker"
import { localNameForCloudSpace } from "./sync/cloud-space-name"
import {
  SpaceCloneCoordinator,
  type CloneRecoveryResult,
  type CloneProgressReporter,
} from "./sync/space-clone-coordinator"
import {
  applyMacosTrafficLightPosition,
  applyWindowsTitleBarOverlay,
  liteCompactWindowDefaultSize,
  liteWindowChromeOptions,
  macosTrafficLightPosition,
  type LiteWindowKind,
} from "./window-chrome"
import { welcomeWindowActionAfterSpaceClosed } from "./window-lifecycle"
import { TextDraftCloseCoordinator } from "./text-draft-close"
import { writeTextDraftCopy } from "./space/text-draft-copy"
import {
  centeredWindowBounds,
  fitWindowBounds,
  type LiteWindowBounds,
  LiteWindowStateStore,
} from "./window-state"

const SPACE_WINDOW_SIZE = { width: 1320, height: 860 }
const SPACE_WINDOW_MINIMUM = { width: 900, height: 600 }
const absoluteFilePropertiesPath = (root: string, relative: string) =>
  path.join(root, relative)

async function createSpaceSession(
  ...args: Parameters<(typeof SpaceSession)["createCanonical"]>
): Promise<SpaceSession> {
  const { SpaceSession } = await import("./space/space-session")
  return SpaceSession.createCanonical(...args)
}

export class WindowController {
  private sparkFeatureGuard?: (feature: SparkFeature) => Promise<void>
  setSparkFeatureGuard(guard: (feature: SparkFeature) => Promise<void>) {
    this.sparkFeatureGuard = guard
  }
  readonly textDraftClose = new TextDraftCloseCoordinator()
  readonly filePropertiesClose = new FilePropertiesCloseCoordinator()
  private readonly sessionByWebContents = new Map<number, SpaceSession>()
  private readonly propertiesWindows = new Map<
    number,
    {
      window: BrowserWindow
      owner: WebContents
      session: SpaceSession
      path: string | null
      runtimeIds: Set<string>
      deferredRuntimeIds: Set<string>
      presented: boolean
    }
  >()

  showFileProperties(owner: WebContents, relativePath: string): void {
    const session = this.requireSession(owner)
    const path = normalizeMutableRelativePath(relativePath)
    const existing = this.propertiesWindows.get(owner.id)
    if (
      existing &&
      existing.session === session &&
      !existing.window.isDestroyed()
    ) {
      existing.path = path
      if (
        process.platform === "darwin" &&
        existing.window.setRepresentedFilename
      )
        existing.window.setRepresentedFilename(
          absoluteFilePropertiesPath(session.canonical.root, path)
        )
      existing.window.webContents.send(IPC_CHANNELS.filePropertiesChanged, path)
      if (existing.presented) {
        const ownerWindow = BrowserWindow.fromWebContents(owner)
        if (
          ownerWindow &&
          !ownerWindow.isDestroyed() &&
          screen.getDisplayMatching(ownerWindow.getBounds()).id !==
            screen.getDisplayMatching(existing.window.getBounds()).id
        )
          this.presentFileProperties(existing)
        else this.focusWindow(existing.window)
      }
      return
    }
    existing?.window.close()
    // The inspector's first paint is not its ready layout. Present it only
    // after the renderer has measured the loaded form at the persisted zoom.
    const window = this.createWindow(false, "properties")
    if (process.platform === "darwin" && window.setRepresentedFilename)
      window.setRepresentedFilename(
        absoluteFilePropertiesPath(session.canonical.root, path)
      )
    let closeApproved = false
    window.on("close", (event) => {
      if (closeApproved || window.isDestroyed()) return
      event.preventDefault()
      void this.filePropertiesClose
        .prepare(window.webContents)
        .then((allowed) => {
          if (!allowed || window.isDestroyed()) return
          closeApproved = true
          window.close()
        })
    })
    const entry = {
      window,
      owner,
      session,
      path: path as string | null,
      runtimeIds: new Set<string>(),
      deferredRuntimeIds: new Set<string>(),
      presented: false,
    }
    this.propertiesWindows.set(owner.id, entry)
    void this.locale().then((locale) => {
      if (!window.isDestroyed())
        window.setTitle(translateEidosLite(locale, "File properties"))
    })
    const stop = session.onChanged((snapshot) => {
      if (
        !window.isDestroyed() &&
        snapshot.externalChangePaths?.some(
          (changed) =>
            changed === entry.path || changed === SPACE_FILE_METADATA_PATH
        )
      )
        window.webContents.send(IPC_CHANNELS.filePropertiesChanged, entry.path)
    })
    const ownerClosed = () => {
      if (!window.isDestroyed()) window.close()
    }
    owner.once("destroyed", ownerClosed)
    // A renderer that never reports a height (load failure, crash, or an
    // uncaught render error) must not leave a hidden window registered as the
    // inspector. Present the loading shell after a short fallback.
    const presentFallback = setTimeout(() => {
      if (entry.presented || window.isDestroyed()) return
      this.presentFileProperties(entry)
    }, 1_500)
    presentFallback.unref?.()
    window.once("closed", () => {
      clearTimeout(presentFallback)
      stop()
      owner.removeListener("destroyed", ownerClosed)
      if (this.propertiesWindows.get(owner.id) === entry)
        this.propertiesWindows.delete(owner.id)
      for (const runtimeId of entry.deferredRuntimeIds) {
        const stillPinned = [...this.propertiesWindows.values()].some(
          (other) =>
            other !== entry &&
            other.session === entry.session &&
            other.runtimeIds.has(runtimeId)
        )
        if (!stillPinned)
          void entry.session.closeEidosFile(runtimeId).catch(() => undefined)
      }
    })
    window.webContents.once("render-process-gone", () => {
      if (!window.isDestroyed()) window.destroy()
    })
    void this.getPreferences()
      .then(async (preferences) => {
        if (window.isDestroyed()) return
        window.webContents.setZoomFactor(preferences.uiZoom)
        this.updateWindowControls(window, preferences.appearance)
        await this.loadRenderer(window, "/file-properties")
      })
      .catch(() => {
        if (entry.presented || window.isDestroyed()) return
        this.presentFileProperties(entry)
      })
  }

  private presentFileProperties(
    entry: { window: BrowserWindow; owner: WebContents; presented: boolean },
    requested?: LiteWindowBounds
  ): void {
    if (entry.window.isDestroyed()) return
    const bounds = requested ?? entry.window.getBounds()
    const ownerWindow = entry.owner.isDestroyed()
      ? null
      : BrowserWindow.fromWebContents(entry.owner)
    const anchor =
      ownerWindow && !ownerWindow.isDestroyed() ? ownerWindow.getBounds() : null
    // Position the measured inspector before its first show. Its hidden native
    // window may have been allocated on the primary display by the OS.
    const next = fitWindowBounds(
      {
        ...bounds,
        ...(anchor
          ? {
              x: anchor.x + (anchor.width - bounds.width) / 2,
              y: anchor.y + (anchor.height - bounds.height) / 2,
            }
          : {}),
      },
      screen.getDisplayMatching(anchor ?? bounds).workArea,
      { width: 340, height: 120 }
    )
    entry.window.setBounds(next, false)
    entry.presented = true
    this.focusWindow(entry.window)
  }

  selectFileProperties(owner: WebContents, path: string | null): void {
    const entry = this.propertiesWindows.get(owner.id)
    if (!entry || entry.window.isDestroyed()) return
    if (this.sessionFor(owner) !== entry.session) {
      entry.window.close()
      return
    }
    entry.path = path ? normalizeMutableRelativePath(path) : null
    if (process.platform === "darwin" && entry.window.setRepresentedFilename)
      entry.window.setRepresentedFilename(
        entry.path
          ? absoluteFilePropertiesPath(entry.session.canonical.root, entry.path)
          : ""
      )
    entry.window.webContents.send(
      IPC_CHANNELS.filePropertiesChanged,
      entry.path
    )
  }

  filePropertiesTarget(sender: WebContents): string | null {
    for (const entry of this.propertiesWindows.values())
      if (
        entry.window.webContents === sender &&
        this.sessionByWebContents.get(entry.owner.id) === entry.session
      )
        return entry.path
    return null
  }

  replyFilePropertiesClose(
    sender: WebContents,
    token: unknown,
    allowed: unknown
  ): void {
    this.filePropertiesClose.reply(sender.id, token, allowed)
  }

  pinFilePropertiesRuntime(sender: WebContents, sessionId: string): void {
    for (const entry of this.propertiesWindows.values())
      if (entry.window.webContents === sender) entry.runtimeIds.add(sessionId)
  }

  resizeFileProperties(sender: WebContents, height: number): void {
    if (!Number.isFinite(height) || height <= 0) return
    const entry = [...this.propertiesWindows.values()].find(
      (entry) => entry.window.webContents === sender
    )
    if (!entry || entry.window.isDestroyed() || !this.sessionFor(sender)) return
    const window = entry.window
    const bounds = window.getBounds()
    const chromeHeight = bounds.height - window.getContentBounds().height
    const requested = {
      ...bounds,
      height: Math.ceil(height * sender.getZoomFactor()) + chromeHeight,
    }
    if (!entry.presented) {
      this.presentFileProperties(entry, requested)
      return
    }
    const area = screen.getDisplayMatching(bounds).workArea
    const next = fitWindowBounds(requested, area, { width: 340, height: 120 })
    if (Math.abs(next.height - bounds.height) > 1)
      window.setBounds(next, entry.presented)
  }

  async filePropertiesIcon(sender: WebContents): Promise<string | null> {
    const relativePath = this.filePropertiesTarget(sender)
    const session = this.sessionFor(sender)
    if (!relativePath || !session) return null
    const absolutePath = resolveSpacePath(session.canonical.root, relativePath)
    const realPath = await fs.realpath(absolutePath).catch(() => null)
    if (!realPath) return null
    const inside = path.relative(session.canonical.root, realPath)
    if (
      inside === ".." ||
      inside.startsWith(`..${path.sep}`) ||
      path.isAbsolute(inside)
    )
      return null
    return filePropertiesIconDataUrl(realPath)
  }

  filePropertiesRuntimePinned(sender: WebContents, sessionId: string): boolean {
    let pinned = false
    for (const entry of this.propertiesWindows.values()) {
      if (
        entry.session === this.sessionFor(sender) &&
        entry.runtimeIds.has(sessionId)
      ) {
        pinned = true
        entry.deferredRuntimeIds.add(sessionId)
      }
    }
    return pinned
  }

  notifyFilePropertiesChanged(sender: WebContents, sessionId: string): void {
    const session = this.sessionFor(sender)
    const relativePath = session?.relativePathForRuntime(sessionId)
    if (!session || !relativePath) return
    const metadataCatalogChanged = relativePath === SPACE_FILE_METADATA_PATH
    for (const entry of this.propertiesWindows.values()) {
      if (entry.session !== session || entry.window.isDestroyed()) continue
      // The editing inspector already applies its Runtime result. Echoing it
      // back reloads the form during blur/Tab and discards keyboard focus.
      if (
        entry.window.webContents !== sender &&
        (metadataCatalogChanged || entry.path === relativePath)
      )
        entry.window.webContents.send(
          IPC_CHANNELS.filePropertiesChanged,
          entry.path
        )
      if (
        entry.owner.id !== sender.id &&
        !entry.owner.isDestroyed() &&
        metadataCatalogChanged
      )
        entry.owner.send(IPC_CHANNELS.filePropertiesChanged, entry.path)
    }
  }
  private readonly windowBySpaceId = new Map<string, BrowserWindow>()
  private readonly pendingLaunchFilesByWebContents = new Map<number, string[]>()
  private readonly launchNotificationRetriesByWebContents = new Map<
    number,
    LaunchNotificationRetry
  >()
  private readonly sessionCloses = new SessionCloseTracker<SpaceSession>()
  private readonly sharedSessions = new Map<string, SpaceSession>()
  private encryptedCloneGeneration = 0
  private readonly encryptedCloneDrains = new Set<Promise<void>>()
  private readonly encryptedCloneAborts = new Set<AbortController>()

  captureEncryptedCloneTicket(): number {
    if (this.closing) throw new Error("Eidos Lite is closing")
    return this.encryptedCloneGeneration
  }

  private assertEncryptedCloneTicket(ticket: number): void {
    if (this.closing || ticket !== this.encryptedCloneGeneration)
      throw Object.assign(
        new Error("Encrypted Space download was interrupted"),
        {
          name: "AbortError",
          code: "GRAFT_SDK_E2EE_LOCKED",
        }
      )
  }

  retainDeviceSync(session: SpaceSession): void {
    this.sharedSessions.set(session.canonical.id, session)
  }

  async lockEncryptedSyncSessions(disconnect = false): Promise<void> {
    this.encryptedCloneGeneration += 1
    for (const operation of this.encryptedCloneAborts) operation.abort()
    const cloneDrain = this.cloneCoordinatorInstance?.cancelEncryptedClones()
    const sessions = new Set([
      ...this.sessionByWebContents.values(),
      ...this.sharedSessions.values(),
    ])
    const outcomes = await Promise.allSettled([
      cloneDrain,
      ...this.encryptedCloneDrains,
      ...[...sessions]
        .filter((session) => !session.isClosed)
        .map((session) =>
          disconnect
            ? session.clearHostedSyncCredentials()
            : session.lockEncryptedSync()
        ),
    ])
    if (outcomes.some((outcome) => outcome.status === "rejected"))
      throw new Error("Could not drain all encrypted Sync sessions")
  }
  async restoreDeviceSyncSpace(
    root: string,
    id: string
  ): Promise<SpaceSession> {
    if (this.closing) throw new Error("Eidos Lite is closing")
    const canonical = await canonicalizeSpaceRoot(root)
    // A replacement folder at the same path has not been authorized for sharing.
    if (canonical.id !== id)
      throw new Error("Shared Space identity has changed")
    const existing =
      this.sharedSessions.get(id) ??
      [...this.sessionByWebContents.values()].find(
        (session) => session.canonical.id === id
      )
    if (existing) return existing
    const opening = createSpaceSession(canonical, app.getPath("userData"), {
      graft: this.createGraftClient(),
      requireSparkFeature: (feature) =>
        this.sparkFeatureGuard?.(feature) ??
        Promise.reject(new Error("Spark authorization is unavailable")),
      workerPath: this.runtimeWorkerPath(),
    })
    this.openingSessions.add(opening)
    try {
      const session = await opening
      if (this.closing) {
        await this.sessionCloses.close(session)
        throw new Error("Eidos Lite is closing")
      }
      this.retainDeviceSync(session)
      return session
    } finally {
      this.openingSessions.delete(opening)
    }
  }
  async openDeviceSyncSpace(id: string): Promise<void> {
    const session = this.sharedSessions.get(id)
    if (!session)
      throw new Error(
        translateEidosLite(
          await this.locale(),
          "This Space is not shared for LAN sync."
        )
      )
    await this.createSpaceWindow(session.canonical.root)
  }

  async releaseDeviceSync(id: string): Promise<void> {
    const session = this.sharedSessions.get(id)
    this.sharedSessions.delete(id)
    if (session && ![...this.sessionByWebContents.values()].includes(session))
      await this.sessionCloses.close(session)
  }

  private closeEditorSession(session: SpaceSession): Promise<void> {
    return this.sharedSessions.get(session.canonical.id) === session
      ? Promise.resolve()
      : this.sessionCloses.close(session)
  }
  private readonly openingSessions = new Set<Promise<SpaceSession>>()
  private recentSpacesStore: RecentSpacesStore | null = null
  private preferencesStore: EidosLitePreferencesStore | null = null
  private readonly preferencesListeners = new Set<
    (preferences: EidosLitePreferences) => void
  >()
  private cloneCoordinatorInstance: SpaceCloneCoordinator | null = null
  private settingsWindow: BrowserWindow | null = null
  private settingsOwnerWindow: BrowserWindow | null = null
  private readonly windowKind = new WeakMap<BrowserWindow, LiteWindowKind>()
  private readonly windowState = new LiteWindowStateStore(
    app.getPath("userData")
  )
  private keyboardShortcuts = DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS
  private builtInPlugins = {
    ...DEFAULT_EIDOS_LITE_PREFERENCES.builtInPlugins,
  }
  private closing = false
  private readonly bindingOwners = new Set<number>()
  private readonly spaceCloseInstalled = new WeakSet<BrowserWindow>()
  private readonly detachSpaceListeners = new Map<number, () => void>()
  onSpaceReleased: (ownerId: number) => void = () => {}
  fileHookRunner?: (
    session: SpaceSession,
    event: FileHookEvent
  ) => Promise<FileHookPlan | null>

  constructor(private readonly services: EidosLiteServiceEnvironment) {
    nativeTheme.on("updated", () => {
      void this.syncWindowControlsFromPreferences()
    })
  }

  createWelcomeWindow(
    beforeLoad?: (window: BrowserWindow) => void
  ): BrowserWindow {
    const window = this.createWindow(beforeLoad === undefined, "welcome")
    beforeLoad?.(window)
    void this.loadRenderer(window)
    return window
  }

  showPluginInstall(id: string): BrowserWindow {
    return this.showSettingsWindow(`/settings/plugins/${id}`, id)
  }

  showSettingsWindow(
    route = "/settings/preferences",
    installId?: string
  ): BrowserWindow {
    const owner = BrowserWindow.getFocusedWindow()
    if (owner && owner !== this.settingsWindow) this.settingsOwnerWindow = owner
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.focusWindow(this.settingsWindow)
      if (installId) {
        if (this.settingsWindow.webContents.isLoading()) {
          void this.loadRenderer(this.settingsWindow, route)
        } else {
          this.settingsWindow.webContents.send(
            PLUGIN_CHANNELS.installIntent,
            installId
          )
        }
      }
      if (
        !installId &&
        (route === "/settings/devices" || route === "/settings/account-sync")
      ) {
        if (this.settingsWindow.webContents.isLoading())
          void this.loadRenderer(this.settingsWindow, route)
        else
          this.settingsWindow.webContents.send(
            IPC_CHANNELS.settingsNavigate,
            route === "/settings/devices" ? "devices" : "account-sync"
          )
      }
      return this.settingsWindow
    }
    const window = this.createWindow(true, "settings")
    this.settingsWindow = window
    void this.locale().then((locale) =>
      window.setTitle(`${translateEidosLite(locale, "Settings")} — Eidos Lite`)
    )
    window.once("closed", () => {
      if (this.settingsWindow === window) this.settingsWindow = null
    })
    void this.loadRenderer(window, route)
    return window
  }

  showWhatsNew(): void {
    const owner = this.settingsOwnerWindow
    const target =
      (owner && !owner.isDestroyed() ? owner : null) ??
      BrowserWindow.getAllWindows().find(
        (window) =>
          !window.isDestroyed() && this.windowKind.get(window) === "space"
      ) ??
      BrowserWindow.getAllWindows().find(
        (window) =>
          !window.isDestroyed() && this.windowKind.get(window) === "welcome"
      )
    if (target) {
      this.focusWindow(target)
      target.webContents.send(IPC_CHANNELS.whatsNewShow)
    } else {
      const window = this.createWindow(true, "welcome")
      void this.loadRenderer(window, "/whats-new")
    }
  }

  async createSpaceWindow(
    root: string,
    beforeLoad?: (window: BrowserWindow) => void,
    initialEidosFile?: string
  ): Promise<BrowserWindow> {
    const window = this.createWindow(beforeLoad === undefined, "space")
    beforeLoad?.(window)
    const snapshot = await this.bindSpace(window.webContents, root)
    if (!snapshot) {
      window.destroy()
      const existing = await this.windowForSpaceRoot(root)
      if (!existing) {
        throw new Error("The Space is already opening in another window")
      }
      if (initialEidosFile) {
        this.queueLaunchFile(existing.webContents, initialEidosFile)
      }
      return existing
    }
    if (initialEidosFile) {
      this.queueLaunchFile(window.webContents, initialEidosFile)
    }
    await this.loadRenderer(window)
    return window
  }

  async openEidosFilePath(filePath: string): Promise<BrowserWindow> {
    const openSpaceRoots = [...new Set(this.sessionByWebContents.values())].map(
      (session) => session.canonical.root
    )
    const recentSpaceRoots = (await this.recentSpaces().list())
      .filter((recent) => recent.available)
      .map((recent) => recent.path)
    const intent = await resolveEidosFileLaunchIntent(filePath, [
      ...openSpaceRoots,
      ...recentSpaceRoots,
    ])
    const existing = this.windowBySpaceId.get(intent.spaceId)
    if (existing && !existing.isDestroyed()) {
      this.focusWindow(existing)
      this.queueLaunchFile(existing.webContents, intent.relativePath)
      return existing
    }
    return this.createSpaceWindow(
      intent.spaceRoot,
      undefined,
      intent.relativePath
    )
  }

  takeLaunchEidosFile(webContents: WebContents): string | null {
    const pending = this.pendingLaunchFilesByWebContents.get(webContents.id)
    const relativePath = pending?.shift() ?? null
    if (!pending?.length) {
      this.clearPendingLaunchFiles(webContents.id)
    }
    return relativePath
  }

  focusAnyWindow(): BrowserWindow | null {
    const window =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows().at(-1)
    if (window) this.focusWindow(window)
    return window ?? null
  }

  async chooseAndBindSpace(
    webContents: WebContents
  ): Promise<SpaceSnapshot | null> {
    const parent = BrowserWindow.fromWebContents(webContents) ?? undefined
    const locale = await this.locale()
    const t = (message: string) => translateEidosLite(locale, message)
    const options: Electron.OpenDialogOptions = {
      title: t("Open Folder as Space"),
      buttonLabel: t("Open Space"),
      properties: ["openDirectory", "createDirectory"],
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    return this.bindSpace(webContents, result.filePaths[0])
  }

  async newAndBindSpace(
    webContents: WebContents
  ): Promise<SpaceSnapshot | null> {
    const parent = BrowserWindow.fromWebContents(webContents) ?? undefined
    const preferences = await this.preferences().get()
    const locale = resolveEidosLiteLocale(preferences.language, app.getLocale())
    const t = (message: string) => translateEidosLite(locale, message)
    const options: Electron.SaveDialogOptions = {
      title: t("Create Space"),
      buttonLabel: t("Create Space"),
      defaultPath: path.join(
        preferences.defaultSpaceLocation ?? app.getPath("documents"),
        t("Untitled Space")
      ),
      nameFieldLabel: t("Space name"),
      properties: ["createDirectory", "showOverwriteConfirmation"],
    }
    const result = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    await fs.mkdir(result.filePath)
    try {
      return await this.bindSpace(webContents, result.filePath)
    } catch (error) {
      await fs.rmdir(result.filePath).catch(() => undefined)
      throw error
    }
  }

  async cloneAndBindSpace(
    webContents: WebContents,
    remoteUrl: string,
    accessToken: string,
    displayName?: string,
    reportProgress: CloneProgressReporter = () => undefined,
    reportTransfer: (progress: GraftTransferProgress) => void = () => undefined,
    encryption?: GraftEncryptedInput,
    encryptedTicket = this.captureEncryptedCloneTicket()
  ): Promise<SpaceSnapshot | null> {
    const assertAdmission = encryption
      ? () => this.assertEncryptedCloneTicket(encryptedTicket)
      : undefined
    assertAdmission?.()
    const parent = BrowserWindow.fromWebContents(webContents) ?? undefined
    const locale = await this.locale()
    const t = (message: string) => translateEidosLite(locale, message)
    const repositoryNameFallback =
      new URL(remoteUrl).pathname.split("/").filter(Boolean).at(-1) ??
      "Synced Space"
    const repositoryName = localNameForCloudSpace(
      displayName,
      repositoryNameFallback
    )
    const options: Electron.SaveDialogOptions = {
      title: t("Open Synced Space"),
      buttonLabel: t("Save Local Copy"),
      defaultPath: path.join(app.getPath("documents"), repositoryName),
      nameFieldLabel: t("Space name"),
      properties: ["createDirectory", "showOverwriteConfirmation"],
    }
    const result = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    assertAdmission?.()
    let finishDrain = () => {}
    let failDrain = (_error: unknown) => {}
    const operationAbort = encryption ? new AbortController() : undefined
    if (operationAbort) this.encryptedCloneAborts.add(operationAbort)
    const drained = encryption
      ? new Promise<void>((resolve, reject) => {
          finishDrain = resolve
          failDrain = reject
        })
      : undefined
    if (drained) {
      this.encryptedCloneDrains.add(drained)
      void drained.catch(() => undefined)
    }
    let drainFailure: unknown
    try {
      const target = await this.cloneCoordinator().clone(
        result.filePath,
        remoteUrl,
        accessToken,
        reportProgress,
        reportTransfer,
        encryption
      )
      assertAdmission?.()
      const snapshot = await this.bindSpace(
        webContents,
        target,
        assertAdmission
      )
      // Draft cancellation or an already-open target leaves the original session
      // attached. Never apply the downloaded repository's key to that session.
      if (!snapshot || !encryption) return snapshot
      const downloaded = this.requireSession(webContents)
      try {
        assertAdmission?.()
        await downloaded.unlockEncryptedSync(
          {
            ...encryption,
            password: Buffer.from(encryption.password),
            stateIdentity: target,
          },
          assertAdmission,
          operationAbort?.signal
        )
        assertAdmission?.()
        return snapshot
      } catch (error) {
        try {
          await downloaded.lockEncryptedSync()
        } catch (lockError) {
          drainFailure = lockError
          throw lockError
        }
        throw error
      }
    } finally {
      if (drainFailure) failDrain(drainFailure)
      else finishDrain()
      if (drained) this.encryptedCloneDrains.delete(drained)
      if (operationAbort) this.encryptedCloneAborts.delete(operationAbort)
    }
  }

  async copyLocalRecoverySpace(
    webContents: WebContents
  ): Promise<EidosSyncRecoveryResult | null> {
    const session = this.requireSession(webContents)
    const targetPath = await this.chooseRecoveryTarget(
      webContents,
      "Keep Local as Recovery Space",
      "Create Recovery Space",
      `${session.canonical.name} Local Recovery`
    )
    if (!targetPath) return null
    const target = await session.createLocalRecovery((sourceRoot) =>
      this.cloneCoordinator().copyLocalRecovery(sourceRoot, targetPath)
    )
    const canonical = await canonicalizeSpaceRoot(target)
    await this.createSpaceWindow(target)
    return {
      kind: "local-copy",
      name: canonical.name,
      displayPath: canonical.displayPath,
      connected: false,
    }
  }

  async cloneHostedRecoverySpace(
    webContents: WebContents,
    remoteUrl: string,
    accessToken: string
  ): Promise<EidosSyncRecoveryResult | null> {
    this.requireSession(webContents)
    const repositoryName =
      new URL(remoteUrl).pathname.split("/").filter(Boolean).at(-1) ??
      "Hosted Space"
    const targetPath = await this.chooseRecoveryTarget(
      webContents,
      "Clone Hosted as Recovery Space",
      "Clone Hosted Space",
      `${repositoryName} Hosted Recovery`
    )
    if (!targetPath) return null
    const target = await this.cloneCoordinator().clone(
      targetPath,
      remoteUrl,
      accessToken
    )
    const canonical = await canonicalizeSpaceRoot(target)
    await this.createSpaceWindow(target)
    return {
      kind: "hosted-clone",
      name: canonical.name,
      displayPath: canonical.displayPath,
      connected: true,
    }
  }

  async recoverCloneOperations(): Promise<CloneRecoveryResult> {
    const result = await this.cloneCoordinator().recoverInterrupted()
    for (const warning of result.warnings) {
      console.warn("Could not recover an interrupted Space clone", warning)
    }
    return result
  }

  listRecentSpaces() {
    return this.recentSpaces().list()
  }

  async openRecentSpace(
    webContents: WebContents,
    id: string
  ): Promise<SpaceSnapshot | null> {
    const recentPath = await this.recentSpaces().pathFor(id)
    if (!recentPath) throw new Error("This recent Space is no longer known")
    return this.bindSpace(webContents, recentPath)
  }

  async removeRecentSpace(id: string) {
    const store = this.recentSpaces()
    await store.remove(id)
    return store.list()
  }

  sessionFor(webContents: WebContents): SpaceSession | null {
    const own = this.sessionByWebContents.get(webContents.id)
    if (own) return own
    for (const entry of this.propertiesWindows.values())
      if (
        entry.window.webContents === webContents &&
        this.sessionByWebContents.get(entry.owner.id) === entry.session
      )
        return entry.session
    return null
  }

  requireSession(webContents: WebContents): SpaceSession {
    const session = this.sessionFor(webContents)
    if (!session) throw new Error("Open a Space first")
    return session
  }

  async diagnostics(webContents: WebContents): Promise<EidosLiteDiagnostics> {
    const session = this.sessionFor(webContents)
    const snapshot = session ? await session.snapshot() : null
    const logs = eidosLiteLogSummary()
    return createEidosLiteDiagnostics({
      app: {
        name: app.getName(),
        version: app.getVersion(),
        packaged: app.isPackaged,
      },
      platform: process.platform,
      arch: process.arch,
      electronVersion: process.versions.electron ?? "unknown",
      environment: this.services.name,
      logs,
      ...(session && snapshot
        ? {
            space: {
              eidosFileCount: snapshot.eidosFileCount,
              operation: {
                phase: snapshot.operation.phase,
                recoverable: snapshot.operation.recoverable,
              },
              graft: {
                available: snapshot.graft.available,
                backend: snapshot.graft.backend,
                version: snapshot.graft.version,
                expectedVersion: snapshot.graft.expectedVersion,
                initialized: snapshot.graft.initialized,
                clean: snapshot.graft.clean,
              },
              residentRuntimeCount:
                session.runtimePool.residentRelativePaths().length,
              trackedRuntimeCount:
                session.runtimePool.openRelativePaths().length,
            },
          }
        : {}),
    })
  }

  async copyDiagnostics(
    webContents: WebContents
  ): Promise<EidosLiteDiagnostics> {
    const diagnostics = await this.diagnostics(webContents)
    clipboard.writeText(serializeEidosLiteDiagnostics(diagnostics))
    return diagnostics
  }

  async getPreferences(): Promise<EidosLitePreferences> {
    const preferences = await this.preferences().get()
    this.keyboardShortcuts = preferences.keyboardShortcuts
    this.builtInPlugins = preferences.builtInPlugins
    return preferences
  }

  async updatePreferences(
    patch: Partial<EidosLitePreferences>
  ): Promise<EidosLitePreferences> {
    const preferences = await this.preferences().update(patch)
    this.keyboardShortcuts = preferences.keyboardShortcuts
    this.builtInPlugins = preferences.builtInPlugins
    this.broadcastPreferences(preferences)
    for (const listener of this.preferencesListeners) listener(preferences)
    return preferences
  }

  onPreferencesChanged(
    listener: (preferences: EidosLitePreferences) => void
  ): () => void {
    this.preferencesListeners.add(listener)
    return () => this.preferencesListeners.delete(listener)
  }

  private pluginShortcuts = new WeakMap<WebContents, Set<string>>()

  setPluginShortcuts(owner: WebContents, value: unknown): string[] {
    const accepted = availablePluginShortcuts(
      value,
      this.keyboardShortcuts,
      process.platform === "darwin"
    )
    this.pluginShortcuts.set(owner, new Set(accepted))
    return accepted
  }

  handleWorkspaceShortcutInput(
    owner: WebContents,
    event: Event,
    input: Input
  ): void {
    if (input.type !== "keyDown") return
    const ownerWindow = BrowserWindow.fromWebContents(owner)
    if (ownerWindow && this.windowKind.get(ownerWindow) === "settings") return
    const command = eidosLiteShortcutCommandForKeyboardEvent(
      {
        key: input.key,
        code: input.code,
        altKey: input.alt,
        ctrlKey: input.control,
        metaKey: input.meta,
        shiftKey: input.shift,
        repeat: input.isAutoRepeat,
      },
      this.keyboardShortcuts,
      process.platform === "darwin"
    )
    // Editor-scoped shortcuts must reach the renderer DOM. Only global
    // workspace commands are intercepted before Electron dispatches them.
    if (command === "format-document" && input.isComposing) return
    if (!command) {
      const match = pluginShortcutForEvent(
        {
          key: input.key,
          code: input.code,
          altKey: input.alt,
          ctrlKey: input.control,
          metaKey: input.meta,
          shiftKey: input.shift,
          repeat: input.isAutoRepeat,
          isComposing: input.isComposing,
        },
        this.pluginShortcuts.get(owner) ?? new Set(),
        process.platform === "darwin"
      )
      if (match && !owner.isDestroyed()) {
        event.preventDefault()
        owner.send(PLUGIN_CHANNELS.shortcut, match)
      }
      return
    }
    if (!isEidosLiteWorkspaceShortcutCommand(command)) return
    if (!isEidosLiteShortcutEnabled(command, this.builtInPlugins)) return
    event.preventDefault()
    if (!owner.isDestroyed()) {
      owner.send(IPC_CHANNELS.workspaceShortcutCommand, command)
    }
  }

  async chooseDefaultSpaceLocation(
    webContents: WebContents
  ): Promise<EidosLitePreferences | null> {
    const parent = BrowserWindow.fromWebContents(webContents) ?? undefined
    const current = await this.preferences().get()
    const locale = resolveEidosLiteLocale(current.language, app.getLocale())
    const t = (message: string) => translateEidosLite(locale, message)
    const options: Electron.OpenDialogOptions = {
      title: t("Choose Default Location for New Spaces"),
      buttonLabel: t("Use This Folder"),
      defaultPath: current.defaultSpaceLocation ?? app.getPath("documents"),
      properties: ["openDirectory", "createDirectory"],
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    return this.updatePreferences({ defaultSpaceLocation: result.filePaths[0] })
  }

  async openSettingsDestination(
    destination: EidosLiteSettingsDestination
  ): Promise<void> {
    if (destination === "devices" || destination === "account-sync") {
      this.showSettingsWindow(`/settings/${destination}`)
      return
    }
    if (destination === "logs") {
      const error = await shell.openPath(app.getPath("logs"))
      if (error) throw new Error(error)
      return
    }
    await shell.openExternal(
      destination === "documentation"
        ? "https://docs.eidos.space"
        : destination === "github"
          ? "https://github.com/mayneyao/eidos"
          : "https://eidos.space"
    )
  }

  async reveal(webContents: WebContents, relativePath: string): Promise<void> {
    shell.showItemInFolder(
      this.requireSession(webContents).resolveUserPath(relativePath)
    )
  }

  async openPath(
    webContents: WebContents,
    relativePath: string
  ): Promise<void> {
    const error = await shell.openPath(
      this.requireSession(webContents).resolveUserPath(relativePath)
    )
    if (error) throw new Error(error)
  }

  copyPathText(
    webContents: WebContents,
    relativePath: string,
    mode: EidosLitePathClipboardMode
  ): void {
    const session = this.requireSession(webContents)
    clipboard.writeText(
      mode === "absolute"
        ? session.resolveUserPath(relativePath)
        : normalizeRelativePath(relativePath)
    )
  }

  deletePath(webContents: WebContents, relativePath: string) {
    return this.requireSession(webContents).deletePath(relativePath, (target) =>
      shell.trashItem(target)
    )
  }

  async chooseFilesToImport(
    webContents: WebContents,
    targetDirectory: string | null
  ) {
    const parent = BrowserWindow.fromWebContents(webContents) ?? undefined
    const locale = await this.locale()
    const t = (message: string) => translateEidosLite(locale, message)
    const options: Electron.OpenDialogOptions = {
      title: t("Import files into Space"),
      buttonLabel: t("Import"),
      properties: ["openFile", "multiSelections"],
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return this.requireSession(webContents).importFiles(
      result.filePaths,
      targetDirectory
    )
  }

  async saveCsvFile(
    webContents: WebContents,
    suggestedName: string,
    bytes: Uint8Array
  ): Promise<boolean> {
    this.requireSession(webContents)
    const parent = BrowserWindow.fromWebContents(webContents) ?? undefined
    const locale = await this.locale()
    const t = (message: string) => translateEidosLite(locale, message)
    const candidate = path
      .basename(suggestedName.replace(/\\/g, "/"))
      .replace(/[\0\r\n]/g, "")
      .trim()
      .slice(0, 200)
    const segment =
      candidate && candidate !== "." && candidate !== ".."
        ? candidate
        : "Eidos File export"
    const fileName = segment.toLowerCase().endsWith(".csv")
      ? segment
      : `${segment}.csv`
    const options: Electron.SaveDialogOptions = {
      title: t("Export Eidos File CSV"),
      buttonLabel: t("Export CSV"),
      defaultPath: path.join(app.getPath("downloads"), fileName),
      filters: [{ name: "CSV", extensions: ["csv"] }],
      properties: ["showOverwriteConfirmation"],
    }
    const result = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return false
    await fs.writeFile(result.filePath, bytes)
    return true
  }

  async closeAll(): Promise<void> {
    this.closing = true
    this.encryptedCloneGeneration += 1
    for (const operation of this.encryptedCloneAborts) operation.abort()
    const cloneDrain = Promise.all([
      this.cloneCoordinatorInstance?.cancelEncryptedClones(),
      ...this.encryptedCloneDrains,
    ]).then(
      () => null,
      (error: unknown) => ({ error })
    )
    const opening = await Promise.allSettled([...this.openingSessions])
    for (const result of opening) {
      if (result.status === "fulfilled") {
        this.sessionCloses.close(result.value)
      }
    }
    for (const session of new Set(this.sessionByWebContents.values())) {
      this.sessionCloses.close(session)
    }
    for (const session of this.sharedSessions.values())
      this.sessionCloses.close(session)
    this.sharedSessions.clear()
    this.sessionByWebContents.clear()
    this.windowBySpaceId.clear()
    this.pendingLaunchFilesByWebContents.clear()
    for (const retry of this.launchNotificationRetriesByWebContents.values()) {
      retry.cancel()
    }
    this.launchNotificationRetriesByWebContents.clear()
    await this.sessionCloses.waitForAll()
    const cloneFailure = await cloneDrain
    if (cloneFailure) throw cloneFailure.error
  }

  async prepareTextDraftsForShutdown(): Promise<boolean> {
    const windows = [...this.windowBySpaceId.values()]
    try {
      for (const window of windows) {
        if (
          window.isDestroyed() ||
          !(await this.textDraftClose.prepare(window.webContents))
        ) {
          throw new Error("Draft closure cancelled")
        }
      }
      return true
    } catch {
      for (const candidate of windows) {
        if (!candidate.isDestroyed())
          this.textDraftClose.cancel(candidate.webContents)
      }
      return false
    }
  }

  async chooseTextDraftClose(
    owner: WebContents,
    paths: string[]
  ): Promise<"save" | "discard" | "cancel"> {
    this.requireSession(owner)
    const window = BrowserWindow.fromWebContents(owner)
    if (!window) return "cancel"
    const locale = await this.locale()
    const t = (message: string) => translateEidosLite(locale, message)
    const result = await dialog.showMessageBox(window, {
      type: "warning",
      message: t("Save changes before closing?"),
      detail: paths.slice(0, 20).join("\n"),
      buttons: [t("Save all"), t("Discard changes"), t("Cancel")],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
    })
    return (["save", "discard", "cancel"] as const)[result.response] ?? "cancel"
  }

  async saveTextDraftCopy(
    owner: WebContents,
    relativePath: string,
    content: string
  ): Promise<boolean> {
    const session = this.requireSession(owner)
    const source = session.resolveUserPath(relativePath)
    const window = BrowserWindow.fromWebContents(owner)
    if (!window) return false
    const extension = path.extname(source)
    const result = await dialog.showSaveDialog(window, {
      title: translateEidosLite(await this.locale(), "Save a copy"),
      defaultPath: `${source.slice(0, source.length - extension.length)}-copy${extension}`,
    })
    if (result.canceled || !result.filePath) return false
    // A copy must never overwrite the original or another existing file.
    const destination = result.filePath
    await session.gate.withMutation(() =>
      writeTextDraftCopy(destination, content)
    )
    return true
  }

  private async bindSpace(
    webContents: WebContents,
    root: string,
    assertAdmission?: () => void
  ): Promise<SpaceSnapshot | null> {
    const ownerWindow = BrowserWindow.fromWebContents(webContents)
    if (ownerWindow && this.windowKind.get(ownerWindow) === "properties")
      throw new Error("File properties cannot open a Space")
    if (this.bindingOwners.has(webContents.id))
      throw new Error("A Space is already opening")
    this.bindingOwners.add(webContents.id)
    try {
      return await this.bindSpaceNow(webContents, root, assertAdmission)
    } finally {
      this.bindingOwners.delete(webContents.id)
      this.textDraftClose.cancel(webContents)
    }
  }

  private async bindSpaceNow(
    webContents: WebContents,
    root: string,
    assertAdmission?: () => void
  ): Promise<SpaceSnapshot | null> {
    assertAdmission?.()
    if (this.closing) throw new Error("Eidos Lite is closing")
    const canonical = await canonicalizeSpaceRoot(root)
    assertAdmission?.()
    const existing = this.windowBySpaceId.get(canonical.id)
    if (existing && !existing.isDestroyed()) {
      if (existing.isMinimized()) existing.restore()
      existing.show()
      existing.focus()
      return null
    }
    const window = BrowserWindow.fromWebContents(webContents)
    if (!window) {
      throw new Error("The requesting window no longer exists")
    }
    this.windowBySpaceId.set(canonical.id, window)
    let session: SpaceSession
    const opening = this.sharedSessions.has(canonical.id)
      ? Promise.resolve(this.sharedSessions.get(canonical.id)!)
      : createSpaceSession(canonical, app.getPath("userData"), {
          graft: this.createGraftClient(),
          requireSparkFeature: (feature) =>
            this.sparkFeatureGuard?.(feature) ??
            Promise.reject(new Error("Spark authorization is unavailable")),
          workerPath: this.runtimeWorkerPath(),
        })
    this.openingSessions.add(opening)
    try {
      session = await opening
    } catch (error) {
      if (this.windowBySpaceId.get(canonical.id) === window) {
        this.windowBySpaceId.delete(canonical.id)
      }
      throw error
    } finally {
      this.openingSessions.delete(opening)
    }
    if (this.closing || window.isDestroyed() || webContents.isDestroyed()) {
      if (this.windowBySpaceId.get(canonical.id) === window) {
        this.windowBySpaceId.delete(canonical.id)
      }
      await this.closeEditorSession(session)
      throw new Error("The requesting window no longer exists")
    }
    let snapshot: SpaceSnapshot
    try {
      snapshot = await session.snapshot()
      assertAdmission?.()
    } catch (error) {
      this.windowBySpaceId.delete(canonical.id)
      await this.closeEditorSession(session)
      throw error
    }
    const previous = this.sessionByWebContents.get(webContents.id)
    if (previous && !(await this.textDraftClose.prepare(webContents))) {
      this.windowBySpaceId.delete(canonical.id)
      await this.closeEditorSession(session)
      return null
    }
    try {
      assertAdmission?.()
    } catch (error) {
      this.windowBySpaceId.delete(canonical.id)
      await this.closeEditorSession(session)
      throw error
    }
    if (window.isDestroyed() || this.closing) {
      this.windowBySpaceId.delete(canonical.id)
      await this.closeEditorSession(session)
      return null
    }
    if (previous) {
      try {
        await this.closeEditorSession(previous)
      } catch (error) {
        this.windowBySpaceId.delete(canonical.id)
        await this.closeEditorSession(session)
        throw error
      }
      this.detachSpaceListeners.get(webContents.id)?.()
      this.windowBySpaceId.delete(previous.canonical.id)
      this.clearPendingLaunchFiles(webContents.id)
      this.onSpaceReleased(webContents.id)
    }
    this.sessionByWebContents.set(webContents.id, session)
    session.fileHookRunner = (event) =>
      this.fileHookRunner?.(session, event) ?? Promise.resolve(null)
    if (!this.spaceCloseInstalled.has(window)) {
      this.spaceCloseInstalled.add(window)
      let closeApproved = false
      let checkingDrafts = false
      window.on("close", (event) => {
        if (this.closing || closeApproved) return
        event.preventDefault()
        if (this.bindingOwners.has(webContents.id)) return
        if (checkingDrafts) return
        checkingDrafts = true
        void this.textDraftClose.prepare(webContents).then((allowed) => {
          checkingDrafts = false
          if (allowed && !window.isDestroyed()) {
            closeApproved = true
            window.close()
          } else {
            this.textDraftClose.cancel(webContents)
          }
        })
      })
      window.once("closed", () => this.textDraftClose.cancel(webContents))
    }
    this.promoteToSpaceWindow(window)
    const unsubscribe = session.onChanged((snapshot) => {
      if (
        !webContents.isDestroyed() &&
        this.sessionByWebContents.get(webContents.id) === session
      ) {
        webContents.send(IPC_CHANNELS.spaceChanged, snapshot)
      }
    })
    window.setTitle(`${session.canonical.name} — Eidos Lite`)
    const onClosed = () => {
      if (this.sessionByWebContents.get(webContents.id) !== session) return
      this.detachSpaceListeners.get(webContents.id)?.()
      this.sessionByWebContents.delete(webContents.id)
      this.clearPendingLaunchFiles(webContents.id)
      if (this.windowBySpaceId.get(session.canonical.id) === window) {
        this.windowBySpaceId.delete(session.canonical.id)
      }
      void this.closeEditorSession(session).catch((error: unknown) => {
        console.error("Failed to close Space session", error)
      })
      this.showWelcomeAfterSpaceClosed()
    }
    window.once("closed", onClosed)
    this.detachSpaceListeners.set(webContents.id, () => {
      unsubscribe()
      window.removeListener("closed", onClosed)
      this.detachSpaceListeners.delete(webContents.id)
    })
    await this.recentSpaces()
      .record(session.canonical)
      .catch((error) => {
        console.warn("Could not update recent Spaces", error)
      })
    return snapshot
  }

  private recentSpaces(): RecentSpacesStore {
    this.recentSpacesStore ??= new RecentSpacesStore(
      path.join(app.getPath("userData"), "recent-spaces.json")
    )
    return this.recentSpacesStore
  }

  private preferences(): EidosLitePreferencesStore {
    this.preferencesStore ??= new EidosLitePreferencesStore(
      path.join(app.getPath("userData"), "preferences.json")
    )
    return this.preferencesStore
  }

  /** Resolved Settings language, shared with main-process copy and native dialogs. */
  async locale(): Promise<EidosLiteLocale> {
    const preferences = await this.preferences().get()
    return resolveEidosLiteLocale(preferences.language, app.getLocale())
  }

  private updateWindowControls(
    window: BrowserWindow,
    appearance: EidosLiteAppearance
  ): void {
    // Native inspector title bars and system date pickers must follow the same
    // preference as the renderer, including an explicit app-only dark theme.
    if (process.platform === "darwin" && nativeTheme.themeSource !== appearance)
      nativeTheme.themeSource = appearance
    if (this.windowKind.get(window) === "properties") return
    applyWindowsTitleBarOverlay(
      window,
      resolveEidosLiteAppearance(appearance, nativeTheme.shouldUseDarkColors)
    )
  }

  private async syncWindowControlsFromPreferences(): Promise<void> {
    if (process.platform !== "win32") return
    const preferences = await this.getPreferences()
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        this.updateWindowControls(window, preferences.appearance)
      }
    }
  }

  private broadcastPreferences(preferences: EidosLitePreferences): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.setZoomFactor(preferences.uiZoom)
        window.webContents.send(IPC_CHANNELS.preferencesChanged, preferences)
        this.updateWindowControls(window, preferences.appearance)
      }
    }
  }

  private async windowForSpaceRoot(
    root: string
  ): Promise<BrowserWindow | null> {
    const canonical = await canonicalizeSpaceRoot(root)
    const existing = this.windowBySpaceId.get(canonical.id)
    if (!existing || existing.isDestroyed()) return null
    this.focusWindow(existing)
    return existing
  }

  private focusWindow(window: BrowserWindow): void {
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  private showWelcomeAfterSpaceClosed(): void {
    const windows = BrowserWindow.getAllWindows().filter(
      (window) => !window.isDestroyed()
    )
    const action = welcomeWindowActionAfterSpaceClosed(
      this.closing,
      windows.map((window) => this.windowKind.get(window) ?? "space")
    )
    if (action === "create") {
      this.createWelcomeWindow()
      return
    }
    if (action === "focus") {
      const welcome = windows.find(
        (window) => this.windowKind.get(window) === "welcome"
      )
      if (welcome) this.focusWindow(welcome)
    }
  }

  private queueLaunchFile(
    webContents: WebContents,
    relativePath: string
  ): void {
    if (webContents.isDestroyed()) return
    const pending =
      this.pendingLaunchFilesByWebContents.get(webContents.id) ?? []
    if (pending.at(-1) !== relativePath) pending.push(relativePath)
    this.pendingLaunchFilesByWebContents.set(webContents.id, pending)
    const retry =
      this.launchNotificationRetriesByWebContents.get(webContents.id) ??
      new LaunchNotificationRetry()
    this.launchNotificationRetriesByWebContents.set(webContents.id, retry)
    retry.notifyUntil(
      () =>
        !webContents.isDestroyed() &&
        Boolean(
          this.pendingLaunchFilesByWebContents.get(webContents.id)?.length
        ),
      () => webContents.send(IPC_CHANNELS.launchFileAvailable)
    )
  }

  private clearPendingLaunchFiles(webContentsId: number): void {
    this.pendingLaunchFilesByWebContents.delete(webContentsId)
    this.launchNotificationRetriesByWebContents.get(webContentsId)?.cancel()
    this.launchNotificationRetriesByWebContents.delete(webContentsId)
  }

  private async chooseRecoveryTarget(
    webContents: WebContents,
    title: string,
    buttonLabel: string,
    defaultName: string
  ): Promise<string | null> {
    const parent = BrowserWindow.fromWebContents(webContents) ?? undefined
    const options: Electron.SaveDialogOptions = {
      title,
      buttonLabel,
      defaultPath: path.join(app.getPath("documents"), defaultName),
      nameFieldLabel: "Space name",
      properties: ["createDirectory", "showOverwriteConfirmation"],
    }
    const result = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
    return result.canceled || !result.filePath ? null : result.filePath
  }

  private cloneCoordinator(): SpaceCloneCoordinator {
    this.cloneCoordinatorInstance ??= new SpaceCloneCoordinator({
      stateDirectory: app.getPath("userData"),
      remoteOrigin: this.services.syncRemoteOrigin,
      createGraftClient: () => this.createGraftClient(),
      validateWorktree: async (root) => {
        const entries = flattenSpaceTree(await listSpaceTree(root))
        if (entries.some((entry) => entry.kind === "symlink")) {
          throw new Error("A cloned Space cannot contain symlinks")
        }
        const eidosFiles = entries
          .filter((entry) => entry.kind === "eidos")
          .map((entry) => entry.relativePath)
        if (eidosFiles.length === 0) {
          throw new Error("The Hosted Space contains no .eidos files")
        }
        const runtime = new RuntimePool(root, this.runtimeWorkerPath())
        try {
          await runtime.validatePaths(eidosFiles)
        } finally {
          await runtime.destroy()
        }
      },
    })
    return this.cloneCoordinatorInstance
  }

  private createGraftClient(): GraftClient {
    return new GraftClient({
      syncRemoteOrigin: this.services.syncRemoteOrigin,
      sdkTransport: new GraftUtilityTransport(
        fileURLToPath(new URL("./graft-worker.js", import.meta.url)),
        {
          repositoryKey: (root) => logCorrelationKey(root),
        }
      ),
    })
  }

  private runtimeWorkerPath(): string {
    return fileURLToPath(new URL("./runtime-worker.js", import.meta.url))
  }

  private createWindow(
    showWhenReady = true,
    kind: LiteWindowKind = "space"
  ): BrowserWindow {
    const compact = kind !== "space"
    const bounds =
      kind === "space"
        ? this.resolveSpaceWindowBounds()
        : liteCompactWindowDefaultSize(kind)
    const chrome =
      kind === "properties"
        ? { titleBarStyle: "default" as const, autoHideMenuBar: true }
        : liteWindowChromeOptions()
    const window = new BrowserWindow({
      ...bounds,
      minWidth: kind === "properties" ? 340 : compact ? 680 : 900,
      minHeight: kind === "properties" ? 120 : compact ? 520 : 600,
      ...(kind === "properties"
        ? { maximizable: false, fullscreenable: false }
        : {}),
      show: false,
      title: "Eidos Lite",
      titleBarStyle: chrome.titleBarStyle,
      autoHideMenuBar: chrome.autoHideMenuBar,
      ...(chrome.titleBarOverlay
        ? { titleBarOverlay: chrome.titleBarOverlay }
        : {}),
      ...(process.platform === "darwin" && kind !== "properties"
        ? {
            trafficLightPosition: macosTrafficLightPosition(kind),
            vibrancy: "under-window" as const,
            visualEffectState: "active" as const,
          }
        : {}),
      backgroundColor: process.platform === "darwin" ? "#00000000" : "#f7f7f5",
      webPreferences: {
        preload: fileURLToPath(new URL("./preload.js", import.meta.url)),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: true,
      },
    })
    this.windowKind.set(window, kind)
    this.updateWindowControls(window, DEFAULT_EIDOS_LITE_PREFERENCES.appearance)
    installHtmlPreviewGuestGuard(window.webContents)
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
    window.webContents.on("will-navigate", (event) => event.preventDefault())
    window.webContents.on("will-frame-navigate", (event) => {
      if (event.isMainFrame) return
      // A guest may not navigate to a URL containing document contents.
      let initial = false
      try {
        const url = event.frame?.url
        initial = !url || url === "about:blank"
      } catch {
        // Chromium may already have disposed an iframe removed during navigation.
        event.preventDefault()
        return
      }
      if (
        !initial ||
        !/^eidos-plugin:\/\/[a-f0-9-]+\/index\.html$/.test(event.url)
      )
        event.preventDefault()
    })
    window.webContents.on("before-input-event", (event, input) =>
      this.handleWorkspaceShortcutInput(window.webContents, event, input)
    )
    installWindowZoom(window, async () => (await this.getPreferences()).uiZoom)
    window.on("app-command", (_event, command) => {
      if (command === "browser-backward") {
        window.webContents.send(IPC_CHANNELS.navigationCommand, "back")
      } else if (command === "browser-forward") {
        window.webContents.send(IPC_CHANNELS.navigationCommand, "forward")
      }
    })
    this.trackWindowState(window, kind)
    if (showWhenReady)
      window.once("ready-to-show", () => {
        void this.getPreferences().then((preferences) => {
          if (window.isDestroyed()) return
          window.webContents.setZoomFactor(preferences.uiZoom)
          this.updateWindowControls(window, preferences.appearance)
          window.show()
        })
      })
    return window
  }

  private resolveSpaceWindowBounds(
    reference?: LiteWindowBounds
  ): LiteWindowBounds {
    const saved = this.windowState.getSpaceBounds()
    const display = saved
      ? screen.getDisplayMatching(saved)
      : reference
        ? screen.getDisplayMatching(reference)
        : screen.getPrimaryDisplay()
    const workArea = display.workArea
    if (saved) return fitWindowBounds(saved, workArea, SPACE_WINDOW_MINIMUM)
    return centeredWindowBounds(SPACE_WINDOW_SIZE, workArea)
  }

  private promoteToSpaceWindow(window: BrowserWindow): void {
    if (this.windowKind.get(window) === "space") return
    this.windowKind.set(window, "space")
    applyMacosTrafficLightPosition(window, "space")
    window.setMinimumSize(
      SPACE_WINDOW_MINIMUM.width,
      SPACE_WINDOW_MINIMUM.height
    )
    if (!window.isMaximized() && !window.isFullScreen()) {
      window.setBounds(this.resolveSpaceWindowBounds(window.getBounds()), true)
    }
  }

  private trackWindowState(window: BrowserWindow, kind: LiteWindowKind): void {
    this.windowKind.set(window, kind)
    let saveTimer: ReturnType<typeof setTimeout> | null = null
    const save = () => {
      if (this.windowKind.get(window) !== "space" || window.isDestroyed())
        return
      if (window.isMinimized() || window.isMaximized() || window.isFullScreen())
        return
      this.windowState.saveSpaceBounds(window.getNormalBounds())
    }
    const scheduleSave = () => {
      if (this.windowKind.get(window) !== "space") return
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        saveTimer = null
        save()
      }, 250)
    }
    window.on("move", scheduleSave)
    window.on("resize", scheduleSave)
    window.once("close", () => {
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = null
      save()
    })
  }

  private loadRenderer(window: BrowserWindow, route?: string): Promise<void> {
    const developmentUrl = process.env.VITE_DEV_SERVER_URL
    if (developmentUrl) {
      const url = new URL(developmentUrl)
      if (route) url.hash = route
      return window.loadURL(url.toString()).then(() => {
        console.info("[lite:dev] Renderer loaded:", window.webContents.getURL())
      })
    }
    return window.loadFile(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../dist/index.html"
      ),
      route ? { hash: route } : undefined
    )
  }
}
