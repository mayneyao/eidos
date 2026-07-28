import { fileURLToPath } from "node:url"
import fs from "node:fs/promises"
import path from "node:path"
import { app, BrowserWindow, dialog, shell, type WebContents } from "electron"

import {
  IPC_CHANNELS,
  type EidosSyncRecoveryResult,
  type SpaceSnapshot,
} from "../shared/contracts"
import type { EidosLiteServiceEnvironment } from "../shared/service-environment"
import { defaultGraftBinaryPath, GraftClient } from "./graft/graft-client"
import { GraftUtilityTransport } from "./graft/graft-utility-transport"
import { RuntimePool } from "./runtime/runtime-pool"
import {
  canonicalizeSpaceRoot,
  flattenSpaceTree,
  listSpaceTree,
} from "./space/space-paths"
import { SpaceSession } from "./space/space-session"
import { RecentSpacesStore } from "./space/recent-spaces"
import {
  SpaceCloneCoordinator,
  type CloneRecoveryResult,
} from "./sync/space-clone-coordinator"

export class WindowController {
  private readonly sessionByWebContents = new Map<number, SpaceSession>()
  private readonly windowBySpaceId = new Map<string, BrowserWindow>()
  private recentSpacesStore: RecentSpacesStore | null = null
  private cloneCoordinatorInstance: SpaceCloneCoordinator | null = null

  constructor(private readonly services: EidosLiteServiceEnvironment) {}

  createWelcomeWindow(): BrowserWindow {
    const window = this.createWindow()
    void this.loadRenderer(window)
    return window
  }

  async createSpaceWindow(
    root: string,
    beforeLoad?: (window: BrowserWindow) => void
  ): Promise<BrowserWindow> {
    const window = this.createWindow(beforeLoad === undefined)
    beforeLoad?.(window)
    const snapshot = await this.bindSpace(window.webContents, root)
    if (!snapshot) {
      window.destroy()
      throw new Error("The Space is already open in another window")
    }
    await this.loadRenderer(window)
    return window
  }

  async chooseAndBindSpace(
    webContents: WebContents
  ): Promise<SpaceSnapshot | null> {
    if (this.sessionByWebContents.has(webContents.id)) {
      throw new Error("This window already owns a Space")
    }
    const parent = BrowserWindow.fromWebContents(webContents) ?? undefined
    const options: Electron.OpenDialogOptions = {
      title: "Open Folder as Space",
      buttonLabel: "Open Space",
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
    const options: Electron.SaveDialogOptions = {
      title: "Create Space",
      buttonLabel: "Create Space",
      defaultPath: path.join(app.getPath("documents"), "Untitled Space"),
      nameFieldLabel: "Space name",
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
    accessToken: string
  ): Promise<SpaceSnapshot | null> {
    if (this.sessionByWebContents.has(webContents.id)) {
      throw new Error("This window already owns a Space")
    }
    const parent = BrowserWindow.fromWebContents(webContents) ?? undefined
    const repositoryName =
      new URL(remoteUrl).pathname.split("/").filter(Boolean).at(-1) ??
      "Synced Space"
    const options: Electron.SaveDialogOptions = {
      title: "Clone Synced Space",
      buttonLabel: "Clone Space",
      defaultPath: path.join(app.getPath("documents"), repositoryName),
      nameFieldLabel: "Space name",
      properties: ["createDirectory", "showOverwriteConfirmation"],
    }
    const result = parent
      ? await dialog.showSaveDialog(parent, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    const target = await this.cloneCoordinator().clone(
      result.filePath,
      remoteUrl,
      accessToken
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
    const options: Electron.OpenDialogOptions = {
      title: "Import files into Space",
      buttonLabel: "Import",
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

  async closeAll(): Promise<void> {
    await Promise.all(
      [...new Set(this.sessionByWebContents.values())].map((session) =>
        session.close()
      )
    )
    this.sessionByWebContents.clear()
    this.windowBySpaceId.clear()
  }

  private async bindSpace(
    webContents: WebContents,
    root: string
  ): Promise<SpaceSnapshot | null> {
    const session = await SpaceSession.create(root, app.getPath("userData"), {
      graft: this.createGraftClient(),
      workerPath: this.runtimeWorkerPath(),
    })
    const existing = this.windowBySpaceId.get(session.canonical.id)
    if (existing && !existing.isDestroyed()) {
      await session.close()
      if (existing.isMinimized()) existing.restore()
      existing.show()
      existing.focus()
      return null
    }
    const window = BrowserWindow.fromWebContents(webContents)
    if (!window) {
      await session.close()
      throw new Error("The requesting window no longer exists")
    }
    this.sessionByWebContents.set(webContents.id, session)
    this.windowBySpaceId.set(session.canonical.id, window)
    session.onChanged((snapshot) => {
      if (!webContents.isDestroyed()) {
        webContents.send(IPC_CHANNELS.spaceChanged, snapshot)
      }
    })
    window.setTitle(`${session.canonical.name} — Eidos Lite`)
    window.once("closed", () => {
      this.sessionByWebContents.delete(webContents.id)
      this.windowBySpaceId.delete(session.canonical.id)
      void session.close()
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
    const graftBackend =
      process.env.EIDOS_LITE_GRAFT_BACKEND === "cli" ? "cli" : "sdk"
    return new GraftClient({
      backend: graftBackend,
      binaryPath: defaultGraftBinaryPath({
        packaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
      }),
      syncRemoteOrigin: this.services.syncRemoteOrigin,
      ...(graftBackend === "sdk"
        ? {
            sdkTransport: new GraftUtilityTransport(
              fileURLToPath(new URL("./graft-worker.js", import.meta.url))
            ),
          }
        : {}),
    })
  }

  private runtimeWorkerPath(): string {
    return fileURLToPath(new URL("./runtime-worker.js", import.meta.url))
  }

  private createWindow(showWhenReady = true): BrowserWindow {
    const window = new BrowserWindow({
      width: 1320,
      height: 860,
      minWidth: 900,
      minHeight: 600,
      show: false,
      title: "Eidos Lite",
      titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
      backgroundColor: "#f7f7f5",
      webPreferences: {
        preload: fileURLToPath(new URL("./preload.js", import.meta.url)),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
    window.webContents.on("will-navigate", (event) => event.preventDefault())
    if (showWhenReady) window.once("ready-to-show", () => window.show())
    return window
  }

  private loadRenderer(window: BrowserWindow): Promise<void> {
    const developmentUrl = process.env.VITE_DEV_SERVER_URL
    if (developmentUrl) {
      return window.loadURL(developmentUrl)
    }
    return window.loadFile(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        "../dist/index.html"
      )
    )
  }
}
