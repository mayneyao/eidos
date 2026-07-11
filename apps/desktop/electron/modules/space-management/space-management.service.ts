/**
 * Space Management Service - Handles space CRUD and switching operations
 */

import { IpcServiceBase } from "@eidos.space/electron-ipc"
import type {
  BaseRow,
  BaseRowMutationResult,
  BaseRowPage,
  BaseRowRange,
  BaseRowsDeleteResult,
  BaseSnapshot,
  CreateBaseFieldInput,
  CreateBaseOptions,
  CreateBaseTableInput,
  UpdateBaseFieldInput,
  UpdateBaseTableInput,
  UpdateBaseViewInput,
} from "@eidos.space/base"
import {
  createBaseFile as createBaseDatabase,
  openBaseFile,
} from "@eidos.space/base/better-sqlite3"
import {
  FileSpaceIndex,
  SpaceFiles,
  uniqueSpaceEntryName,
  type FileSpaceBacklink,
  type FileSpaceIndexStatus,
  type FileSpaceLinkResolution,
  type FileSpaceMarkdownMetadata,
  type FileSpaceSearchOptions,
  type FileSpaceSearchResult,
  type FileSpaceTag,
  type ListSpaceFilesOptions,
  type SpaceBinaryFile,
  type SpaceFileEntry,
  type SpaceTextFile,
} from "@eidos.space/file-space"
import type { SpaceMode } from "@eidos.space/space-manager"
import fs from "fs"
import path from "path"
import { dialog, shell, type OpenDialogOptions } from "electron"
import { IpcInjectable, Inject, container } from "../../common/di"
import { SpaceRegistry } from "./space-registry"
import { MainWindowProvider } from "./main-window.provider"
import { DataSpaceManager, DataSpaceProcessPool } from "../data-space"
import { getCredentialsManager } from "../sync/sync.module"
import { getConfigManager } from "../config/config-manager"
import { PORT } from "../../main"
import { BrowserService } from "../browser/browser.service"
import { withFileSpaceOperationLock } from "./file-space-operation-lock"

/**
 * Space Management Service - Provides space management via IPC
 *
 * IPC Channels:
 * - space-mgmt:listSpaces: List all registered spaces
 * - space-mgmt:getCurrentSpace: Get current space
 * - space-mgmt:getSpaceById: Get space by ID
 * - space-mgmt:registerSpace: Register new space
 * - space-mgmt:removeSpace: Remove space
 * - space-mgmt:updateSpace: Update space
 * - space-mgmt:switchSpace: Switch to different space
 * - space-mgmt:toggleSpaceSync: Toggle sync for space
 */
@IpcInjectable("space-mgmt")
export class SpaceManagementService extends IpcServiceBase {
  private readonly fileSpaces = new Map<string, SpaceFiles>()
  private readonly fileSpaceIndexes = new Map<string, FileSpaceIndex>()
  private activeFileWatcher: ReturnType<SpaceFiles["watch"]> | null = null
  private activeFileWatcherSpaceId: string | null = null

  constructor(
    @Inject(SpaceRegistry) private registry: SpaceRegistry,
    @Inject(MainWindowProvider) private windowProvider: MainWindowProvider,
    @Inject(DataSpaceManager) private dataSpaceManager: DataSpaceManager,
    @Inject(DataSpaceProcessPool) private processPool: DataSpaceProcessPool
  ) {
    super()
  }

  /**
   * List all registered spaces
   * IPC: space-mgmt:listSpaces
   */
  listSpaces(): ReturnType<SpaceRegistry["getAllSpaces"]> {
    return this.registry.getAllSpaces()
  }

  /**
   * Get the current space
   * IPC: space-mgmt:getCurrentSpace
   */
  getCurrentSpace() {
    const configManager = getConfigManager()
    const spaceId = configManager.getLastOpenedSpace()
    if (!spaceId) {
      return null
    }

    return this.registry.getSpace(spaceId)
  }

  /**
   * Get a space by ID
   * IPC: space-mgmt:getSpaceById
   */
  getSpaceById(spaceId: string) {
    return this.registry.getSpace(spaceId)
  }

  /**
   * Get a space by local folder path
   * IPC: space-mgmt:getSpaceByPath
   */
  getSpaceByPath(spacePath: string) {
    return this.registry.getSpaceByPath(spacePath)
  }

  /**
   * Get a path conflict with registered spaces
   * IPC: space-mgmt:getSpacePathConflict
   */
  getSpacePathConflict(spacePath: string) {
    return this.registry.getSpacePathConflict(spacePath)
  }

  /**
   * Register a new space
   * IPC: space-mgmt:registerSpace
   */
  registerSpace(
    spacePath: string,
    options: {
      customName?: string
      remoteUrl?: string
      mode?: SpaceMode
    } = {}
  ): {
    success: boolean
    space?: any
    error?: string
    existingSpace?: any
    pathConflictType?: string
  } {
    try {
      const space = this.registry.registerSpace(spacePath, {
        customName: options.customName,
        remoteUrl: options.remoteUrl,
        mode: options.mode,
      })
      return { success: true, space }
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        existingSpace: error.existingSpace,
        pathConflictType: error.pathConflictType,
      }
    }
  }

  /**
   * Remove a space
   * IPC: space-mgmt:removeSpace
   */
  async removeSpace(spaceId: string): Promise<{
    success: boolean
    nextSpaceId?: string
  }> {
    const configManager = getConfigManager()
    const removingCurrent = configManager.getLastOpenedSpace() === spaceId
    const success = this.registry.removeSpace(spaceId)
    if (!success) return { success: false }

    if (this.activeFileWatcherSpaceId === spaceId) {
      this._stopFileWatcher()
    }
    this.fileSpaces.delete(spaceId)
    this.fileSpaceIndexes.delete(spaceId)
    if (!removingCurrent) return { success: true }

    const nextSpaceId = this.registry.getFirstValidSpace()?.id
    configManager.setLastOpenedSpace(nextSpaceId)
    await this.dataSpaceManager.close()
    return { success: true, nextSpaceId }
  }

  /**
   * Update a space
   * IPC: space-mgmt:updateSpace
   */
  updateSpace(
    spaceId: string,
    updates: { name?: string; relay?: any }
  ): { success: boolean; error?: string } {
    try {
      const success = this.registry.updateSpace(spaceId, updates)
      if (success) {
        const space = this.registry.getSpace(spaceId)
        if (space?.mode === "legacy") {
          this.processPool.sendToProcess(spaceId, {
            type: "update-space-info",
            spaceInfo: space,
          })
        }
        return { success: true }
      } else {
        return { success: false, error: "Space not found" }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Switch to a different space
   * IPC: space-mgmt:switchSpace
   */
  async switchSpace(
    spaceId: string
  ): Promise<{ success: boolean; error?: string }> {
    const space = this.registry.getSpace(spaceId)

    if (!space) {
      throw new Error(`Space not found: ${spaceId}`)
    }
    if (!this.registry.validateSpace(spaceId)) {
      throw new Error(`Space is unavailable: ${space.name}`)
    }

    if (space.mode === "file") {
      const files = this._getFileSpace(space.id)
      await files.list("")
      await this.dataSpaceManager.close()
      this._ensureFileWatcher(space.id)
    } else {
      this._stopFileWatcher()
      console.log(`Pre-initializing DataSpace for: ${spaceId}`)
      try {
        await this.dataSpaceManager.getOrSetDataSpace(spaceId)
        console.log(`DataSpace initialized for: ${spaceId}`)
      } catch (error) {
        console.error(`Failed to initialize DataSpace for ${spaceId}:`, error)
        throw error
      }
    }

    const configManager = getConfigManager()
    configManager.setLastOpenedSpace(spaceId)

    const win = this.windowProvider.getWindow()
    if (win) {
      const waitForLoad = () => {
        return new Promise<void>((resolve) => {
          win!.webContents.once("did-finish-load", () => {
            const currentURL = win!.webContents.getURL()
            console.log(`Page loaded at: ${currentURL}`)
            resolve()
          })
        })
      }

      // Close all BrowserViews before switching space to prevent them from covering the main window
      try {
        const browserService = container.get(BrowserService)
        browserService.closeAll()
      } catch {
        // BrowserService might not be available, ignore
      }

      if (process.env.VITE_DEV_SERVER_URL) {
        const devUrl = new URL(process.env.VITE_DEV_SERVER_URL)
        const devSubdomainUrl = `http://${spaceId}.eidos.localhost:${devUrl.port}/`
        console.log(
          `Switching to space in development mode: ${devSubdomainUrl}`
        )
        win.loadURL(devSubdomainUrl)
        await waitForLoad()
        console.log(`Page loaded, now reloading to ensure clean state...`)
        win.reload()
        await waitForLoad()
        console.log(`Space switch complete to: ${spaceId}`)
      } else {
        const prodSubdomainUrl = `http://${spaceId}.eidos.localhost:${PORT}/`
        console.log(
          `Switching to space in production mode: ${prodSubdomainUrl}`
        )
        win.loadURL(prodSubdomainUrl)
        await waitForLoad()
        console.log(`Page loaded, now reloading to ensure clean state...`)
        win.reload()
        await waitForLoad()
        console.log(`Space switch complete to: ${spaceId}`)
      }
    }

    return { success: true }
  }

  async listFiles(
    spaceId: string,
    relativeDirectory = "",
    options: ListSpaceFilesOptions = {}
  ): Promise<SpaceFileEntry[]> {
    const files = this._getFileSpace(spaceId)
    this._ensureFileWatcher(spaceId)
    return files.list(relativeDirectory, options)
  }

  async readFile(
    spaceId: string,
    relativePath: string
  ): Promise<SpaceTextFile> {
    return this._getFileSpace(spaceId).readText(relativePath)
  }

  async readBinaryFile(
    spaceId: string,
    relativePath: string
  ): Promise<SpaceBinaryFile> {
    return this._getFileSpace(spaceId).readBinary(relativePath)
  }

  async getRelativeFilePath(
    spaceId: string,
    systemPath: string
  ): Promise<string | null> {
    return this._getFileSpace(spaceId).getRelativeFilePath(systemPath)
  }

  async writeFile(
    spaceId: string,
    relativePath: string,
    content: string,
    expectedMtimeMs?: number
  ): Promise<SpaceTextFile> {
    return withFileSpaceOperationLock(spaceId, async () => {
      const file = await this._getFileSpace(spaceId).writeText(
        relativePath,
        content,
        expectedMtimeMs
      )
      this.fileSpaceIndexes.get(spaceId)?.updateTextFile(file)
      return file
    })
  }

  async createFile(
    spaceId: string,
    relativePath: string,
    content = ""
  ): Promise<SpaceTextFile> {
    return withFileSpaceOperationLock(spaceId, async () => {
      const file = await this._getFileSpace(spaceId).createText(
        relativePath,
        content
      )
      this.fileSpaceIndexes.get(spaceId)?.updateTextFile(file)
      return file
    })
  }

  async createBinaryFile(
    spaceId: string,
    relativePath: string,
    content: Uint8Array
  ): Promise<SpaceBinaryFile> {
    return withFileSpaceOperationLock(spaceId, async () => {
      const file = await this._getFileSpace(spaceId).createBinary(
        relativePath,
        content
      )
      this._invalidateFileIndex(spaceId)
      return file
    })
  }

  async createDirectory(
    spaceId: string,
    relativePath: string
  ): Promise<SpaceFileEntry> {
    return withFileSpaceOperationLock(spaceId, async () => {
      const directory =
        await this._getFileSpace(spaceId).createDirectory(relativePath)
      this._invalidateFileIndex(spaceId)
      return directory
    })
  }

  async createBase(
    spaceId: string,
    relativePath: string,
    options: CreateBaseOptions = {}
  ): Promise<BaseSnapshot> {
    return withFileSpaceOperationLock(spaceId, async () => {
      const files = this._getFileSpace(spaceId)
      await files.createBinary(relativePath, new Uint8Array())
      const systemPath = await files.getSystemPath(relativePath)
      try {
        const base = createBaseDatabase(systemPath, options)
        base.close()
        this._invalidateFileIndex(spaceId)
        return await this._getBaseSnapshot(spaceId, relativePath)
      } catch (error) {
        await files.remove(relativePath).catch(() => undefined)
        throw error
      }
    })
  }

  async getBaseSnapshot(
    spaceId: string,
    relativePath: string
  ): Promise<BaseSnapshot> {
    return withFileSpaceOperationLock(spaceId, () =>
      this._getBaseSnapshot(spaceId, relativePath, true)
    )
  }

  async getBaseTablePage(
    spaceId: string,
    relativePath: string,
    tableId: string,
    options: { offset: number; limit: number }
  ): Promise<BaseRowPage> {
    if (!Number.isSafeInteger(options.offset) || options.offset < 0) {
      throw new Error("Base row page offset must be a non-negative integer")
    }
    if (!Number.isSafeInteger(options.limit) || options.limit < 1) {
      throw new Error("Base row page limit must be a positive integer")
    }
    return withFileSpaceOperationLock(spaceId, async () => {
      const base = await this._openBase(spaceId, relativePath, true)
      try {
        return base.getRowPage(tableId, options.offset, options.limit)
      } finally {
        base.close()
      }
    })
  }

  async addBaseField(
    spaceId: string,
    relativePath: string,
    tableId: string,
    field: CreateBaseFieldInput
  ): Promise<BaseSnapshot> {
    return withFileSpaceOperationLock(spaceId, async () => {
      const base = await this._openBase(spaceId, relativePath, true)
      try {
        base.addField(tableId, field)
      } finally {
        base.close()
      }
      this._invalidateFileIndex(spaceId)
      return this._getBaseSnapshot(spaceId, relativePath)
    })
  }

  async updateBaseField(
    spaceId: string,
    relativePath: string,
    tableId: string,
    columnName: string,
    changes: UpdateBaseFieldInput
  ): Promise<BaseSnapshot> {
    return withFileSpaceOperationLock(spaceId, async () => {
      const base = await this._openBase(spaceId, relativePath, true)
      try {
        base.updateField(tableId, columnName, changes)
      } finally {
        base.close()
      }
      this._invalidateFileIndex(spaceId)
      return this._getBaseSnapshot(spaceId, relativePath)
    })
  }

  async deleteBaseField(
    spaceId: string,
    relativePath: string,
    tableId: string,
    columnName: string
  ): Promise<BaseSnapshot> {
    return withFileSpaceOperationLock(spaceId, async () => {
      const base = await this._openBase(spaceId, relativePath, true)
      try {
        base.deleteField(tableId, columnName)
      } finally {
        base.close()
      }
      this._invalidateFileIndex(spaceId)
      return this._getBaseSnapshot(spaceId, relativePath)
    })
  }

  async createBaseTable(
    spaceId: string,
    relativePath: string,
    table: CreateBaseTableInput
  ): Promise<BaseSnapshot> {
    return withFileSpaceOperationLock(spaceId, async () => {
      const base = await this._openBase(spaceId, relativePath, true)
      try {
        base.createTable(table)
      } finally {
        base.close()
      }
      this._invalidateFileIndex(spaceId)
      return this._getBaseSnapshot(spaceId, relativePath)
    })
  }

  async updateBaseTable(
    spaceId: string,
    relativePath: string,
    tableId: string,
    changes: UpdateBaseTableInput
  ): Promise<BaseSnapshot> {
    return withFileSpaceOperationLock(spaceId, async () => {
      const base = await this._openBase(spaceId, relativePath, true)
      try {
        base.updateTable(tableId, changes)
      } finally {
        base.close()
      }
      this._invalidateFileIndex(spaceId)
      return this._getBaseSnapshot(spaceId, relativePath)
    })
  }

  async deleteBaseTable(
    spaceId: string,
    relativePath: string,
    tableId: string
  ): Promise<BaseSnapshot> {
    return withFileSpaceOperationLock(spaceId, async () => {
      const base = await this._openBase(spaceId, relativePath, true)
      try {
        base.deleteTable(tableId)
      } finally {
        base.close()
      }
      this._invalidateFileIndex(spaceId)
      return this._getBaseSnapshot(spaceId, relativePath)
    })
  }

  async insertBaseRow(
    spaceId: string,
    relativePath: string,
    tableId: string,
    row: BaseRow
  ): Promise<BaseRowMutationResult> {
    return withFileSpaceOperationLock(spaceId, async () => {
      const base = await this._openBase(spaceId, relativePath, true)
      try {
        return {
          tableId,
          row: base.insertRow(tableId, row),
          rowCount: base.countRows(tableId),
        }
      } finally {
        base.close()
      }
    })
  }

  async updateBaseView(
    spaceId: string,
    relativePath: string,
    viewId: string,
    changes: UpdateBaseViewInput
  ): Promise<BaseSnapshot> {
    return withFileSpaceOperationLock(spaceId, async () => {
      const base = await this._openBase(spaceId, relativePath, true)
      try {
        base.updateView(viewId, changes)
      } finally {
        base.close()
      }
      this._invalidateFileIndex(spaceId)
      return this._getBaseSnapshot(spaceId, relativePath)
    })
  }

  async updateBaseRow(
    spaceId: string,
    relativePath: string,
    tableId: string,
    rowId: string,
    changes: BaseRow
  ): Promise<BaseRowMutationResult> {
    return withFileSpaceOperationLock(spaceId, async () => {
      const base = await this._openBase(spaceId, relativePath, true)
      try {
        return {
          tableId,
          row: base.updateRow(tableId, rowId, changes),
          rowCount: base.countRows(tableId),
        }
      } finally {
        base.close()
      }
    })
  }

  async deleteBaseRows(
    spaceId: string,
    relativePath: string,
    tableId: string,
    rowIds: string[]
  ): Promise<BaseRowsDeleteResult> {
    return withFileSpaceOperationLock(spaceId, async () => {
      const base = await this._openBase(spaceId, relativePath, true)
      try {
        return {
          tableId,
          deletedCount: base.deleteRows(tableId, rowIds).length,
          rowCount: base.countRows(tableId),
        }
      } finally {
        base.close()
      }
    })
  }

  async deleteBaseRowRanges(
    spaceId: string,
    relativePath: string,
    tableId: string,
    ranges: BaseRowRange[]
  ): Promise<BaseRowsDeleteResult> {
    return withFileSpaceOperationLock(spaceId, async () => {
      const base = await this._openBase(spaceId, relativePath, true)
      try {
        return {
          tableId,
          deletedCount: base.deleteRowRanges(tableId, ranges),
          rowCount: base.countRows(tableId),
        }
      } finally {
        base.close()
      }
    })
  }

  async deleteBaseRow(
    spaceId: string,
    relativePath: string,
    tableId: string,
    rowId: string
  ): Promise<BaseRowsDeleteResult> {
    return this.deleteBaseRows(spaceId, relativePath, tableId, [rowId])
  }

  async moveFile(
    spaceId: string,
    sourcePath: string,
    destinationPath: string
  ): Promise<{ success: true }> {
    return withFileSpaceOperationLock(spaceId, async () => {
      await this._getFileSpace(spaceId).move(sourcePath, destinationPath)
      this.fileSpaceIndexes.get(spaceId)?.movePath(sourcePath, destinationPath)
      return { success: true }
    })
  }

  async removeFile(
    spaceId: string,
    relativePath: string
  ): Promise<{ success: true }> {
    return withFileSpaceOperationLock(spaceId, async () => {
      await this._getFileSpace(spaceId).remove(relativePath)
      this.fileSpaceIndexes.get(spaceId)?.removePath(relativePath)
      return { success: true }
    })
  }

  async importFiles(
    spaceId: string,
    destinationDirectory = ""
  ): Promise<{
    canceled: boolean
    imported: SpaceFileEntry[]
    errors: Array<{ sourcePath: string; message: string }>
  }> {
    const options: OpenDialogOptions = {
      properties: ["openFile", "multiSelections"],
    }
    const owner = this.windowProvider.getWindow()
    const selection = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options)
    if (selection.canceled) {
      return { canceled: true, imported: [], errors: [] }
    }

    return withFileSpaceOperationLock(spaceId, async () => {
      const files = this._getFileSpace(spaceId)
      const existingEntries = await files.list(destinationDirectory)
      const existingNames = new Set(
        existingEntries.map((entry) => entry.name.toLowerCase())
      )
      const imported: SpaceFileEntry[] = []
      const errors: Array<{ sourcePath: string; message: string }> = []
      for (const sourcePath of selection.filePaths) {
        const filename = uniqueSpaceEntryName(
          existingNames,
          path.basename(sourcePath)
        )
        const destinationPath = destinationDirectory
          ? `${destinationDirectory}/${filename}`
          : filename
        try {
          const entry = await files.importFile(sourcePath, destinationPath)
          imported.push(entry)
          existingNames.add(filename.toLowerCase())
          const index = this.fileSpaceIndexes.get(spaceId)
          if (index) {
            await index
              .handleFileChange(entry.path)
              .catch(() => index.invalidate())
          }
        } catch (error) {
          errors.push({
            sourcePath,
            message: error instanceof Error ? error.message : "Import failed",
          })
        }
      }
      return { canceled: false, imported, errors }
    })
  }

  async searchFiles(
    spaceId: string,
    query: string,
    options: FileSpaceSearchOptions = {}
  ): Promise<FileSpaceSearchResult[]> {
    this._ensureFileWatcher(spaceId)
    return this._getFileIndex(spaceId).search(query, options)
  }

  async resolveFileLink(
    spaceId: string,
    currentFilePath: string,
    target: string
  ): Promise<FileSpaceLinkResolution> {
    this._ensureFileWatcher(spaceId)
    return this._getFileIndex(spaceId).resolveLink(currentFilePath, target)
  }

  async getFileIndexStatus(spaceId: string): Promise<FileSpaceIndexStatus> {
    this._ensureFileWatcher(spaceId)
    return this._getFileIndex(spaceId).getStatus()
  }

  async rebuildFileIndex(spaceId: string): Promise<FileSpaceIndexStatus> {
    this._ensureFileWatcher(spaceId)
    const index = this._getFileIndex(spaceId)
    index.invalidate()
    return index.refresh()
  }

  async getFileBacklinks(
    spaceId: string,
    relativePath: string
  ): Promise<FileSpaceBacklink[]> {
    this._ensureFileWatcher(spaceId)
    return this._getFileIndex(spaceId).getBacklinks(relativePath)
  }

  async getFileDocumentMetadata(
    spaceId: string,
    relativePath: string
  ): Promise<FileSpaceMarkdownMetadata | null> {
    this._ensureFileWatcher(spaceId)
    return this._getFileIndex(spaceId).getDocumentMetadata(relativePath)
  }

  async listFileTags(spaceId: string): Promise<FileSpaceTag[]> {
    this._ensureFileWatcher(spaceId)
    return this._getFileIndex(spaceId).listTags()
  }

  async revealFile(
    spaceId: string,
    relativePath = ""
  ): Promise<{ success: true }> {
    const systemPath =
      await this._getFileSpace(spaceId).getSystemPath(relativePath)
    if (relativePath) {
      shell.showItemInFolder(systemPath)
    } else {
      const error = await shell.openPath(systemPath)
      if (error) throw new Error(error)
    }
    return { success: true }
  }

  private _getFileSpace(spaceId: string): SpaceFiles {
    const space = this.registry.getSpace(spaceId)
    if (!space) {
      throw new Error(`Space not found: ${spaceId}`)
    }
    if (space.mode !== "file") {
      throw new Error(`Space is not file-based: ${spaceId}`)
    }
    const existing = this.fileSpaces.get(spaceId)
    if (existing?.root === space.path) {
      return existing
    }
    const files = new SpaceFiles(space.path)
    this.fileSpaces.set(spaceId, files)
    this.fileSpaceIndexes.delete(spaceId)
    return files
  }

  private async _openBase(
    spaceId: string,
    relativePath: string,
    migrate = false
  ) {
    const systemPath =
      await this._getFileSpace(spaceId).getSystemPath(relativePath)
    return openBaseFile(systemPath, { migrate })
  }

  private async _getBaseSnapshot(
    spaceId: string,
    relativePath: string,
    migrate = false
  ): Promise<BaseSnapshot> {
    const base = await this._openBase(spaceId, relativePath, migrate)
    try {
      const metadata = base.info()
      return {
        path: relativePath,
        metadata,
        tables: base.listTables().map((table) => ({
          table,
          fields: base.listFields(table.id),
          views: base.listViews(table.id),
          rowCount: base.countRows(table.id),
        })),
      }
    } finally {
      base.close()
    }
  }

  private _getFileIndex(spaceId: string): FileSpaceIndex {
    const existing = this.fileSpaceIndexes.get(spaceId)
    if (existing) return existing
    const index = new FileSpaceIndex(this._getFileSpace(spaceId))
    this.fileSpaceIndexes.set(spaceId, index)
    return index
  }

  private _invalidateFileIndex(spaceId: string): void {
    this.fileSpaceIndexes.get(spaceId)?.invalidate()
  }

  private _ensureFileWatcher(spaceId: string): void {
    if (this.activeFileWatcherSpaceId === spaceId && this.activeFileWatcher) {
      return
    }
    this._stopFileWatcher()
    try {
      const files = this._getFileSpace(spaceId)
      this.activeFileWatcher = files.watch((change) => {
        const index = this.fileSpaceIndexes.get(spaceId)
        const notifyRenderer = () => {
          this.windowProvider
            .getWindow()
            ?.webContents.send("space-files:changed", { spaceId, ...change })
        }
        if (!index) {
          notifyRenderer()
          return
        }
        if (change.eventType === "rescan") {
          index.invalidate()
          notifyRenderer()
          return
        }
        void index
          .handleFileChange(change.path)
          .catch(() => index.invalidate())
          .finally(notifyRenderer)
      })
      this.activeFileWatcherSpaceId = spaceId
    } catch (error) {
      console.warn(`Unable to watch file Space ${spaceId}:`, error)
    }
  }

  private _stopFileWatcher(): void {
    this.activeFileWatcher?.close()
    this.activeFileWatcher = null
    this.activeFileWatcherSpaceId = null
  }

  /**
   * Toggle sync for a space
   * IPC: space-mgmt:toggleSpaceSync
   */
  async toggleSpaceSync(
    spaceId: string,
    enabled: boolean,
    remote?: string,
    provider?: string
  ): Promise<{ success: boolean; error?: string; reloadRequired?: boolean }> {
    const space = this.registry.getSpace(spaceId)
    if (!space) {
      return { success: false, error: "Space not found" }
    }
    if (space.mode === "file") {
      return {
        success: false,
        error: "Legacy database sync is not available for file Spaces",
      }
    }

    const dataSpace = this.dataSpaceManager.getDataSpace()
    if (!dataSpace) {
      return { success: false, error: "Data space not initialized" }
    }

    const configManager = getConfigManager()
    const effectiveProvider =
      provider ||
      space.sync?.provider ||
      configManager.getDefaultSyncProvider() ||
      "eidos.space"

    if (enabled) {
      if (!remote) {
        return {
          success: false,
          error: "Remote URL is required to enable sync",
        }
      }

      const credentialsManager = getCredentialsManager()
      const credentials =
        await credentialsManager.getSyncCredentials(effectiveProvider)
      if (!credentials) {
        return {
          success: false,
          error: `No sync credentials found for ${effectiveProvider}. Please configure sync settings first.`,
        }
      }

      const isLocalOnlyVersioned =
        space.versioning?.enabled && !space.sync?.enabled
      if (isLocalOnlyVersioned) {
        // Already in Graft mode (local-only). Reconfigure remote only.
        await dataSpace.reconfigureRemote(credentials, remote)
      } else {
        // Fresh space, convert from regular SQLite to Graft with sync.
        await dataSpace.convertToGraft(remote)
      }

      this.registry.setSpaceSync(spaceId, {
        enabled: true,
        remote: remote,
        provider: effectiveProvider,
      })
      this.registry.setSpaceVersioning(spaceId, { enabled: true })

      if (!(await this.dataSpaceManager.reload())) {
        throw new Error("Failed to reload data space after enabling sync")
      }

      return { success: true, reloadRequired: false }
    } else {
      const keepLocalVersioning =
        space.versioning?.enabled || space.sync?.enabled || false
      if (space.sync?.enabled) {
        await dataSpace.hydrate()
      }

      this.registry.setSpaceSync(spaceId, {
        enabled: false,
        remote: space.sync?.remote || "",
        provider: space.sync?.provider,
      })
      this.registry.setSpaceVersioning(spaceId, {
        enabled: keepLocalVersioning,
      })

      await this.dataSpaceManager.reload()

      return { success: true, reloadRequired: false }
    }
  }

  async toggleLocalVersioning(
    spaceId: string,
    enabled: boolean
  ): Promise<{ success: boolean; error?: string; reloadRequired?: boolean }> {
    const space = this.registry.getSpace(spaceId)
    if (!space) {
      return { success: false, error: "Space not found" }
    }
    if (space.mode === "file") {
      return {
        success: false,
        error: "Legacy database versioning is not available for file Spaces",
      }
    }

    const dataSpace = this.dataSpaceManager.getDataSpace()
    if (!dataSpace) {
      return { success: false, error: "Data space not initialized" }
    }

    try {
      if (enabled) {
        if (space.sync?.enabled || space.versioning?.enabled) {
          this.registry.setSpaceVersioning(spaceId, { enabled: true })
          return { success: true, reloadRequired: false }
        }
        await dataSpace.enableLocalVersioning()
        this.registry.setSpaceVersioning(spaceId, { enabled: true })
        await this.dataSpaceManager.reload()
      } else {
        if (space.sync?.enabled) {
          return {
            success: false,
            error: "Disable remote sync before disabling local version history",
          }
        }
        if (!space.versioning?.enabled) {
          return { success: true, reloadRequired: false }
        }
        await dataSpace.exportToSqlite()
        this.registry.setSpaceVersioning(spaceId, { enabled: false })
        const reloadedDataSpace = await this.dataSpaceManager.reload()
        if (!reloadedDataSpace) {
          throw new Error("Failed to reload data space after disabling history")
        }
        this.removeGraftRepository(space.path)
      }
      return { success: true, reloadRequired: false }
    } catch (error: any) {
      return {
        success: false,
        error: error?.message ?? "Failed to toggle local versioning",
      }
    }
  }

  private removeGraftRepository(spacePath: string): void {
    const graftPath = path.join(spacePath, ".eidos", ".graft")
    if (!fs.existsSync(graftPath)) {
      return
    }

    fs.rmSync(graftPath, { recursive: true, force: true })
  }
}
