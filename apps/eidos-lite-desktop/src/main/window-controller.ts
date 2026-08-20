import { fileURLToPath } from "node:url"
import fs from "node:fs/promises"
import path from "node:path"
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  screen,
  shell,
  type Event,
  type Input,
  type WebContents,
} from "electron"

import {
  IPC_CHANNELS,
  type EidosLiteDiagnostics,
  type EidosLitePathClipboardMode,
  type EidosLitePreferences,
  type EidosLiteSettingsDestination,
  type EidosSyncRecoveryResult,
  type SpaceSnapshot,
} from "../shared/contracts"
import type { EidosLiteServiceEnvironment } from "../shared/service-environment"
import type { GraftTransferProgress } from "../shared/graft-sdk-contracts"
import {
  DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS,
  eidosLiteShortcutCommandForKeyboardEvent,
  isEidosLiteWorkspaceShortcutCommand,
} from "../shared/keyboard-shortcuts"
import { resolveEidosLiteLocale, translateEidosLite } from "../shared/i18n"
import {
  createEidosLiteDiagnostics,
  serializeEidosLiteDiagnostics,
} from "./diagnostics"
import { EidosLitePreferencesStore } from "./app-preferences"
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
  normalizeRelativePath,
} from "./space/space-paths"
import { SpaceSession } from "./space/space-session"
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
  liteCompactWindowDefaultSize,
  liteWindowChromeOptions,
  macosTrafficLightPosition,
  type LiteWindowKind,
} from "./window-chrome"
import { welcomeWindowActionAfterSpaceClosed } from "./window-lifecycle"
import {
  centeredWindowBounds,
  fitWindowBounds,
  type LiteWindowBounds,
  LiteWindowStateStore,
} from "./window-state"

const SPACE_WINDOW_SIZE = { width: 1320, height: 860 }
const SPACE_WINDOW_MINIMUM = { width: 900, height: 600 }

export class WindowController {
  private readonly sessionByWebContents = new Map<number, SpaceSession>()
  private readonly windowBySpaceId = new Map<string, BrowserWindow>()
  private readonly pendingLaunchFilesByWebContents = new Map<number, string[]>()
  private readonly launchNotificationRetriesByWebContents = new Map<
    number,
    LaunchNotificationRetry
  >()
  private readonly sessionCloses = new SessionCloseTracker<SpaceSession>()
  private readonly openingSessions = new Set<Promise<SpaceSession>>()
  private recentSpacesStore: RecentSpacesStore | null = null
  private preferencesStore: EidosLitePreferencesStore | null = null
  private readonly preferencesListeners = new Set<
    (preferences: EidosLitePreferences) => void
  >()
  private cloneCoordinatorInstance: SpaceCloneCoordinator | null = null
  private settingsWindow: BrowserWindow | null = null
  private readonly windowKind = new WeakMap<BrowserWindow, LiteWindowKind>()
  private readonly windowState = new LiteWindowStateStore(
    app.getPath("userData")
  )
  private keyboardShortcuts = DEFAULT_EIDOS_LITE_KEYBOARD_SHORTCUTS
  private closing = false

  constructor(private readonly services: EidosLiteServiceEnvironment) {}

  createWelcomeWindow(
    beforeLoad?: (window: BrowserWindow) => void
  ): BrowserWindow {
    const window = this.createWindow(beforeLoad === undefined, "welcome")
    beforeLoad?.(window)
    void this.loadRenderer(window)
    return window
  }

  showSettingsWindow(): BrowserWindow {
    if (this.settingsWindow && !this.settingsWindow.isDestroyed()) {
      this.focusWindow(this.settingsWindow)
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
    void this.loadRenderer(window, "/settings")
    return window
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
    if (this.sessionByWebContents.has(webContents.id)) {
      throw new Error("This window already owns a Space")
    }
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
    if (this.sessionByWebContents.has(webContents.id)) {
      throw new Error("This window already owns a Space")
    }
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
    reportTransfer: (progress: GraftTransferProgress) => void = () => undefined
  ): Promise<SpaceSnapshot | null> {
    if (this.sessionByWebContents.has(webContents.id)) {
      throw new Error("This window already owns a Space")
    }
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
    const target = await this.cloneCoordinator().clone(
      result.filePath,
      remoteUrl,
      accessToken,
      reportProgress,
      reportTransfer
    )
    return this.bindSpace(webContents, target)
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
    return this.sessionByWebContents.get(webContents.id) ?? null
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
    return preferences
  }

  async updatePreferences(
    patch: Partial<EidosLitePreferences>
  ): Promise<EidosLitePreferences> {
    const preferences = await this.preferences().update(patch)
    this.keyboardShortcuts = preferences.keyboardShortcuts
    for (const session of new Set(this.sessionByWebContents.values())) {
      session.setAutomaticCheckpointsEnabled(preferences.automaticCheckpoints)
    }
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
    if (!command || !isEidosLiteWorkspaceShortcutCommand(command)) return
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
    if (destination === "logs") {
      const error = await shell.openPath(app.getPath("logs"))
      if (error) throw new Error(error)
      return
    }
    await shell.openExternal(
      destination === "documentation"
        ? "https://docs.eidos.space"
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
    const opening = await Promise.allSettled([...this.openingSessions])
    for (const result of opening) {
      if (result.status === "fulfilled") {
        this.sessionCloses.close(result.value)
      }
    }
    for (const session of new Set(this.sessionByWebContents.values())) {
      this.sessionCloses.close(session)
    }
    this.sessionByWebContents.clear()
    this.windowBySpaceId.clear()
    this.pendingLaunchFilesByWebContents.clear()
    for (const retry of this.launchNotificationRetriesByWebContents.values()) {
      retry.cancel()
    }
    this.launchNotificationRetriesByWebContents.clear()
    await this.sessionCloses.waitForAll()
  }

  private async bindSpace(
    webContents: WebContents,
    root: string
  ): Promise<SpaceSnapshot | null> {
    if (this.closing) throw new Error("Eidos Lite is closing")
    const canonical = await canonicalizeSpaceRoot(root)
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
    const preferences = await this.preferences().get()
    const opening = SpaceSession.createCanonical(
      canonical,
      app.getPath("userData"),
      {
        graft: this.createGraftClient(),
        workerPath: this.runtimeWorkerPath(),
        automaticCheckpointsEnabled: preferences.automaticCheckpoints,
      }
    )
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
      await this.sessionCloses.close(session)
      throw new Error("The requesting window no longer exists")
    }
    this.sessionByWebContents.set(webContents.id, session)
    this.promoteToSpaceWindow(window)
    session.onChanged((snapshot) => {
      if (!webContents.isDestroyed()) {
        webContents.send(IPC_CHANNELS.spaceChanged, snapshot)
      }
    })
    window.setTitle(`${session.canonical.name} — Eidos Lite`)
    window.once("closed", () => {
      this.sessionByWebContents.delete(webContents.id)
      this.clearPendingLaunchFiles(webContents.id)
      if (this.windowBySpaceId.get(session.canonical.id) === window) {
        this.windowBySpaceId.delete(session.canonical.id)
      }
      void this.sessionCloses.close(session).catch((error: unknown) => {
        console.error("Failed to close Space session", error)
      })
      this.showWelcomeAfterSpaceClosed()
    })
    await this.recentSpaces()
      .record(session.canonical)
      .catch((error) => {
        console.warn("Could not update recent Spaces", error)
      })
    return session.snapshot()
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

  private async locale() {
    const preferences = await this.preferences().get()
    return resolveEidosLiteLocale(preferences.language, app.getLocale())
  }

  private broadcastPreferences(preferences: EidosLitePreferences): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.preferencesChanged, preferences)
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
    const chrome = liteWindowChromeOptions()
    const window = new BrowserWindow({
      ...bounds,
      minWidth: compact ? 680 : 900,
      minHeight: compact ? 520 : 600,
      show: false,
      title: "Eidos Lite",
      titleBarStyle: chrome.titleBarStyle,
      autoHideMenuBar: chrome.autoHideMenuBar,
      ...(chrome.titleBarOverlay
        ? { titleBarOverlay: chrome.titleBarOverlay }
        : {}),
      ...(process.platform === "darwin"
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
      },
    })
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
    window.webContents.on("will-navigate", (event) => event.preventDefault())
    window.webContents.on("before-input-event", (event, input) =>
      this.handleWorkspaceShortcutInput(window.webContents, event, input)
    )
    void this.getPreferences()
    window.on("app-command", (_event, command) => {
      if (command === "browser-backward") {
        window.webContents.send(IPC_CHANNELS.navigationCommand, "back")
      } else if (command === "browser-forward") {
        window.webContents.send(IPC_CHANNELS.navigationCommand, "forward")
      }
    })
    this.trackWindowState(window, kind)
    if (showWhenReady) window.once("ready-to-show", () => window.show())
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
      return window.loadURL(url.toString())
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
