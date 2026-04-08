// IMPORTANT: Import env first to set SQLITE_USE_URI before better-sqlite3 is loaded
import "../data-space/worker/sqlite-server/env"

import {
  OpenData,
  OpenDataManager,
  RawDataStore,
  type Agent,
  type Good,
  type GoodCategory,
  type MatchedAdapter,
  type OpenDataAdapter,
  type OpenDataResult,
  type Relation,
  type RelationType,
} from "@eidos.space/opendata"
import Database from "better-sqlite3"
import type { IpcMainInvokeEvent } from "electron"
import { BrowserWindow, WebContentsView, app } from "electron"
import * as fsNode from "node:fs/promises"
import * as path from "node:path"
import { transform } from "oxc-transform"
import {
  IpcMethod,
  IpcService,
  IpcServiceBase,
} from "@eidos.space/electron-ipc"

import { Injectable, Inject } from "../../common/di"
import { WindowService } from "../window/window.service"
import { getSpacePath } from "../../utils/paths"

/**
 * File system wrapper for OpenDataManager
 */
class ElectronFileSystem {
  private basePath: string

  constructor(basePath: string) {
    this.basePath = basePath
  }

  private resolvePath(inputPath: string): string {
    if (inputPath.startsWith("~/")) {
      return path.join(this.basePath, inputPath.slice(2))
    }
    return path.join(this.basePath, inputPath)
  }

  async readFile(inputPath: string): Promise<Uint8Array>
  async readFile(
    inputPath: string,
    options: { encoding: string }
  ): Promise<string>
  async readFile(
    inputPath: string,
    options?: { encoding: string }
  ): Promise<string | Uint8Array> {
    const fullPath = this.resolvePath(inputPath)
    if (options?.encoding === "utf8") {
      return fsNode.readFile(fullPath, "utf8")
    }
    return fsNode.readFile(fullPath)
  }

  async writeFile(
    inputPath: string,
    data: string | Uint8Array,
    encoding?: string
  ): Promise<void> {
    const fullPath = this.resolvePath(inputPath)
    await fsNode.mkdir(path.dirname(fullPath), { recursive: true })
    if (typeof data === "string") {
      await fsNode.writeFile(fullPath, data, encoding as BufferEncoding)
    } else {
      await fsNode.writeFile(fullPath, data)
    }
  }

  async readdir(
    inputPath: string,
    options?: { recursive?: boolean }
  ): Promise<string[]> {
    const fullPath = this.resolvePath(inputPath)

    async function walk(dir: string, baseDir: string): Promise<string[]> {
      const entries = await fsNode.readdir(dir, { withFileTypes: true })
      const files: string[] = []

      for (const entry of entries) {
        const relativePath = path.relative(baseDir, path.join(dir, entry.name))
        if (entry.isDirectory() && options?.recursive) {
          files.push(...(await walk(path.join(dir, entry.name), baseDir)))
        } else if (entry.isFile()) {
          files.push(relativePath)
        }
      }

      return files
    }

    return walk(fullPath, fullPath)
  }

  async exists(inputPath: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(inputPath)
      await fsNode.access(fullPath)
      return true
    } catch {
      return false
    }
  }

  async mkdir(inputPath: string): Promise<void> {
    const fullPath = this.resolvePath(inputPath)
    await fsNode.mkdir(fullPath, { recursive: true })
  }
}

/**
 * OpenData Service for Electron
 * Manages adapters, runs pipelines, and persists data to local database
 */
@IpcService("opendata", { exposeMode: "decorated" })
@Injectable()
export class OpenDataService extends IpcServiceBase {
  private managers: Map<string, OpenDataManager> = new Map()
  private dataStores: Map<string, OpenData> = new Map()
  private databases: Map<string, Database.Database> = new Map()
  // Running locks to prevent duplicate execution
  private runningAdapters: Map<string, Promise<any>> = new Map()

  constructor(@Inject(WindowService) private windowService: WindowService) {
    super()
    console.log("[OpenData] OpenDataService constructor called")
  }

  /**
   * Load adapter with oxc-transform transpilation for TypeScript files
   */
  private async loadAdapterWithTransform(
    fs: ElectronFileSystem,
    filePath: string
  ): Promise<OpenDataAdapter | null> {
    console.log("[OpenData] loadAdapterWithTransform:", filePath)
    const exists = await fs.exists(filePath)
    if (!exists) {
      console.log("[OpenData] File does not exist:", filePath)
      return null
    }

    if (!/\.(ts|js|mjs)$/.test(filePath)) {
      console.log("[OpenData] Invalid file extension:", filePath)
      return null
    }

    try {
      // For .js/.mjs files, try direct import first
      if (!filePath.endsWith(".ts")) {
        console.log("[OpenData] Loading JS file directly:", filePath)
        const module = await import(filePath)
        console.log("[OpenData] JS module loaded:", Object.keys(module))
        return module.default || module
      }

      // For .ts files, use oxc-transform to transpile
      console.log("[OpenData] Reading TS file:", filePath)
      const content = await fs.readFile(filePath, { encoding: "utf8" })

      console.log("[OpenData] Transforming with oxc-transform...")
      const result = transform(filePath, content, {
        target: "node20",
        sourcemap: false,
      })
      console.log("[OpenData] Transform result length:", result.code.length)

      // Replace @eidos.space/opendata imports with inline defineAdapter
      // defineAdapter is just: (options) => options
      const transformedCode = result.code.replace(
        /import\s*{\s*[^}]*}\s*from\s*["']@eidos\.space\/opendata["'];?\n?/g,
        "const defineAdapter = (opts) => opts; const $ = { id: (...parts) => parts.join('_'), get: (obj, path, def) => path.split('.').reduce((o,p)=>o?.[p], obj) ?? def, string: (obj, path, def) => $.get(obj, path, def), number: (obj, path, def) => Number($.get(obj, path, def)) ?? def, fingerprint: (source, id, ...extras) => [source, id, ...extras].join('_'), has: (obj, path) => $.get(obj, path) !== undefined };\n"
      )

      // Create a temporary file with the compiled code in Electron's userData folder
      const tmpDir = path.join(app.getPath("userData"), "opendata-cache")
      await fsNode.mkdir(tmpDir, { recursive: true })

      const hash = Buffer.from(filePath)
        .toString("base64")
        .replace(/[^a-zA-Z0-9]/g, "_")
      const tmpFile = path.join(tmpDir, `adapter_${hash}.mjs`)

      await fsNode.writeFile(tmpFile, transformedCode, "utf8")
      console.log("[OpenData] Written temp file:", tmpFile)
      console.log("[OpenData] Written temp file:", tmpFile)

      // Import the compiled module
      const module = await import(tmpFile)
      console.log("[OpenData] Imported module keys:", Object.keys(module))
      console.log("[OpenData] module.default:", module.default)

      const adapter = module.default || module
      console.log("[OpenData] Loaded adapter:", adapter?.meta)
      return adapter
    } catch (error) {
      console.error(`[OpenData] Failed to load adapter ${filePath}:`, error)
      return null
    }
  }

  /**
   * Get or create OpenDataManager for a space
   */
  private async getManager(spaceId: string): Promise<OpenDataManager> {
    console.log(
      "[OpenData] getManager called for:",
      spaceId,
      "exists:",
      this.managers.has(spaceId)
    )

    // DEBUG: Always recreate manager to ensure latest code is used
    // Remove this in production
    this.managers.delete(spaceId)

    if (!this.managers.has(spaceId)) {
      console.log("[OpenData] Creating new manager for space:", spaceId)
      const spacePath = getSpacePath(spaceId)
      console.log("[OpenData] Space path:", spacePath)
      const fs = new ElectronFileSystem(spacePath)

      // Create bound loader function
      const loader = (fs: any, filePath: string) => {
        console.log("[OpenData] Custom loader called for:", filePath)
        return this.loadAdapterWithTransform(fs as ElectronFileSystem, filePath)
      }

      console.log(
        "[OpenData] Creating OpenDataManager with custom loader:",
        !!loader
      )
      const manager = new OpenDataManager(fs, "~/.eidos/.opendata", loader)
      console.log("[OpenData] Calling manager.loadAdapters()...")
      await manager.loadAdapters()
      console.log("[OpenData] Loaded adapters:", manager.getAdapters().size)
      this.managers.set(spaceId, manager)
    }
    return this.managers.get(spaceId)!
  }

  /**
   * Get or create database for a space
   */
  private getDatabase(spaceId: string): Database.Database {
    if (!this.databases.has(spaceId)) {
      const spacePath = getSpacePath(spaceId)
      const dbPath = path.join(spacePath, ".eidos", "opendata.db")

      // Ensure directory exists
      const fs = new ElectronFileSystem(spacePath)
      fs.mkdir(path.dirname(dbPath)).catch(() => {})

      const db = new Database(dbPath)
      db.pragma("journal_mode = WAL")
      this.databases.set(spaceId, db)
    }
    return this.databases.get(spaceId)!
  }

  /**
   * Get or create OpenData store for a space
   */
  private getDataStore(spaceId: string): OpenData {
    if (!this.dataStores.has(spaceId)) {
      const db = this.getDatabase(spaceId)
      const store = new OpenData(db, { debug: false })
      this.dataStores.set(spaceId, store)
    }
    return this.dataStores.get(spaceId)!
  }

  /**
   * Close all data stores and database connections
   */
  closeAll(): void {
    for (const db of this.databases.values()) {
      db.close()
    }
    this.databases.clear()
    this.dataStores.clear()
    this.managers.clear()
  }

  /**
   * Reload adapters for a space
   */
  async _reloadAdapters(spaceId: string): Promise<void> {
    const manager = await this.getManager(spaceId)
    await manager.loadAdapters()
  }

  /**
   * Find adapters matching a URL
   */
  async _findAdapters(spaceId: string, url: string): Promise<MatchedAdapter[]> {
    console.log("[OpenDataService] findAdapters:", { spaceId, url })
    const manager = await this.getManager(spaceId)
    const adapters = manager.findAdaptersForUrl(url)
    console.log(
      "[OpenDataService] Found adapters:",
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
    console.log("[OpenDataService] findListAdapters:", { spaceId, url })
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
    console.log("[OpenDataService] Filtered adapters:", filtered.length)
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
  ): Promise<
    OpenDataResult & {
      persisted: { agents: number; goods: number; relations: number }
    }
  > {
    // Create unique key for this adapter run
    const runKey = `${spaceId}:${adapterPath}`

    // Check if already running
    const existingRun = this.runningAdapters.get(runKey)
    if (existingRun) {
      console.log(
        "[OpenDataService] Adapter already running, returning existing promise:",
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
  ): Promise<
    OpenDataResult & {
      persisted: { agents: number; goods: number; relations: number }
    }
  > {
    console.log("[OpenDataService] runAdapter:", { spaceId, adapterPath, args })
    const manager = await this.getManager(spaceId)
    const adapter = await manager.getAdapter(adapterPath)

    if (!adapter) {
      throw new Error(`Adapter not found: ${adapterPath}`)
    }

    // Run adapter
    const isBrowserAdapter = adapter.protocol?.browser
    console.log(
      "[OpenDataService] isBrowserAdapter:",
      isBrowserAdapter,
      "hasBrowserWindow:",
      !!browserWindow
    )

    let result: OpenDataResult
    if (isBrowserAdapter && browserWindow) {
      console.log("[OpenDataService] Running browser adapter...")
      result = await this.runBrowserAdapter(
        spaceId,
        adapter,
        args,
        browserWindow
      )
      console.log("[OpenDataService] Browser adapter completed")
    } else {
      throw new Error(
        "V3 adapter runner not yet implemented. " +
          "Adapters must be run through the browser for now."
      )
    }

    console.log("[OpenDataService] Result data sample:", result.data?.[0])
    console.log("[OpenDataService] Result data length:", result.data?.length)

    // Persist results to database
    console.log("[OpenDataService] Persisting results...")
    const persisted = await this.persistResults(spaceId, adapter, result)
    console.log("[OpenDataService] Persist complete:", persisted)

    return { ...result, persisted }
  }

  /**
   * Persist adapter results to database
   * Supports both economic format (agent/good/relations) and legacy format
   */
  private async persistResults(
    spaceId: string,
    adapter: OpenDataAdapter,
    result: OpenDataResult
  ): Promise<{ agents: number; goods: number; relations: number }> {
    const store = this.getDataStore(spaceId)
    const source = adapter.meta.site

    // Check if data is in V3 economic format (agents/goods/relations arrays)
    const resultWithModel = result as any
    const isV3EconomicFormat =
      resultWithModel.agents?.length > 0 ||
      resultWithModel.goods?.length > 0 ||
      resultWithModel.relations?.length > 0

    console.log(
      `[OpenDataService] Format detection: isV3EconomicFormat=${isV3EconomicFormat}`
    )
    console.log(
      `[OpenDataService] Agents:`,
      resultWithModel.agents?.length || 0
    )
    console.log(`[OpenDataService] Goods:`, resultWithModel.goods?.length || 0)
    console.log(
      `[OpenDataService] Relations:`,
      resultWithModel.relations?.length || 0
    )

    const transaction = store["db"].transaction(() => {
      if (isV3EconomicFormat) {
        console.log("[OpenDataService] Using V3 economic format persister")
        return this.persistV3EconomicFormat(store, source, resultWithModel)
      } else if (
        result.data.length > 0 &&
        (result.data[0].agent || result.data[0].good)
      ) {
        console.log("[OpenDataService] Using legacy economic format persister")
        return this.persistEconomicFormat(store, source, result.data)
      } else {
        console.log("[OpenDataService] Using legacy format persister")
        return this.persistLegacyFormat(store, adapter, result.data)
      }
    })

    return transaction()
  }

  /**
   * Persist economic format data (trade protocol)
   */
  private persistEconomicFormat(
    store: OpenData,
    source: string,
    data: any[]
  ): { agents: number; goods: number; relations: number } {
    let agents = 0,
      goods = 0,
      relations = 0
    const agentIdMap = new Map<string, string>() // external_id -> internal_id
    const goodIdMap = new Map<string, string>()

    // 1. Process all agents first
    for (const item of data) {
      if (item.agent) {
        const agentData = item.agent
        const externalId = agentData.external_id || agentData.name

        if (!agentIdMap.has(externalId)) {
          let agent = store.findAgentByFingerprint(source, externalId)
          if (!agent) {
            agent = store.createAgent({
              role: agentData.role || "producer",
              name: agentData.name,
              fingerprints: {
                [source]: externalId,
                ...(agentData.fingerprints || {}),
              },
              description: agentData.description,
            })
            agents++
          }
          agentIdMap.set(externalId, agent.id)
        }
      }
    }

    // 2. Process all goods
    for (const item of data) {
      if (item.good) {
        const goodData = item.good
        const externalId = goodData.external_id

        if (!goodIdMap.has(externalId)) {
          let good = store.findGoodByFingerprint(source, externalId)

          // Resolve producer reference
          let producedBy: string | undefined
          if (item.agent) {
            const producerExternalId = item.agent.external_id || item.agent.name
            producedBy = agentIdMap.get(producerExternalId)
          }

          good = store.createGood({
            id: good?.id,
            category: goodData.category,
            title: goodData.title,
            summary: goodData.summary,
            produced_by: producedBy,
            fingerprints: {
              [source]: externalId,
              ...(goodData.fingerprints || {}),
            },
            use_value: goodData.use_value || {},
            exchange_value: goodData.exchange_value || {},
            production_data: {
              ...(typeof good?.production_data === "string"
                ? JSON.parse(good.production_data)
                : good?.production_data || {}),
              [source]: { raw: item._raw || goodData, fetched_at: Date.now() },
            },
          })

          goodIdMap.set(externalId, good.id)
          goods++
        }
      }
    }

    // 3. Process all relations
    console.log(
      `[OpenDataService] Processing relations for ${data.length} items`
    )
    console.log(
      `[OpenDataService] goodIdMap keys:`,
      Array.from(goodIdMap.keys())
    )

    // Pre-load shelf IDs that might be referenced (e.g., 'shelf-default')
    const shelfIds = new Map<string, string>()
    for (const item of data) {
      if (item.relations) {
        for (const rel of item.relations) {
          console.log(
            `[OpenDataService] Checking relation: type=${rel.type}, subject=${rel.subject_external_id}, subject_type=${rel.subject_type}`
          )
          if (
            rel.subject_type === "good" &&
            !goodIdMap.has(rel.subject_external_id)
          ) {
            // Try to find shelf by ID (for pre-created shelves like 'shelf-default')
            console.log(
              `[OpenDataService] Looking for pre-created shelf: ${rel.subject_external_id}`
            )
            const shelf = store.getGood(rel.subject_external_id)
            if (shelf) {
              shelfIds.set(rel.subject_external_id, shelf.id)
              console.log(
                `[OpenDataService] Found pre-created shelf: ${rel.subject_external_id} -> ${shelf.id}`
              )
            } else {
              console.log(
                `[OpenDataService] Shelf not found: ${rel.subject_external_id}`
              )
            }
          }
        }
      }
    }
    console.log(
      `[OpenDataService] shelfIds map:`,
      Array.from(shelfIds.entries())
    )

    for (const item of data) {
      if (item.relations && Array.isArray(item.relations)) {
        console.log(
          `[OpenDataService] Processing ${item.relations.length} relations for item`
        )
        for (const rel of item.relations) {
          const subjectId =
            rel.subject_external_id === "me"
              ? store.getConsumer().id
              : agentIdMap.get(rel.subject_external_id) ||
                goodIdMap.get(rel.subject_external_id) ||
                shelfIds.get(rel.subject_external_id) ||
                rel.subject_external_id

          const objectId =
            rel.object_external_id === "me"
              ? store.getConsumer().id
              : goodIdMap.get(rel.object_external_id) ||
                agentIdMap.get(rel.object_external_id) ||
                rel.object_external_id

          console.log(
            `[OpenDataService] Creating relation: ${rel.type} ${subjectId} -> ${objectId}`
          )

          store.createRelation({
            type: rel.type,
            subject_type: rel.subject_type,
            subject_id: subjectId,
            object_type: rel.object_type,
            object_id: objectId,
            source,
            context: rel.context || {},
          })
          relations++
        }
      }
    }

    console.log(
      `[OpenDataService] Persisted: ${agents} agents, ${goods} goods, ${relations} relations`
    )
    return { agents, goods, relations }
  }

  /**
   * Persist V3 economic format data (agents/goods/relations arrays)
   */
  private persistV3EconomicFormat(
    store: OpenData,
    source: string,
    result: { agents: any[]; goods: any[]; relations: any[] }
  ): { agents: number; goods: number; relations: number } {
    let agents = 0,
      goods = 0,
      relations = 0
    const agentIdMap = new Map<string, string>()
    const goodIdMap = new Map<string, string>()

    // 1. Process all agents
    for (const agentData of result.agents || []) {
      const externalId =
        agentData.fingerprints?.[source] || agentData.id || agentData.name

      if (!agentIdMap.has(externalId)) {
        let agent = store.findAgentByFingerprint(source, externalId)
        if (!agent) {
          agent = store.createAgent({
            role: agentData.role || "producer",
            name: agentData.name,
            fingerprints: {
              [source]: externalId,
              ...(agentData.fingerprints || {}),
            },
            description: agentData.description,
          })
          agents++
        }
        agentIdMap.set(externalId, agent.id)
      }
    }

    // 2. Process all goods
    for (const goodData of result.goods || []) {
      const externalId = goodData.fingerprints?.[source] || goodData.id

      if (!goodIdMap.has(externalId)) {
        let good = store.findGoodByFingerprint(source, externalId)

        // Resolve producer reference
        let producedBy: string | undefined
        if (goodData.producedBy) {
          producedBy = agentIdMap.get(goodData.producedBy)
        }

        good = store.createGood({
          id: good?.id,
          category: goodData.category,
          title: goodData.title,
          summary: goodData.summary,
          produced_by: producedBy,
          fingerprints: {
            [source]: externalId,
            ...(goodData.fingerprints || {}),
          },
          use_value: goodData.useValue || {},
          exchange_value: goodData.exchangeValue || {},
          production_data: {
            ...(typeof good?.production_data === "string"
              ? JSON.parse(good.production_data)
              : good?.production_data || {}),
            [source]: { raw: goodData, fetched_at: Date.now() },
          },
        })

        goodIdMap.set(externalId, good.id)
        goods++
      }
    }

    // 3. Process all relations
    for (const rel of result.relations || []) {
      let subjectId: string | undefined
      let objectId: string | undefined

      // Resolve subject
      if (rel.subject_type === "agent") {
        if (rel.subject_id === "me") {
          subjectId = store.getConsumer().id
        } else {
          subjectId = agentIdMap.get(rel.subject_id)
        }
      } else if (rel.subject_type === "good") {
        subjectId = goodIdMap.get(rel.subject_id) || rel.subject_id
      }

      // Resolve object
      if (rel.object_type === "agent") {
        if (rel.object_id === "me") {
          objectId = store.getConsumer().id
        } else {
          objectId = agentIdMap.get(rel.object_id)
        }
      } else if (rel.object_type === "good") {
        objectId = goodIdMap.get(rel.object_id) || rel.object_id
      }

      if (subjectId && objectId) {
        store.createRelation({
          type: rel.type,
          subject_type: rel.subject_type,
          subject_id: subjectId,
          object_type: rel.object_type,
          object_id: objectId,
          context: rel.context || {},
        })
        relations++
      }
    }

    console.log(
      `[OpenDataService] V3 Persisted: ${agents} agents, ${goods} goods, ${relations} relations`
    )
    return { agents, goods, relations }
  }

  /**
   * Persist legacy format data (backward compatibility)
   */
  private persistLegacyFormat(
    store: OpenData,
    adapter: OpenDataAdapter,
    data: any[]
  ): { agents: number; goods: number; relations: number } {
    const source = adapter.meta.site
    let agents = 0,
      goods = 0,
      relations = 0

    // 1. Process agents (producers)
    const agentMap = new Map<string, string>()

    for (const row of data) {
      if (row.author || row.producer || row.creator) {
        const name = row.author || row.producer || row.creator
        const externalId = `${source}:${name}`

        let agent = store.findAgentByFingerprint(source, externalId)
        if (!agent) {
          agent = store.createAgent({
            role: "producer",
            name,
            fingerprints: { [source]: externalId },
          })
          agents++
        }
        agentMap.set(externalId, agent.id)
      }
    }

    // 2. Process goods
    const consumer = store.getConsumer()
    const goodMap = new Map<string, string>()

    for (const row of data) {
      const externalId =
        row.id || row.bookId || row.videoId || `${source}:${row.title}`
      const category = this.inferCategory(adapter, row)

      let good = store.findGoodByFingerprint(source, externalId)
      const producedBy =
        row.author || row.producer || row.creator
          ? agentMap.get(
              `${source}:${row.author || row.producer || row.creator}`
            )
          : undefined

      good = store.createGood({
        id: good?.id,
        category,
        title: row.title || row.name || "Untitled",
        summary: row.description || row.summary,
        produced_by: producedBy,
        fingerprints: {
          [source]: externalId,
          ...this.extractFingerprints(row),
        },
        use_value: this.extractUseValue(row),
        exchange_value: this.extractExchangeValue(row),
        production_data: {
          ...(typeof good?.production_data === "string"
            ? JSON.parse(good.production_data)
            : good?.production_data || {}),
          [source]: { raw: row, fetched_at: Date.now() },
        },
      })

      if (!goodMap.has(externalId)) goods++
      goodMap.set(externalId, good.id)

      // Create OWNS relation
      store.createRelation({
        type: "OWNS",
        subject_type: "agent",
        subject_id: consumer.id,
        object_type: "good",
        object_id: good.id,
        source,
        context: { imported_at: Date.now() },
      })
      relations++

      // Create CONSUMES relation if status present
      if (row.status || row.progress || row.rating) {
        store.createRelation({
          type: "CONSUMES",
          subject_type: "agent",
          subject_id: consumer.id,
          object_type: "good",
          object_id: good.id,
          source,
          context: {
            status: row.status,
            progress: row.progress,
            rating: row.rating,
            last_read: row.lastReadAt || row.updated_at,
          },
        })
      }
    }

    return { agents, goods, relations }
  }

  /**
   * Infer good category from adapter and data
   */
  private inferCategory(
    adapter: OpenDataAdapter,
    row: Record<string, any>
  ): GoodCategory {
    const site = adapter.meta.site.toLowerCase()
    if (site.includes("book") || site.includes("read")) return "book"
    if (
      site.includes("video") ||
      site.includes("youtube") ||
      site.includes("bili")
    )
      return "video"
    if (
      site.includes("music") ||
      site.includes("audio") ||
      site.includes("spotify")
    )
      return "audio"
    if (site.includes("movie") || site.includes("douban"))
      return row.isbn ? "book" : "movie"
    if (row.isbn) return "book"
    if (row.duration || row.videoId) return "video"
    return "article"
  }

  /**
   * Extract fingerprints from row data
   */
  private extractFingerprints(
    row: Record<string, any>
  ): Record<string, string> {
    const fingerprints: Record<string, string> = {}
    if (row.isbn) fingerprints.isbn = row.isbn
    if (row.doi) fingerprints.doi = row.doi
    if (row.url) fingerprints.url = row.url
    return fingerprints
  }

  /**
   * Extract use value (content) from row
   */
  private extractUseValue(row: Record<string, any>): Record<string, any> {
    const {
      title,
      name,
      description,
      summary,
      content,
      text,
      pages,
      duration,
      ...rest
    } = row
    return {
      title,
      name,
      description,
      summary,
      content,
      text,
      pages,
      duration,
      ...rest,
    }
  }

  /**
   * Extract exchange value (metadata) from row
   */
  private extractExchangeValue(row: Record<string, any>): Record<string, any> {
    return {
      rating: row.rating,
      likes: row.likes,
      views: row.views,
      comments: row.comments,
      price: row.price,
      ...row.metadata,
    }
  }

  /**
   * Run a browser-based adapter using V3 format
   * Uses WebContentsView (off-screen) like PipelineRunner
   */
  private async runBrowserAdapter(
    spaceId: string,
    adapter: OpenDataAdapter,
    args: Record<string, any>,
    browserWindow: BrowserWindow
  ): Promise<OpenDataResult> {
    console.log("[OpenData] runBrowserAdapter V3:", {
      site: adapter.meta.site,
      name: adapter.meta.name,
    })

    // Create a hidden WebContentsView (like PipelineRunner)
    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })

    // Run off-screen
    view.setBounds({ x: -10000, y: -10000, width: 1280, height: 720 })
    browserWindow.contentView.addChildView(view)

    // Open DevTools for debugging
    view.webContents.openDevTools({ mode: "detach" })

    console.log("[OpenData] WebContentsView created")

    // Track current navigation state
    let currentUrl = ""
    let isLoading = false

    // Set up event listeners
    view.webContents.on("did-start-loading", () => {
      isLoading = true
      console.log("[OpenData] Event: did-start-loading")
    })

    view.webContents.on("did-stop-loading", () => {
      isLoading = false
      console.log(
        "[OpenData] Event: did-stop-loading, URL:",
        view.webContents.getURL()
      )
    })

    view.webContents.on("did-finish-load", () => {
      currentUrl = view.webContents.getURL()
      console.log("[OpenData] Event: did-finish-load, URL:", currentUrl)
    })

    view.webContents.on("did-fail-load", (e, code, desc, validatedUrl) => {
      console.log(
        "[OpenData] Event: did-fail-load, code:",
        code,
        "desc:",
        desc,
        "url:",
        validatedUrl
      )
    })

    try {
      // Create BrowserContext implementation
      const browserContext = {
        navigate: async (url: string) => {
          console.log("[OpenData] === NAVIGATE ===")
          console.log("[OpenData] Navigate to:", url)
          console.log(
            "[OpenData] Current URL before navigate:",
            view.webContents.getURL()
          )

          await view.webContents.loadURL(url)
          console.log("[OpenData] loadURL called, waiting for page load...")

          // Wait for page to finish loading
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error(`Navigate timeout after 30s: ${url}`))
            }, 30000)

            const checkLoaded = () => {
              if (!view.webContents.isLoadingMainFrame()) {
                clearTimeout(timeout)
                console.log(
                  "[OpenData] Page loaded, URL:",
                  view.webContents.getURL()
                )
                resolve()
              } else {
                setTimeout(checkLoaded, 100)
              }
            }

            checkLoaded()
          })

          console.log("[OpenData] === NAVIGATE COMPLETE ===")
        },

        settle: async (ms: number) => {
          console.log("[OpenData] Settle for", ms, "ms...")
          await new Promise((r) => setTimeout(r, ms))
          console.log("[OpenData] Settle complete")
        },

        evaluate: async <T, Args extends any[]>(
          fn: (...args: Args) => T | Promise<T>,
          ...fnArgs: Args
        ): Promise<T> => {
          console.log("[OpenData] === EVALUATE ===")
          console.log("[OpenData] Current URL:", view.webContents.getURL())
          console.log(
            "[OpenData] Function:",
            fn.toString().slice(0, 200),
            "..."
          )

          const fnStr = fn.toString()
          const argsStr = fnArgs.map((a) => JSON.stringify(a)).join(",")

          // Wrap in async IIFE to handle both sync and async functions
          const code = `
            (async () => {
              try {
                const fn = ${fnStr};
                return await fn(${argsStr});
              } catch (err) {
                return { __error: true, message: err.message, stack: err.stack };
              }
            })()
          `

          console.log("[OpenData] Executing in page context...")
          const result = await view.webContents.executeJavaScript(code, true)

          if (result && result.__error) {
            console.error("[OpenData] Evaluate error:", result.message)
            throw new Error(result.message)
          }

          console.log(
            "[OpenData] Result:",
            typeof result,
            Array.isArray(result)
              ? `array[${result.length}]`
              : result !== null && typeof result === "object"
                ? `object{${Object.keys(result).join(",")}}`
                : String(result).slice(0, 100)
          )
          console.log("[OpenData] === EVALUATE COMPLETE ===")

          return result
        },

        click: async (selector: string) => {
          console.log("[OpenData] Click:", selector)
          await view.webContents.executeJavaScript(`
            document.querySelector(${JSON.stringify(selector)})?.click()
          `)
        },

        fill: async (selector: string, value: string) => {
          console.log("[OpenData] Fill:", selector, "=", value)
          await view.webContents.executeJavaScript(`
            const el = document.querySelector(${JSON.stringify(selector)});
            if (el) { el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input')); }
          `)
        },
      }

      // Create HttpContext - makes requests in the context of the current page
      const httpContext = {
        get: async (url: string, params?: Record<string, any>) => {
          console.log("[OpenData] === HTTP GET ===")
          const queryString = params
            ? "?" + new URLSearchParams(params).toString()
            : ""
          const fullUrl = url + queryString
          console.log("[OpenData] URL:", fullUrl)
          console.log("[OpenData] Current page:", view.webContents.getURL())

          const result = await view.webContents.executeJavaScript(`
            fetch(${JSON.stringify(fullUrl)}, { 
              credentials: 'include',
              headers: { 'Accept': 'application/json' }
            }).then(async r => {
              if (!r.ok) throw new Error('HTTP ' + r.status);
              return r.json();
            }).catch(err => ({ __error: true, message: err.message }))
          `)

          if (result && result.__error) {
            throw new Error(result.message)
          }

          console.log("[OpenData] HTTP GET result:", typeof result)
          console.log("[OpenData] === HTTP GET COMPLETE ===")
          return result
        },

        post: async (
          url: string,
          body?: any,
          headers?: Record<string, string>
        ) => {
          console.log("[OpenData] === HTTP POST ===")
          console.log("[OpenData] URL:", url)

          const result = await view.webContents.executeJavaScript(`
            fetch(${JSON.stringify(url)}, {
              method: 'POST',
              headers: ${JSON.stringify({ "Content-Type": "application/json", ...headers })},
              body: ${body ? JSON.stringify(JSON.stringify(body)) : "undefined"},
              credentials: 'include'
            }).then(async r => {
              if (!r.ok) throw new Error('HTTP ' + r.status);
              return r.json();
            }).catch(err => ({ __error: true, message: err.message }))
          `)

          if (result && result.__error) {
            throw new Error(result.message)
          }

          console.log("[OpenData] === HTTP POST COMPLETE ===")
          return result
        },
      }

      // Create FetchContext
      const fetchContext = {
        args,
        browser: browserContext,
        http: httpContext,
        log: (message: string, ...logArgs: any[]) => {
          console.log("[Adapter]", message, ...logArgs)
        },
      }

      // Step 1: Fetch raw data
      console.log("[OpenData] === STEP 1: FETCH ===")
      console.log("[OpenData] Calling adapter.fetch()...")
      console.log(
        "[OpenData] This will navigate and then evaluate in page context"
      )

      let rawEntities: any[] = []
      const startTime = Date.now()

      try {
        console.log("[OpenData] Executing adapter.fetch...")
        const fetchResult = await adapter.fetch(fetchContext)
        const elapsed = Date.now() - startTime

        // Validate result
        if (!Array.isArray(fetchResult)) {
          console.error(
            "[OpenData] Fetch returned non-array:",
            typeof fetchResult,
            fetchResult
          )
          throw new Error(
            `Expected array from fetch, got ${typeof fetchResult}`
          )
        }

        rawEntities = fetchResult
        console.log(
          `[OpenData] Fetch completed in ${elapsed}ms, got ${rawEntities.length} entities`
        )

        if (rawEntities.length > 0) {
          console.log("[OpenData] First entity sample:", {
            entityType: rawEntities[0]?.entityType,
            entityId: rawEntities[0]?.entityId,
            dataKeys: Object.keys(rawEntities[0]?.data || {}),
          })
        }
      } catch (fetchError) {
        console.error("[OpenData] Fetch FAILED:", fetchError)
        throw fetchError
      }

      // Step 1.5: Store raw data to opendata_raw_data table
      console.log("[OpenData] === STORING RAW DATA ===")
      try {
        const db = this.getDatabase(spaceId)
        const rawDataStore = new RawDataStore(db)

        const source = adapter.meta.site
        const rawDataRecords = rawEntities.map((entity) => ({
          source,
          entity_type: entity.entityType,
          entity_id: entity.entityId,
          data: JSON.stringify(entity.data),
          checksum: undefined, // Could add checksum for change detection
          fetched_at: Date.now(),
          transformed_at: undefined,
          transform_version: 0,
        }))

        const changed = await rawDataStore.upsertMany(rawDataRecords)
        console.log(
          `[OpenData] Stored ${rawDataRecords.length} raw records, ${changed} changed`
        )
      } catch (storeError) {
        console.error("[OpenData] Failed to store raw data:", storeError)
        // Continue anyway, don't block transform
      }

      // Step 2: Transform to economic model
      console.log("[OpenData] === STEP 2: TRANSFORM ===")
      let agents: any[] = []
      let goods: any[] = []
      let relations: any[] = []

      if (adapter.transform) {
        console.log(
          "[OpenData] adapter.transform exists, processing",
          rawEntities.length,
          "entities..."
        )
        for (let i = 0; i < rawEntities.length; i++) {
          const entity = rawEntities[i]
          try {
            console.log(
              `[OpenData] Transforming entity ${i + 1}/${rawEntities.length}:`,
              entity.entityId
            )
            const result = await adapter.transform(entity)
            console.log(`[OpenData] Entity ${i + 1} transformed:`, {
              agents: result.agents?.length || 0,
              goods: result.goods?.length || 0,
              relations: result.relations?.length || 0,
            })
            if (result.agents) agents.push(...result.agents)
            if (result.goods) goods.push(...result.goods)
            if (result.relations) relations.push(...result.relations)
          } catch (error) {
            console.error(
              `[OpenData] Transform FAILED for entity ${entity.entityId}:`,
              error
            )
          }
        }
      } else {
        console.log("[OpenData] No transform function, using raw data as goods")
        goods = rawEntities.map((e) => ({
          id: e.entityId,
          category: "unknown",
          title: e.data?.title || e.entityId,
          ...e.data,
        }))
      }

      console.log("[OpenData] === TRANSFORM COMPLETE ===")
      console.log("[OpenData] Total:", {
        agents: agents.length,
        goods: goods.length,
        relations: relations.length,
      })

      // Convert to columns/rows format for backward compatibility
      const allRows = [
        ...agents.map((a) => ({ ...a, _type: "agent" })),
        ...goods.map((g) => ({ ...g, _type: "good" })),
      ]
      const columns =
        allRows.length > 0
          ? Object.keys(allRows[0]).filter((k) => !k.startsWith("_"))
          : []
      const data = allRows.map((row) => {
        const filtered: Record<string, any> = {}
        for (const key of columns) {
          filtered[key] = row[key]
        }
        return filtered
      })

      console.log("[OpenData] Building result...")
      // Build result
      const result: OpenDataResult = {
        source: adapter.meta.site,
        data,
        columns,
        adapter,
      }

      // Store the economic model data
      ;(result as any).agents = agents
      ;(result as any).goods = goods
      ;(result as any).relations = relations

      console.log("[OpenData] Returning result from runBrowserAdapter")
      return result
    } catch (error) {
      console.error("[OpenData] runBrowserAdapter ERROR:", error)
      throw error
    } finally {
      // Cleanup
      console.log("[OpenData] Cleaning up WebContentsView...")
      browserWindow.contentView.removeChildView(view)
      view.webContents.close()
      console.log("[OpenData] Cleaned up WebContentsView")
    }
  }

  // ============================================
  // Database Query APIs
  // ============================================

  /**
   * Get my bookshelf
   */
  async _getMyBookshelf(
    spaceId: string,
    shelfId?: string
  ): Promise<{ shelf: Good; books: Good[] }> {
    const store = this.getDataStore(spaceId)
    return store.getMyBookshelf(shelfId)
  }

  /**
   * Get my following list
   */
  async _getMyFollowing(spaceId: string): Promise<Agent[]> {
    const store = this.getDataStore(spaceId)
    return store.getMyFollowing()
  }

  /**
   * Get producer's works
   */
  async getProducerWorks(spaceId: string, producerId: string): Promise<Good[]> {
    const store = this.getDataStore(spaceId)
    return store.getProducerWorks(producerId)
  }

  /**
   * Get my consumption with progress
   */
  async _getMyConsumption(
    spaceId: string,
    category?: GoodCategory
  ): Promise<Array<{ good: Good; context: Record<string, any> }>> {
    const store = this.getDataStore(spaceId)
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
    const store = this.getDataStore(spaceId)
    return store.queryGoods(filters)
  }

  /**
   * Query relations
   */
  async queryRelations(
    spaceId: string,
    filters: { type?: RelationType; subject_id?: string; object_id?: string }
  ): Promise<Relation[]> {
    const store = this.getDataStore(spaceId)
    return store.queryRelations(filters)
  }

  // ============================================
  // Adapter Management
  // ============================================

  @IpcMethod()
  async getAdapters(
    spaceId: string
  ): Promise<{ path: string; adapter: OpenDataAdapter }[]> {
    const manager = await this.getManager(spaceId)
    const adapters = manager.getAdapters()
    return Array.from(adapters.entries()).map(([path, adapter]) => ({
      path,
      adapter,
    }))
  }

  @IpcMethod()
  async saveAdapter(
    spaceId: string,
    filePath: string,
    content: string
  ): Promise<void> {
    const spacePath = getSpacePath(spaceId)
    const adaptersDir = path.join(spacePath, ".eidos", ".opendata")
    const fullPath = path.join(adaptersDir, filePath)

    await fsNode.mkdir(path.dirname(fullPath), { recursive: true })
    await fsNode.writeFile(fullPath, content, "utf8")
    await this.reloadAdapters(spaceId)
  }

  @IpcMethod()
  async deleteAdapter(spaceId: string, filePath: string): Promise<void> {
    const spacePath = getSpacePath(spaceId)
    const fullPath = path.join(spacePath, ".eidos", ".opendata", filePath)
    await fsNode.unlink(fullPath)
    await this.reloadAdapters(spaceId)
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
      browserWindow = this.windowService.getMainWindow() || undefined
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
      columns: result.columns || [],
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
  async getMyBookshelf(spaceId: string, shelfId?: string): Promise<any> {
    return this._getMyBookshelf(spaceId, shelfId)
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
    const db = this.getDatabase(spaceId)
    const stmt = db.prepare(sql)
    return stmt.all()
  }
}
