// IMPORTANT: Import env first to set SQLITE_USE_URI before better-sqlite3 is loaded
import "../../data-space/worker/sqlite-server/env"

import {
  OpenData,
  type OpenDataAdapter,
  type OpenDataResult,
} from "@eidos.space/opendata"
import type Database from "better-sqlite3"
import { BrowserWindow, WebContentsView } from "electron"

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
    adapter: OpenDataAdapter,
    args: Record<string, any>,
    browserWindow: BrowserWindow,
    store: OpenData,
    db: Database.Database
  ): Promise<
    OpenDataResult & {
      persisted: { agents: number; goods: number; relations: number }
    }
  > {
    console.log("[OpenData] runBrowserAdapter V3:", {
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

    // Open DevTools only if adapter explicitly enables it
    if (adapter.protocol?.devTools) {
      view.webContents.openDevTools({ mode: "detach" })
    }

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

      // Step 1.5: Store raw data to raw_data table
      console.log("[OpenData] === STORING RAW DATA ===")
      try {
        await this.dataPersister.storeRawData(
          db,
          adapter.meta.site,
          rawEntities
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

      // Step 3: Persist results
      console.log("[OpenDataService] Persisting results...")
      const persisted = await this.dataPersister.persistResults(
        store,
        db,
        adapter,
        result
      )
      console.log("[OpenDataService] Persist complete:", persisted)

      return { ...result, persisted }
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
}
