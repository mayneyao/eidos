// IMPORTANT: Import env first to set SQLITE_USE_URI before better-sqlite3 is loaded
import "../data-space/worker/sqlite-server/env"

import {
  type Agent,
  type Good,
  type GoodCategory,
  type MatchedAdapter,
  type RawDataAdapter,
  type Relation,
  type RelationType,
} from "@eidos.space/rawdata"
import { BrowserWindow } from "electron"
import * as fsNode from "node:fs/promises"
import * as path from "node:path"
import {
  IpcMethod,
  IpcService,
  IpcServiceBase,
} from "@eidos.space/electron-ipc"

import { Inject, Injectable } from "../../common/di"
import type { WindowService } from "../window/window.service"
import { getSpacePath } from "../../utils/paths"
import { AdapterLoaderService } from "./adapters/adapter-loader.service"
import {
  BrowserExplorerService,
  type ExploreResult,
} from "./explorer/browser-explorer.service"
import { BrowserRunnerService } from "./runner/browser-runner.service"
import { CliRunnerService } from "./runner/cli-runner.service"
import { DataPersisterService } from "./persistence/data-persister.service"
import { DataStoreService } from "./store/datastore.service"

/**
 * RawData Service for Electron
 * Manages adapters, runs pipelines, and persists data to local database
 * Delegates to specialized services for specific concerns
 */
@IpcService("rawdata", { exposeMode: "decorated" })
@Injectable()
export class RawDataService extends IpcServiceBase {
  // Running locks to prevent duplicate execution
  private runningAdapters: Map<string, Promise<any>> = new Map()
  private windowService: WindowService | null = null

  constructor(
    @Inject(AdapterLoaderService)
    private adapterLoader: AdapterLoaderService,
    @Inject(BrowserRunnerService)
    private browserRunner: BrowserRunnerService,
    @Inject(CliRunnerService)
    private cliRunner: CliRunnerService,
    @Inject(DataPersisterService)
    private dataPersister: DataPersisterService,
    @Inject(DataStoreService)
    private dataStore: DataStoreService,
    @Inject(BrowserExplorerService)
    private browserExplorer: BrowserExplorerService
  ) {
    super()
    console.log("[RawData] RawDataService constructor called")
  }

  /**
   * Set WindowService (called during initialization to avoid circular deps)
   */
  setWindowService(windowService: WindowService): void {
    this.windowService = windowService
  }

  /**
   * Get the WindowService instance
   */
  private getWindowService(): WindowService | null {
    return this.windowService
  }

  /**
   * Close all data stores and database connections
   */
  closeAll(): void {
    this.dataStore.closeAll()
    this.adapterLoader.clearAll()
  }

  /**
   * Reload adapters for a space
   */
  async _reloadAdapters(spaceId: string): Promise<void> {
    return this.adapterLoader.reloadAdapters(spaceId)
  }

  /**
   * Find adapters matching a URL
   */
  async _findAdapters(spaceId: string, url: string): Promise<MatchedAdapter[]> {
    console.log("[RawDataService] findAdapters:", { spaceId, url })
    const manager = await this.adapterLoader.getManager(spaceId)
    const adapters = manager.findAdaptersForUrl(url)
    console.log(
      "[RawDataService] Found adapters:",
      adapters.length,
      adapters.map((a) => ({ site: a.site, name: a.name, domain: a.domain }))
    )
    return adapters
  }

  /**
   * Get list-type adapters for a URL (excluding search adapters)
   */
  async _findListAdapters(
    spaceId: string,
    url: string
  ): Promise<MatchedAdapter[]> {
    console.log("[RawDataService] findListAdapters:", { spaceId, url })
    const adapters = await this._findAdapters(spaceId, url)
    // Filter out search-oriented adapters (those with required positional args)
    const filtered = adapters.filter((m) => {
      const args = m.adapter.args || {}
      const hasRequiredSearchArg = Object.values(args).some(
        (arg) =>
          arg.required &&
          (arg.positional || arg.description?.toLowerCase().includes("search"))
      )
      return !hasRequiredSearchArg
    })
    console.log("[RawDataService] Filtered adapters:", filtered.length)
    return filtered
  }

  /**
   * Run an adapter and persist results to database
   * Uses locking to prevent duplicate execution
   */
  async _runAdapter(
    spaceId: string,
    adapterPath: string,
    args: Record<string, any> = {},
    browserWindow?: BrowserWindow
  ): Promise<{
    source: string
    data: any[]
    columns?: string[]
    adapter: RawDataAdapter
    persisted: { agents: number; goods: number; relations: number }
  }> {
    // Create unique key for this adapter run
    const runKey = `${spaceId}:${adapterPath}`

    // Check if already running
    const existingRun = this.runningAdapters.get(runKey)
    if (existingRun) {
      console.log(
        "[RawDataService] Adapter already running, returning existing promise:",
        runKey
      )
      return existingRun
    }

    // Create the run promise
    const runPromise = this._doRunAdapter(
      spaceId,
      adapterPath,
      args,
      browserWindow
    ).finally(() => {
      // Clean up lock when done
      this.runningAdapters.delete(runKey)
    })

    // Store the promise as lock
    this.runningAdapters.set(runKey, runPromise)

    return runPromise
  }

  /**
   * Internal method to actually run the adapter
   */
  private async _doRunAdapter(
    spaceId: string,
    adapterPath: string,
    args: Record<string, any> = {},
    browserWindow?: BrowserWindow
  ): Promise<{
    source: string
    data: any[]
    columns?: string[]
    adapter: RawDataAdapter
    persisted: { agents: number; goods: number; relations: number }
  }> {
    console.log("[RawDataService] runAdapter:", { spaceId, adapterPath, args })
    const manager = await this.adapterLoader.getManager(spaceId)
    const adapter = await manager.getAdapter(adapterPath)

    if (!adapter) {
      throw new Error(`Adapter not found: ${adapterPath}`)
    }

    // Run adapter
    const isBrowserAdapter = adapter.protocol?.browser
    const isCliAdapter = adapter.protocol?.cli
    console.log(
      "[RawDataService] isBrowserAdapter:",
      isBrowserAdapter,
      "isCliAdapter:",
      isCliAdapter,
      "hasBrowserWindow:",
      !!browserWindow
    )

    if (isCliAdapter) {
      console.log("[RawDataService] Running CLI adapter...")
      const store = this.dataStore.getDataStore(spaceId)
      const db = this.dataStore.getDatabase(spaceId)
      const result = await this.cliRunner.runAdapter(
        spaceId,
        adapter,
        args,
        store,
        db
      )
      console.log("[RawDataService] CLI adapter completed")
      return result
    } else if (isBrowserAdapter && browserWindow) {
      console.log("[RawDataService] Running browser adapter...")
      const store = this.dataStore.getDataStore(spaceId)
      const db = this.dataStore.getDatabase(spaceId)
      const result = await this.browserRunner.runAdapter(
        spaceId,
        adapter,
        args,
        browserWindow,
        store,
        db
      )
      console.log("[RawDataService] Browser adapter completed")
      return result
    } else {
      throw new Error(
        "Adapter protocol not supported. " +
          "Adapters must specify protocol.browser or protocol.cli."
      )
    }
  }

  // ============================================
  // Database Query APIs
  // ============================================

  /**
   * Get my following list
   */
  async _getMyFollowing(spaceId: string): Promise<Agent[]> {
    const store = this.dataStore.getDataStore(spaceId)
    return store.getMyFollowing()
  }

  /**
   * Get producer's works
   */
  async getProducerWorks(spaceId: string, producerId: string): Promise<Good[]> {
    const store = this.dataStore.getDataStore(spaceId)
    return store.getProducerWorks(producerId)
  }

  /**
   * Get my consumption with progress
   */
  async _getMyConsumption(
    spaceId: string,
    category?: GoodCategory
  ): Promise<Array<{ good: Good; context: Record<string, any> }>> {
    const store = this.dataStore.getDataStore(spaceId)
    return store.getMyConsumption(category)
  }

  /**
   * Query goods with filters
   */
  async _queryGoods(
    spaceId: string,
    filters: {
      category?: GoodCategory
      status?: "active" | "archived" | "deleted"
      limit?: number
    }
  ): Promise<Good[]> {
    const store = this.dataStore.getDataStore(spaceId)
    return store.queryGoods(filters)
  }

  /**
   * Query relations
   */
  async queryRelations(
    spaceId: string,
    filters: { type?: RelationType; subject_id?: string; object_id?: string }
  ): Promise<Relation[]> {
    const store = this.dataStore.getDataStore(spaceId)
    return store.queryRelations(filters)
  }

  // ============================================
  // Adapter Management
  // ============================================

  @IpcMethod()
  async getAdapters(spaceId: string): Promise<
    {
      path: string
      adapter: {
        meta: RawDataAdapter["meta"]
        protocol: RawDataAdapter["protocol"]
        args?: RawDataAdapter["args"]
        queries?: RawDataAdapter["queries"]
        sync?: RawDataAdapter["sync"]
      }
    }[]
  > {
    const manager = await this.adapterLoader.getManager(spaceId)
    const adapters = manager.getAdapters()
    return Array.from(adapters.entries()).map(([p, adapter]) => ({
      path: p,
      adapter: {
        meta: adapter.meta,
        protocol: adapter.protocol,
        args: adapter.args,
        queries: adapter.queries,
        sync: adapter.sync,
      },
    }))
  }

  @IpcMethod()
  async saveAdapter(
    spaceId: string,
    filePath: string,
    content: string
  ): Promise<void> {
    const spacePath = getSpacePath(spaceId)
    const adaptersDir = path.join(spacePath, ".eidos", ".rawdata")
    const fullPath = path.join(adaptersDir, filePath)

    await fsNode.mkdir(path.dirname(fullPath), { recursive: true })
    await fsNode.writeFile(fullPath, content, "utf8")
    await this._reloadAdapters(spaceId)
  }

  @IpcMethod()
  async deleteAdapter(spaceId: string, filePath: string): Promise<void> {
    const spacePath = getSpacePath(spaceId)
    const fullPath = path.join(spacePath, ".eidos", ".rawdata", filePath)
    await fsNode.unlink(fullPath)
    await this._reloadAdapters(spaceId)
  }

  @IpcMethod()
  async importAdapters(
    spaceId: string,
    source: string,
    options: { overwrite?: boolean } = {}
  ): Promise<{ imported: number; errors: string[] }> {
    const errors: string[] = []
    let imported = 0

    try {
      if (source.startsWith("http")) {
        const result = await this._importFromUrl(spaceId, source, options)
        return result
      }

      const files = await fsNode.readdir(source, { recursive: true })
      const adapterFiles = files.filter(
        (f: string) =>
          f.endsWith(".ts") || f.endsWith(".js") || f.endsWith(".mjs")
      )

      for (const file of adapterFiles) {
        try {
          const content = await fsNode.readFile(path.join(source, file), "utf8")
          await this.saveAdapter(spaceId, file, content)
          imported++
        } catch (error) {
          errors.push(`Failed to import ${file}: ${error}`)
        }
      }
    } catch (error) {
      errors.push(`Import failed: ${error}`)
    }

    return { imported, errors }
  }

  private async _importFromUrl(
    spaceId: string,
    url: string,
    options: { overwrite?: boolean }
  ): Promise<{ imported: number; errors: string[] }> {
    const errors: string[] = []

    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const content = await response.text()
      // Note: TypeScript adapters cannot be validated without compilation
      // Validation will happen when the adapter is loaded

      const urlPath = new URL(url).pathname
      const fileName = path.basename(urlPath)

      await this.saveAdapter(spaceId, fileName, content)

      return { imported: 1, errors: [] }
    } catch (error) {
      errors.push(`Failed to import from ${url}: ${error}`)
      return { imported: 0, errors }
    }
  }

  // ============================================
  // IPC Methods with Serialization
  // ============================================

  /** Find adapters for a URL (with serialization for IPC) */
  @IpcMethod()
  async findAdapters(
    spaceId: string,
    url: string
  ): Promise<
    Array<{
      site: string
      name: string
      description?: string
      domain: string
      filePath: string
    }>
  > {
    const adapters = await this._findAdapters(spaceId, url)
    return adapters.map((a) => ({
      site: a.site,
      name: a.name,
      description: a.description,
      domain: a.domain,
      filePath: a.filePath,
    }))
  }

  /** Find list adapters for a URL (with serialization for IPC) */
  @IpcMethod()
  async findListAdapters(
    spaceId: string,
    url: string
  ): Promise<
    Array<{
      site: string
      name: string
      description?: string
      domain: string
      filePath: string
      queries?: Record<string, string>
    }>
  > {
    const adapters = await this._findListAdapters(spaceId, url)
    return adapters.map((a) => ({
      site: a.site,
      name: a.name,
      description: a.description,
      domain: a.domain,
      filePath: a.filePath,
      queries: a.adapter.queries,
    }))
  }

  /** Run an adapter (with serialization for IPC) */
  @IpcMethod()
  async runAdapter(
    spaceId: string,
    adapterPath: string,
    args: Record<string, any>,
    windowId?: number
  ): Promise<{
    source: string
    data: any[]
    columns: string[]
    adapter: {
      site: string
      name: string
      description?: string
      domain: string
    }
    persisted: { agents: number; goods: number; relations: number }
  }> {
    // Get browser window from windowId or use main window
    let browserWindow: BrowserWindow | undefined
    if (windowId) {
      browserWindow = BrowserWindow.fromId(windowId) || undefined
    } else {
      browserWindow = this.getWindowService()?.getMainWindow() || undefined
    }

    const result = await this._runAdapter(
      spaceId,
      adapterPath,
      args,
      browserWindow
    )

    return {
      source: result.source,
      data: result.data,
      columns: (result as any).columns || [],
      adapter: {
        site: result.adapter.meta.site,
        name: result.adapter.meta.name,
        description: result.adapter.meta.description,
        domain: result.adapter.meta.domain,
      },
      persisted: result.persisted,
    }
  }

  // Additional IPC methods
  @IpcMethod()
  async reloadAdapters(spaceId: string): Promise<void> {
    return this._reloadAdapters(spaceId)
  }

  @IpcMethod()
  async getMyFollowing(spaceId: string): Promise<any> {
    return this._getMyFollowing(spaceId)
  }

  @IpcMethod()
  async getMyConsumption(spaceId: string, category?: string): Promise<any> {
    return this._getMyConsumption(spaceId, category as any)
  }

  @IpcMethod()
  async queryGoods(spaceId: string, filters: any): Promise<any> {
    return this._queryGoods(spaceId, filters)
  }

  @IpcMethod()
  async debugQuery(spaceId: string, sql: string): Promise<any[]> {
    const db = this.dataStore.getDatabase(spaceId)
    const stmt = db.prepare(sql)
    return stmt.all()
  }

  // ============================================
  // Browser Explorer
  // ============================================

  /**
   * 探索目标 URL，监听网络请求，自动发现 API
   */
  @IpcMethod()
  async exploreUrl(
    url: string,
    windowId?: number,
    options?: {
      timeout?: number
      scrollToBottom?: boolean
      waitForNetworkIdle?: number
    }
  ): Promise<{
    url: string
    title?: string
    description?: string
    requests: Array<{
      id: string
      url: string
      method: string
      headers?: Record<string, any>
      postData?: string
      timestamp: number
    }>
    responses: Array<{
      requestId: string
      url: string
      statusCode: number
      headers?: Record<string, any>
      body?: string
      contentType?: string
      timestamp: number
    }>
    logs: string[]
    errors: string[]
  }> {
    // Get browser window from windowId or use main window
    let browserWindow: BrowserWindow | undefined
    if (windowId) {
      browserWindow = BrowserWindow.fromId(windowId) || undefined
    } else {
      browserWindow = this.getWindowService()?.getMainWindow() || undefined
    }

    if (!browserWindow) {
      throw new Error("No browser window available")
    }

    const result = await this.browserExplorer.explore(
      url,
      browserWindow,
      options
    )

    // Serialize for IPC
    return {
      url: result.url,
      title: result.title,
      description: result.description,
      requests: result.requests,
      responses: result.responses,
      logs: result.logs,
      errors: result.errors,
    }
  }
}
