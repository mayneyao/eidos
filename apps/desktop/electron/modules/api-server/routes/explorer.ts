import { Hono } from "hono"
import type { BrowserExplorerService } from "../../rawdata/explorer/browser-explorer.service"
import type { WindowService } from "../../window/window.service"
import type { ServerContext } from "../server"

/**
 * Setup browser explorer routes
 *
 * Routes:
 * - POST /api/explore - Explore a URL and capture network requests
 */
export function setupExplorerRoutes(
  app: Hono,
  ctx: ServerContext,
  browserExplorer: BrowserExplorerService,
  windowService: WindowService
) {
  // Explore endpoint
  app.post("/api/explore", async (c) => {
    try {
      const body = await c.req.json()
      const {
        url,
        timeout = 30000,
        scrollToBottom = true,
        waitForNetworkIdle = 2000,
        clickSelectors = [],
        maxRequests = 100,
        urlFilter,
        captureResponse = true,
        headless = true,
      } = body

      if (!url) {
        return c.json({ success: false, error: "URL is required" }, 400)
      }

      // Validate URL
      try {
        new URL(url)
      } catch {
        return c.json({ success: false, error: "Invalid URL" }, 400)
      }

      const mainWindow = windowService.getMainWindow()
      if (!mainWindow) {
        return c.json(
          { success: false, error: "No browser window available" },
          503
        )
      }

      ctx.logger.info(`[Explorer] Exploring URL: ${url}`)

      const result = await browserExplorer.explore(url, mainWindow, {
        timeout,
        scrollToBottom,
        waitForNetworkIdle,
        clickSelectors,
        maxRequests,
        urlFilter,
        captureResponse,
        headless,
      })

      ctx.logger.info(
        `[Explorer] Completed: ${result.requests.length} requests, ${result.responses.length} responses`
      )

      return c.json({
        success: true,
        data: result,
      })
    } catch (error: any) {
      ctx.logger.error(`[Explorer] Error: ${error.message}`)
      return c.json({ success: false, error: error.message }, 500)
    }
  })

  // Health check
  app.get("/api/explore/health", async (c) => {
    const mainWindow = windowService.getMainWindow()
    return c.json({
      success: true,
      data: {
        available: !!mainWindow,
      },
    })
  })
}
