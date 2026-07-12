// IMPORTANT: Import env first to set SQLITE_USE_URI before better-sqlite3 is loaded
import "../../data-space/worker/sqlite-server/env"

import type { RawData } from "@eidos.space/rawdata"
import { type RawDataAdapter, type RawDataResult } from "@eidos.space/rawdata"
import type Database from "better-sqlite3"
import type { BrowserWindow } from "electron"
import { WebContentsView } from "electron"

import { Inject, Injectable } from "../../../common/di"
import { DataPersisterService } from "../persistence/data-persister.service"

/**
 * Browser Runner Service
 * Executes browser-based adapters using WebContentsView
 */
@Injectable()
export class BrowserRunnerService {
  constructor(
    @Inject(DataPersisterService) private dataPersister: DataPersisterService
  ) {}

  /**
   * Run a browser-based adapter using V3 format
   * Uses WebContentsView (off-screen) like PipelineRunner
   */
  async runAdapter(
    spaceId: string,
    adapter: RawDataAdapter,
    args: Record<string, any>,
    browserWindow: BrowserWindow,
    store: RawData,
    db: Database.Database,
    sendLog?: (message: string) => void
  ): Promise<
    RawDataResult & {
      persisted: { agents: number; goods: number; relations: number }
    }
  > {
    console.log("[RawData] runBrowserAdapter V3:", {
      site: adapter.meta.site,
      name: adapter.meta.name,
    })

    // Create a hidden WebContentsView (like PipelineRunner)
    // Use large screen size (1920x1080) to avoid mobile detection
    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })

    // Run off-screen with desktop-sized viewport
    view.setBounds({ x: -10000, y: -10000, width: 1920, height: 1080 })
    browserWindow.contentView.addChildView(view)

    // Set desktop User-Agent to avoid mobile redirects
    view.webContents.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )

    // Relax CORS for cross-origin API calls with credentials (e.g., GitHub GraphQL)
    const corsFilter = { urls: ["<all_urls>"] }
    const corsHandler = (details: any, callback: any) => {
      const headers = details.responseHeaders || {}
      const origin = details.referrer || ""
      // Rewrite wildcard CORS to allow specific origin with credentials
      if (
        origin &&
        headers["access-control-allow-origin"] &&
        headers["access-control-allow-origin"].includes("*")
      ) {
        headers["access-control-allow-origin"] = [origin]
        headers["access-control-allow-credentials"] = ["true"]
      }
      callback({ responseHeaders: headers })
    }
    view.webContents.session.webRequest.onHeadersReceived(
      corsFilter,
      corsHandler
    )

    // Open DevTools only if adapter explicitly enables it
    if (adapter.protocol?.devTools) {
      view.webContents.openDevTools({ mode: "detach" })
    }

    console.log("[RawData] WebContentsView created")

    // Track current navigation state
    let currentUrl = ""
    let isLoading = false

    // Set up event listeners
    view.webContents.on("did-start-loading", () => {
      isLoading = true
      console.log("[RawData] Event: did-start-loading")
    })

    view.webContents.on("did-stop-loading", () => {
      isLoading = false
      console.log(
        "[RawData] Event: did-stop-loading, URL:",
        view.webContents.getURL()
      )
    })

    view.webContents.on("did-finish-load", () => {
      currentUrl = view.webContents.getURL()
      console.log("[RawData] Event: did-finish-load, URL:", currentUrl)
    })

    view.webContents.on("did-fail-load", (e, code, desc, validatedUrl) => {
      console.log(
        "[RawData] Event: did-fail-load, code:",
        code,
        "desc:",
        desc,
        "url:",
        validatedUrl
      )
    })

    view.webContents.on(
      "console-message",
      (event, level, message, line, sourceId) => {
        const prefix = `[Console ${level}]`
        if (level === 3) {
          console.error(
            "[RawData] Renderer Error:",
            message,
            `at ${sourceId}:${line}`
          )
        } else {
          console.log("[RawData] Renderer Log:", prefix, message)
        }
      }
    )

    try {
      // Create BrowserContext implementation
      const browserContext = {
        navigate: async (url: string) => {
          console.log("[RawData] === NAVIGATE ===")
          console.log("[RawData] Navigate to:", url)
          console.log(
            "[RawData] Current URL before navigate:",
            view.webContents.getURL()
          )

          await view.webContents.loadURL(url)
          console.log("[RawData] loadURL called, waiting for page load...")

          // Wait for page to finish loading
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error(`Navigate timeout after 30s: ${url}`))
            }, 30000)

            const checkLoaded = () => {
              if (!view.webContents.isLoadingMainFrame()) {
                clearTimeout(timeout)
                console.log(
                  "[RawData] Page loaded, URL:",
                  view.webContents.getURL()
                )
                resolve()
              } else {
                setTimeout(checkLoaded, 100)
              }
            }

            checkLoaded()
          })

          console.log("[RawData] === NAVIGATE COMPLETE ===")
        },

        settle: async (ms: number) => {
          console.log("[RawData] Settle for", ms, "ms...")
          await new Promise((r) => setTimeout(r, ms))
          console.log("[RawData] Settle complete")
        },

        evaluate: async <T, Args extends any[]>(
          fn: (...args: Args) => T | Promise<T>,
          ...fnArgs: Args
        ): Promise<T> => {
          console.log("[RawData] === EVALUATE ===")
          console.log("[RawData] Current URL:", view.webContents.getURL())
          console.log("[RawData] Function:", fn.toString().slice(0, 200), "...")

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

          console.log("[RawData] Executing in page context...")
          let result: any
          try {
            result = await view.webContents.executeJavaScript(code, true)
          } catch (execErr: any) {
            console.error("[RawData] executeJavaScript FAILED:", execErr)
            console.error("[RawData] Generated code length:", code.length)
            console.error("[RawData] Generated code:\n", code)
            throw execErr
          }

          if (result && result.__error) {
            console.error("[RawData] Evaluate error:", result.message)
            throw new Error(result.message)
          }

          console.log(
            "[RawData] Result:",
            typeof result,
            Array.isArray(result)
              ? `array[${result.length}]`
              : result !== null && typeof result === "object"
                ? `object{${Object.keys(result).join(",")}}`
                : String(result).slice(0, 100)
          )
          console.log("[RawData] === EVALUATE COMPLETE ===")

          return result
        },

        click: async (selector: string) => {
          console.log("[RawData] Click:", selector)
          await view.webContents.executeJavaScript(`
            document.querySelector(${JSON.stringify(selector)})?.click()
          `)
        },

        fill: async (selector: string, value: string) => {
          console.log("[RawData] Fill:", selector, "=", value)
          await view.webContents.executeJavaScript(`
            const el = document.querySelector(${JSON.stringify(selector)});
            if (el) { el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input')); }
          `)
        },
      }

      // Create HttpContext - makes requests in the context of the current page
      const httpContext = {
        get: async (url: string, params?: Record<string, any>) => {
          console.log("[RawData] === HTTP GET ===")
          const queryString = params
            ? "?" + new URLSearchParams(params).toString()
            : ""
          const fullUrl = url + queryString
          console.log("[RawData] URL:", fullUrl)
          console.log("[RawData] Current page:", view.webContents.getURL())

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

          console.log("[RawData] HTTP GET result:", typeof result)
          console.log("[RawData] === HTTP GET COMPLETE ===")
          return result
        },

        post: async (
          url: string,
          body?: any,
          headers?: Record<string, string>
        ) => {
          console.log("[RawData] === HTTP POST ===")
          console.log("[RawData] URL:", url)

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

          console.log("[RawData] === HTTP POST COMPLETE ===")
          return result
        },
      }

      // Build incremental sync state
      const source = `${adapter.meta.site}/${adapter.meta.name}`
      const existingIds = new Set<string>()
      let cursorValue: string | number | undefined

      if (adapter.sync?.incremental) {
        const rows = db
          .prepare(
            `SELECT entity_id FROM data WHERE source = ? AND entity_type != '__meta__'`
          )
          .all(source) as { entity_id: string }[]
        for (const r of rows) existingIds.add(r.entity_id)

        const cursorRow = db
          .prepare(
            `SELECT data FROM data WHERE source = ? AND entity_type = '__meta__' AND entity_id = '__cursor__'`
          )
          .get(source) as { data: string } | undefined
        if (cursorRow?.data) {
          try {
            cursorValue = JSON.parse(cursorRow.data).value
          } catch {}
        }
      }

      const syncContext = {
        exists: (id: string) => existingIds.has(id),
        getCursor: () => cursorValue,
        setCursor: (value: string | number) => {
          cursorValue = value
          db.prepare(`
            INSERT INTO data (id, source, entity_type, entity_id, data, fetched_at)
            VALUES (?, ?, '__meta__', '__cursor__', ?, ?)
            ON CONFLICT(id) DO UPDATE SET data = excluded.data, fetched_at = excluded.fetched_at
          `).run(
            `${source}#__meta__#__cursor__`,
            source,
            JSON.stringify({ value }),
            Date.now()
          )
        },
      }

      // Create FetchContext
      const fetchContext = {
        args,
        browser: browserContext,
        http: httpContext,
        sync: adapter.sync?.incremental ? syncContext : undefined,
        log: (message: string, ...logArgs: any[]) => {
          console.log("[Adapter]", message, ...logArgs)
        },
      }

      // Step 1: Fetch raw data
      console.log("[RawData] === STEP 1: FETCH ===")
      console.log("[RawData] Calling adapter.fetch()...")
      console.log(
        "[RawData] This will navigate and then evaluate in page context"
      )

      let rawEntities: any[] = []
      const startTime = Date.now()

      try {
        console.log("[RawData] Executing adapter.fetch...")
        const fetchResult = await adapter.fetch(fetchContext)
        const elapsed = Date.now() - startTime

        // Validate result
        if (!Array.isArray(fetchResult)) {
          console.error(
            "[RawData] Fetch returned non-array:",
            typeof fetchResult,
            fetchResult
          )
          throw new Error(
            `Expected array from fetch, got ${typeof fetchResult}`
          )
        }

        rawEntities = fetchResult
        console.log(
          `[RawData] Fetch completed in ${elapsed}ms, got ${rawEntities.length} entities`
        )

        if (rawEntities.length > 0) {
          console.log("[RawData] First entity sample:", {
            entityType: rawEntities[0]?.entityType,
            entityId: rawEntities[0]?.entityId,
            dataKeys: Object.keys(rawEntities[0]?.data || {}),
          })
        }
      } catch (fetchError) {
        console.error("[RawData] Fetch FAILED:", fetchError)
        throw fetchError
      }

      // Step 1.5: Store raw data to data table
      console.log("[RawData] === STORING RAW DATA ===")
      try {
        await this.dataPersister.storeRawData(
          db,
          `${adapter.meta.site}/${adapter.meta.name}`,
          rawEntities
        )
      } catch (storeError) {
        console.error("[RawData] Failed to store raw data:", storeError)
        // Continue anyway, don't block transform
      }

      // Step 2: Transform to economic model
      console.log("[RawData] === STEP 2: TRANSFORM ===")
      let agents: any[] = []
      let goods: any[] = []
      let relations: any[] = []

      if (adapter.transform) {
        console.log(
          "[RawData] adapter.transform exists, processing",
          rawEntities.length,
          "entities..."
        )
        for (let i = 0; i < rawEntities.length; i++) {
          const entity = rawEntities[i]
          try {
            console.log(
              `[RawData] Transforming entity ${i + 1}/${rawEntities.length}:`,
              entity.entityId
            )
            const result = await adapter.transform(entity)
            console.log(`[RawData] Entity ${i + 1} transformed:`, {
              agents: result.agents?.length || 0,
              goods: result.goods?.length || 0,
              relations: result.relations?.length || 0,
            })
            if (result.agents) agents.push(...result.agents)
            if (result.goods) goods.push(...result.goods)
            if (result.relations) relations.push(...result.relations)
          } catch (error) {
            console.error(
              `[RawData] Transform FAILED for entity ${entity.entityId}:`,
              error
            )
          }
        }
      } else {
        console.log("[RawData] No transform function, using raw data as goods")
        goods = rawEntities.map((e) => ({
          id: e.entityId,
          category: "unknown",
          title: e.data?.title || e.entityId,
          ...e.data,
        }))
      }

      console.log("[RawData] === TRANSFORM COMPLETE ===")
      console.log("[RawData] Total:", {
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

      console.log("[RawData] Building result...")
      // Build result
      const result: RawDataResult = {
        source: `${adapter.meta.site}/${adapter.meta.name}`,
        data,
        columns,
        adapter,
      }

      // Store the economic model data
      ;(result as any).agents = agents
      ;(result as any).goods = goods
      ;(result as any).relations = relations

      console.log("[RawData] Returning result from runBrowserAdapter")

      // Step 3: Persist results
      console.log("[RawDataService] Persisting results...")
      const persisted = await this.dataPersister.persistResults(
        store,
        db,
        adapter,
        result
      )
      console.log("[RawDataService] Persist complete:", persisted)

      return { ...result, persisted }
    } catch (error) {
      console.error("[RawData] runBrowserAdapter ERROR:", error)
      throw error
    } finally {
      // Cleanup
      console.log("[RawData] Cleaning up WebContentsView...")
      browserWindow.contentView.removeChildView(view)
      view.webContents.session.webRequest.onHeadersReceived(
        corsFilter,
        null as any
      )
      view.webContents.close()
      console.log("[RawData] Cleaned up WebContentsView")
    }
  }
}
