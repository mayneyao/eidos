// IMPORTANT: Import env first to set SQLITE_USE_URI before better-sqlite3 is loaded
import "../../data-space/worker/sqlite-server/env"

import { BrowserWindow, WebContentsView } from "electron"

import { Injectable } from "../../../common/di"

export interface NetworkRequest {
  id: string
  url: string
  method: string
  headers?: Record<string, string>
  postData?: string
  timestamp: number
}

export interface NetworkResponse {
  requestId: string
  url: string
  statusCode: number
  headers?: Record<string, string>
  body?: string
  contentType?: string
  timestamp: number
}

export interface ExploreOptions {
  /** Exploration timeout in milliseconds */
  timeout?: number
  /** Whether to scroll to bottom to trigger lazy loading */
  scrollToBottom?: boolean
  /** Wait time for network idle in milliseconds */
  waitForNetworkIdle?: number
  /** List of selectors to click */
  clickSelectors?: string[]
  /** Maximum number of requests to capture */
  maxRequests?: number
  /** Regex pattern to filter URLs */
  urlFilter?: string
  /** Whether to capture response bodies */
  captureResponse?: boolean
  /**
   * Whether to use headless mode (off-screen)
   * - true: Off-screen rendering, browser window is hidden (default)
   * - false: Show browser window for debugging/observation
   */
  headless?: boolean
}

export interface ExploreResult {
  url: string
  title?: string
  description?: string
  requests: NetworkRequest[]
  responses: NetworkResponse[]
  logs: string[]
  errors: string[]
}

/**
 * Browser Explorer Service
 * Provides basic browser CDP capabilities for exploring target URLs and capturing network requests
 *
 * Note: This service only provides raw data and does not handle adapter generation logic
 * Adapter generation should be done by external AI Agents analyzing the returned data
 */
@Injectable()
export class BrowserExplorerService {
  /**
   * Explore target URL and capture network requests and responses
   */
  async explore(
    url: string,
    browserWindow: BrowserWindow,
    options: ExploreOptions = {}
  ): Promise<ExploreResult> {
    const {
      timeout = 30000,
      scrollToBottom = true,
      waitForNetworkIdle = 2000,
      clickSelectors = [],
      maxRequests = 100,
      urlFilter,
      captureResponse = true,
      headless = true,
    } = options

    console.log("[BrowserExplorer] Starting exploration:", url)

    const requests: Map<string, NetworkRequest> = new Map()
    const responses: Map<string, NetworkResponse> = new Map()
    const logs: string[] = []
    const errors: string[] = []

    // Decide how to create browser based on headless mode
    let view: WebContentsView
    let debugWindow: any = null
    let cleanupView: () => void

    if (headless) {
      // Headless mode: Use WebContentsView placed off-screen
      // Use large screen size (1920x1080) and desktop User-Agent to avoid being detected as mobile
      view = new WebContentsView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      })
      view.setBounds({ x: -10000, y: -10000, width: 1920, height: 1080 })
      browserWindow.contentView.addChildView(view)

      // Set desktop User-Agent to avoid mobile redirects
      view.webContents.setUserAgent(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      )

      cleanupView = () => {
        browserWindow.contentView.removeChildView(view)
        view.webContents.close()
      }
    } else {
      // Visible mode: Create a standalone BrowserWindow
      // Use BrowserWindow.loadURL directly instead of WebContentsView
      const { BrowserWindow: BW } = require("electron")
      debugWindow = new BW({
        width: 1920,
        height: 1080,
        title: `Explorer: ${url}`,
        show: true,
        webPreferences: {
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      })

      // Wait for window to show
      await new Promise((resolve) => setTimeout(resolve, 200))

      // Load URL directly into BrowserWindow
      await debugWindow.loadURL(url)

      // Open DevTools
      debugWindow.webContents.openDevTools({ mode: "right" })

      console.log("[BrowserExplorer] Debug window opened:", debugWindow.id)

      // Create a mock view object for compatibility with subsequent code
      // Actually we use debugWindow.webContents directly
      view = {
        webContents: debugWindow.webContents,
        setBounds: () => {},
      } as any

      cleanupView = () => {
        debugWindow.close()
      }
    }

    // Compile URL filter pattern
    const urlPattern = urlFilter ? new RegExp(urlFilter, "i") : null

    try {
      // Setup network monitoring
      if (captureResponse) {
        await this.setupDebuggerMonitoring(
          view,
          requests,
          responses,
          logs,
          maxRequests,
          urlPattern
        )
      } else {
        this.setupWebRequestMonitoring(view, requests, logs, urlPattern)
      }

      // Setup console log capture
      this.setupConsoleMonitoring(view, logs, errors)

      // Navigate to target page (only in headless mode, visible mode already loaded URL above)
      if (headless) {
        await view.webContents.loadURL(url)
        console.log("[BrowserExplorer] Page loaded")
      } else {
        console.log("[BrowserExplorer] Page already loaded in visible mode")
      }

      // Wait for page load to complete
      await this.waitForLoad(view, timeout)

      // Get basic page info
      const pageInfo = await this.getPageInfo(view)
      logs.push(`Page loaded: ${pageInfo.title}`)

      // Execute interaction actions
      if (scrollToBottom) {
        await this.scrollToBottom(view, logs)
      }

      for (const selector of clickSelectors) {
        await this.clickElement(view, selector, logs)
      }

      // Wait for network idle
      if (waitForNetworkIdle > 0) {
        await this.waitForNetworkIdle(view, waitForNetworkIdle, logs)
      }

      // Give some time for final requests to complete
      await new Promise((r) => setTimeout(r, 1000))

      console.log(
        `[BrowserExplorer] Captured ${requests.size} requests, ${responses.size} responses`
      )

      // Process response bodies: truncate large responses, ensure JSON serialization safety
      const processedResponses = Array.from(responses.values()).map((r) => {
        let body = r.body
        // Truncate oversized body (limit 50KB)
        if (body && body.length > 50000) {
          body = body.substring(0, 50000) + "... [truncated]"
        }
        // Remove control characters to ensure JSON safety
        if (body) {
          body = body.replace(/[\x00-\x08\x0b-\x0c\x0e-\x1f]/g, "")
        }
        return {
          ...r,
          body,
        }
      })

      return {
        url,
        title: pageInfo.title,
        description: pageInfo.description,
        requests: Array.from(requests.values()),
        responses: processedResponses,
        logs,
        errors,
      }
    } finally {
      // Cleanup
      cleanupView()
      console.log("[BrowserExplorer] Cleanup completed")
    }
  }

  /**
   * Setup network monitoring using Debugger Protocol (can capture response bodies)
   */
  private async setupDebuggerMonitoring(
    view: WebContentsView,
    requests: Map<string, NetworkRequest>,
    responses: Map<string, NetworkResponse>,
    logs: string[],
    maxRequests: number,
    urlPattern: RegExp | null
  ): Promise<void> {
    try {
      await view.webContents.debugger.attach("1.3")
      logs.push("[Debugger] Attached")

      const pendingRequests = new Set<string>()

      view.webContents.debugger.on("message", async (event, method, params) => {
        // Request started
        if (method === "Network.requestWillBeSent") {
          const { requestId, request, timestamp } = params

          if (this.shouldCaptureUrl(request.url, urlPattern)) {
            if (requests.size >= maxRequests) return

            const networkRequest: NetworkRequest = {
              id: requestId,
              url: request.url,
              method: request.method,
              headers: request.headers,
              postData: request.postData,
              timestamp: Math.floor(timestamp * 1000),
            }

            requests.set(requestId, networkRequest)
            pendingRequests.add(requestId)
            logs.push(`[Request] ${request.method} ${request.url}`)
          }
        }

        // Response received
        if (method === "Network.responseReceived") {
          const { requestId, response, timestamp } = params

          if (pendingRequests.has(requestId)) {
            try {
              // Get response body
              const result = await view.webContents.debugger.sendCommand(
                "Network.getResponseBody",
                { requestId }
              )

              const networkResponse: NetworkResponse = {
                requestId,
                url: response.url,
                statusCode: response.status,
                headers: response.headers,
                contentType: response.mimeType,
                body: result.base64Encoded
                  ? Buffer.from(result.body, "base64").toString()
                  : result.body,
                timestamp: Math.floor(timestamp * 1000),
              }

              responses.set(requestId, networkResponse)
              logs.push(`[Response] ${response.status} ${response.url}`)
            } catch (err: any) {
              // Some responses cannot be retrieved (e.g., data:// or blob://)
              logs.push(`[Response Error] ${err.message}`)
            }
            pendingRequests.delete(requestId)
          }
        }
      })

      await view.webContents.debugger.sendCommand("Network.enable")
      logs.push("[Debugger] Network monitoring enabled")
    } catch (err: any) {
      logs.push(`[Debugger Error] ${err.message}`)
      throw err
    }
  }

  /**
   * Setup network monitoring using WebRequest API (lightweight, cannot capture response bodies)
   */
  private setupWebRequestMonitoring(
    view: WebContentsView,
    requests: Map<string, NetworkRequest>,
    logs: string[],
    urlPattern: RegExp | null
  ): void {
    const session = view.webContents.session
    let requestCounter = 0

    session.webRequest.onBeforeRequest(
      { urls: ["*://*/*"] },
      (details, callback) => {
        if (this.shouldCaptureUrl(details.url, urlPattern)) {
          requestCounter++
          const request: NetworkRequest = {
            id: `req-${requestCounter}`,
            url: details.url,
            method: details.method,
            timestamp: Date.now(),
          }
          requests.set(request.id, request)
          logs.push(`[Request] ${details.method} ${details.url}`)
        }
        callback({})
      }
    )

    session.webRequest.onCompleted({ urls: ["*://*/*"] }, (details) => {
      logs.push(`[Response] ${details.statusCode} ${details.url}`)
    })
  }

  /**
   * Setup console log capture
   */
  private setupConsoleMonitoring(
    view: WebContentsView,
    logs: string[],
    errors: string[]
  ): void {
    view.webContents.on(
      "console-message",
      (event, level, message, line, sourceId) => {
        const prefix = `[Console ${level}]`
        if (level === 3) {
          // Error
          errors.push(`${prefix} ${message}`)
        } else {
          logs.push(`${prefix} ${message}`)
        }
      }
    )
  }

  /**
   * Check whether this URL should be captured
   */
  private shouldCaptureUrl(url: string, pattern: RegExp | null): boolean {
    // Exclude static resources
    if (
      /\.(js|css|png|jpg|jpeg|gif|svg|woff|woff2|ttf|ico|mp4|mp3|webm|webp)(\?|$|\?)/i.test(
        url
      )
    ) {
      return false
    }

    // Exclude common tracking and analytics domains
    const blockedDomains = [
      "google-analytics",
      "googletagmanager",
      "doubleclick",
      "facebook.com/tr",
      "analytics",
      "sentry.io",
      "segment.io",
      "mixpanel",
      "amplitude",
    ]
    if (blockedDomains.some((d) => url.toLowerCase().includes(d))) {
      return false
    }

    // Apply custom filter
    if (pattern) {
      return pattern.test(url)
    }

    return true
  }

  /**
   * Wait for page load to complete
   */
  private async waitForLoad(
    view: WebContentsView,
    timeout: number
  ): Promise<void> {
    // First check if page is already loaded
    const isLoading = view.webContents.isLoadingMainFrame()
    if (!isLoading && view.webContents.getURL() !== "") {
      console.log("[BrowserExplorer] Page already loaded")
      return
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Page load timeout after ${timeout}ms`))
      }, timeout)

      view.webContents.once("did-finish-load", () => {
        clearTimeout(timer)
        resolve()
      })

      view.webContents.once("did-fail-load", (_e, code, desc) => {
        clearTimeout(timer)
        reject(new Error(`Failed to load: ${desc} (${code})`))
      })
    })
  }

  /**
   * Get basic page information
   */
  private async getPageInfo(
    view: WebContentsView
  ): Promise<{ title?: string; description?: string }> {
    try {
      const info = await view.webContents.executeJavaScript(`
        (() => {
          const title = document.title
          const descMeta = document.querySelector('meta[name="description"]')
          const ogDesc = document.querySelector('meta[property="og:description"]')
          const description = descMeta?.content || ogDesc?.content
          return { title, description }
        })()
      `)
      return info
    } catch {
      return {}
    }
  }

  /**
   * Scroll to bottom of page
   */
  private async scrollToBottom(
    view: WebContentsView,
    logs: string[]
  ): Promise<void> {
    logs.push("[Action] Scrolling to bottom...")

    await view.webContents.executeJavaScript(`
      new Promise((resolve) => {
        let lastHeight = 0
        let unchangedCount = 0
        const maxScrolls = 20
        let scrollCount = 0
        
        const scroll = () => {
          if (scrollCount >= maxScrolls) {
            resolve()
            return
          }
          
          const currentHeight = document.body.scrollHeight
          window.scrollTo(0, currentHeight)
          scrollCount++
          
          if (currentHeight === lastHeight) {
            unchangedCount++
            if (unchangedCount >= 3) {
              resolve()
              return
            }
          } else {
            unchangedCount = 0
            lastHeight = currentHeight
          }
          
          setTimeout(scroll, 500)
        }
        
        scroll()
      })
    `)

    logs.push("[Action] Scroll completed")
  }

  /**
   * Click element
   */
  private async clickElement(
    view: WebContentsView,
    selector: string,
    logs: string[]
  ): Promise<void> {
    try {
      logs.push(`[Action] Clicking element: ${selector}`)
      await view.webContents.executeJavaScript(`
        document.querySelector(${JSON.stringify(selector)})?.click()
      `)
      await new Promise((r) => setTimeout(r, 1000))
    } catch (err: any) {
      logs.push(`[Action Error] Failed to click ${selector}: ${err.message}`)
    }
  }

  /**
   * Wait for network idle
   */
  private async waitForNetworkIdle(
    view: WebContentsView,
    idleTime: number,
    logs: string[]
  ): Promise<void> {
    logs.push(`[Action] Waiting for network idle (${idleTime}ms)...`)
    await new Promise((r) => setTimeout(r, idleTime))
    logs.push("[Action] Network idle wait completed")
  }
}
