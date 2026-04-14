import { protocol, app, WebContentsView } from "electron"
import { IpcMethod } from "@eidos.space/electron-ipc"
import { parseHTML } from "linkedom"
import { Defuddle } from "defuddle/node"

import { IpcInjectable, getService } from "../../../common/di"
import type { ReaderViewData } from "../types"
import { ViewManagerService } from "./view-manager.service"

/**
 * Reader View Service - Manages Reader View mode via eidos-read:// protocol
 */
@IpcInjectable("browser.readerview")
export class ReaderViewService {
  private readerViewData = new Map<string, ReaderViewData>()
  private static readonly READER_PROTOCOL = "eidos-read"
  private static readonly READER_PROTOCOL_PREFIX = "eidos-read://"

  constructor() {
    // Register protocol handler after app is ready
    if (app.isReady()) {
      this.registerProtocol()
    } else {
      app.once("ready", () => {
        console.log("[ReaderViewService] App ready, registering protocol...")
        this.registerProtocol()
      })
    }
  }

  /**
   * Get ViewManagerService lazily to avoid circular dependency
   */
  private get viewManager(): ViewManagerService | undefined {
    try {
      return getService(ViewManagerService)
    } catch {
      return undefined
    }
  }

  /**
   * Get view by ID (helper to handle undefined viewManager)
   */
  private getView(viewId: string): WebContentsView | undefined {
    return this.viewManager?.getView(viewId)
  }

  /**
   * Register the eidos-read:// protocol
   */
  private registerProtocol(): void {
    try {
      const isHandled = protocol.isProtocolHandled(
        ReaderViewService.READER_PROTOCOL
      )
      if (isHandled) {
        console.log("[ReaderViewService] Protocol already registered")
        return
      }
    } catch (e) {
      console.log("[ReaderViewService] Protocol check error:", e)
    }

    try {
      protocol.registerStringProtocol(
        ReaderViewService.READER_PROTOCOL,
        (request, callback) => {
          const url = request.url

          // Extract viewId from eidos-read://viewId
          const prefix = ReaderViewService.READER_PROTOCOL_PREFIX
          let viewId = url
            .replace(prefix, "")
            .replace(/^\//, "")
            .replace(/\/$/, "")

          // Try to decode if URL-encoded
          try {
            viewId = decodeURIComponent(viewId)
          } catch (e) {
            // Not encoded, use as-is
          }

          // URL hostnames are case-insensitive, use case-insensitive lookup
          const lowerViewId = viewId.toLowerCase()
          const matchedKey = Array.from(this.readerViewData.keys()).find(
            (key) => key.toLowerCase() === lowerViewId
          )

          console.log("[ReaderViewService] Protocol request:", {
            url,
            viewId,
            matchedKey,
          })

          const data = matchedKey
            ? this.readerViewData.get(matchedKey)
            : undefined

          if (data) {
            callback({
              mimeType: "text/html",
              data: this.buildHtml(data),
            })
          } else {
            callback({
              mimeType: "text/html",
              data: this.buildErrorHtml(viewId),
            })
          }
        }
      )
      console.log("[ReaderViewService] Protocol registered successfully")
    } catch (error) {
      console.error("[ReaderViewService] Failed to register protocol:", error)
    }
  }

  /**
   * Open Reader View for a view
   */
  @IpcMethod()
  async openReaderView(
    viewId: string,
    data: {
      html: string
      title: string
      originalUrl: string
      markdown?: string
    }
  ): Promise<{ success: boolean; error?: string }> {
    const view = this.getView(viewId)
    if (!view) {
      return { success: false, error: "View not found" }
    }

    try {
      this.readerViewData.set(viewId, data)

      const encodedViewId = encodeURIComponent(viewId)
      const readerUrl = `${ReaderViewService.READER_PROTOCOL_PREFIX}${encodedViewId}`

      console.log("[ReaderViewService] Opening reader view:", {
        viewId,
        readerUrl,
      })

      await view.webContents.loadURL(readerUrl)
      return { success: true }
    } catch (error) {
      console.error("[ReaderViewService] Failed to open:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Exit Reader View and return to original URL
   */
  @IpcMethod()
  async exitReaderView(viewId: string, originalUrl: string): Promise<void> {
    const view = this.getView(viewId)
    if (!view) return

    // Validate original URL
    if (
      !originalUrl ||
      (!originalUrl.startsWith("http://") &&
        !originalUrl.startsWith("https://"))
    ) {
      console.warn("[ReaderViewService] Invalid original URL:", originalUrl)
      if (view.webContents.navigationHistory.canGoBack()) {
        view.webContents.navigationHistory.goBack()
      }
      return
    }

    await view.webContents.loadURL(originalUrl)
  }

  /**
   * Get Reader View data for a view
   */
  @IpcMethod()
  getReaderViewData(viewId: string): ReaderViewData | undefined {
    return this.readerViewData.get(viewId)
  }

  /**
   * Check if Reader View is active for a view
   */
  @IpcMethod()
  isReaderViewActive(viewId: string): boolean {
    const view = this.getView(viewId)
    if (!view) return false

    const url = view.webContents.getURL()
    return url.startsWith(ReaderViewService.READER_PROTOCOL_PREFIX)
  }

  /**
   * Capture page content as Reader View using Defuddle (backend implementation)
   *
   * Fetches the rendered HTML from the BrowserView and runs defuddle/node
   * in the main process instead of injecting a CDN script into the page.
   */
  @IpcMethod()
  async captureAsReaderView(viewId: string): Promise<{
    success: boolean
    content?: string
    contentMarkdown?: string
    error?: string
    title?: string
    url?: string
  }> {
    const view = this.getView(viewId)
    if (!view) {
      return { success: false, error: "View not found" }
    }

    try {
      const url = view.webContents.getURL()
      const html = await view.webContents.executeJavaScript(`
        (function() {
          return document.documentElement.outerHTML;
        })()
      `)

      const { document } = parseHTML(html)
      const result = await Defuddle(document, url, {
        separateMarkdown: true,
      })

      return {
        success: true,
        content: result.content,
        contentMarkdown: result.contentMarkdown,
        title: result.title,
        url,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  /**
   * Build Reader View HTML with styles
   */
  private buildHtml(data: ReaderViewData): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${data.title || "Reader View"}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #fff;
    }
    @media (prefers-color-scheme: dark) {
      body { color: #e0e0e0; background: #1a1a1a; }
    }
    h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; line-height: 1.3; }
    p { margin-bottom: 1em; }
    img { max-width: 100%; height: auto; }
    pre { background: #f5f5f5; padding: 15px; border-radius: 5px; overflow-x: auto; }
    @media (prefers-color-scheme: dark) { pre { background: #2a2a2a; } }
    code { font-family: "SF Mono", Monaco, monospace; font-size: 0.9em; }
    blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding-left: 1em; color: #666; }
    @media (prefers-color-scheme: dark) { blockquote { border-left-color: #444; color: #999; } }
    a { color: #0066cc; }
    @media (prefers-color-scheme: dark) { a { color: #66b3ff; } }
    table { width: 100%; border-collapse: collapse; margin: 1em 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    @media (prefers-color-scheme: dark) { th, td { border-color: #444; } }
    th { background: #f5f5f5; }
    @media (prefers-color-scheme: dark) { th { background: #2a2a2a; } }
  </style>
</head>
<body>
  ${data.html}
</body>
</html>`
  }

  /**
   * Build error HTML
   */
  private buildErrorHtml(viewId: string): string {
    return `<!DOCTYPE html>
<html>
<head><title>Reader View Not Available</title></head>
<body>
  <h1>Reader View Not Available</h1>
  <p>The content for this reader view is no longer available.</p>
  <p>View ID: ${viewId}</p>
</body>
</html>`
  }
}
