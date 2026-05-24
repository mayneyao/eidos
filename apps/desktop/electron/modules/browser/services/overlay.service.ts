import { WebContentsView, app, protocol } from "electron"
import * as path from "path"

import { Inject } from "../../../common/di"
import { LoggerService } from "../../logger/logger.service"
import { WindowService } from "../../window/window.service"
import { ViewManagerService } from "./view-manager.service"
import { ZoomService } from "./zoom.service"
import type { BrowserViewBounds } from "../types"

// Import HTML template as raw string via Vite
import findOverlayTemplate from "./overlay/find-overlay.html?raw"

interface OverlayState {
  view: WebContentsView
  parentViewId: string
}

interface FindOverlayData {
  viewId: string
  findText: string
  findMatches: number
  findActiveMatch: number
}

/**
 * Overlay Service - Manages overlay WebContentsViews for find UI and other overlays
 *
 * Uses eidos-find:// protocol for dynamic HTML generation with theme support
 */
export class OverlayService {
  private overlays = new Map<string, OverlayState>()
  private findOverlayData = new Map<string, FindOverlayData>()
  private static readonly FIND_PROTOCOL = "eidos-find"
  private static readonly FIND_PROTOCOL_PREFIX = "eidos-find://"

  constructor(
    @Inject(WindowService) private windowService: WindowService,
    @Inject(ViewManagerService) private viewManager: ViewManagerService,
    @Inject(ZoomService) private zoomService: ZoomService,
    @Inject(LoggerService) private logger: LoggerService
  ) {
    this.logger = this.logger.child("OverlayService")
    this.registerProtocol()
  }

  private get win() {
    return this.windowService?.getMainWindow() ?? null
  }

  /**
   * Register the eidos-find:// protocol for dynamic find overlay HTML
   */
  private registerProtocol(): void {
    if (app.isReady()) {
      this.setupProtocol()
    } else {
      app.once("ready", () => this.setupProtocol())
    }
  }

  private setupProtocol(): void {
    try {
      const isHandled = protocol.isProtocolHandled(OverlayService.FIND_PROTOCOL)
      if (isHandled) return
    } catch (e) {
      // Protocol not registered yet
    }

    try {
      protocol.registerStringProtocol(
        OverlayService.FIND_PROTOCOL,
        (request, callback) => {
          const url = request.url
          const viewId = this.extractViewId(url)
          const data = this.findOverlayData.get(viewId)

          if (data) {
            callback({
              mimeType: "text/html",
              data: this.buildFindOverlayHtml(data),
            })
          } else {
            callback({
              mimeType: "text/html",
              data: this.buildErrorHtml(viewId),
            })
          }
        }
      )
      // Protocol registered
    } catch (error) {
      this.logger.error("Failed to register eidos-find:// protocol:", error)
    }
  }

  private extractViewId(url: string): string {
    // Parse as URL to get hostname (viewId is in hostname for eidos-find://viewId)
    try {
      const parsed = new URL(url)
      return decodeURIComponent(parsed.hostname)
    } catch (e) {
      // Fallback to string manipulation
      const prefix = OverlayService.FIND_PROTOCOL_PREFIX
      let viewId = url
        .replace(prefix, "")
        .replace(/^\//, "")
        .replace(/\/$/, "")
        .split("?")[0]
      try {
        viewId = decodeURIComponent(viewId)
      } catch {}
      return viewId
    }
  }

  /**
   * Show find overlay for a view
   */
  showFindOverlay(
    viewId: string,
    options: {
      findText?: string
      findMatches?: number
      findActiveMatch?: number
    } = {}
  ): void {
    const win = this.win
    if (!win) return

    const overlayId = `find:${viewId}`

    // Close existing overlay
    this.closeOverlay(overlayId)

    // Get parent view bounds
    const isMainWindow = viewId === "__main__"
    let bounds: { x: number; y: number; width: number; height: number }

    if (isMainWindow) {
      const contentBounds = win.getContentBounds()
      bounds = {
        x: 0,
        y: 0,
        width: contentBounds.width,
        height: contentBounds.height,
      }
    } else {
      const parentView = this.viewManager.getView(viewId)
      if (!parentView) return
      bounds = parentView.getBounds()
    }

    // Store data for protocol handler
    const data: FindOverlayData = {
      viewId,
      findText: options.findText || "",
      findMatches: options.findMatches || 0,
      findActiveMatch: options.findActiveMatch || 0,
    }
    this.findOverlayData.set(viewId, data)

    // Create overlay view with transparent background
    const preloadPath = path.join(__dirname, "./preload.mjs")
    const overlayView = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        preload: preloadPath,
        transparent: true,
      },
    })
    overlayView.setBackgroundColor("#00000000")

    // Position at top-right of parent view
    const zoomFactor = this.zoomService.getZoomFactor()
    const overlayWidth = 320
    const overlayHeight = 60

    overlayView.setBounds({
      x: Math.round((bounds.x + bounds.width - overlayWidth - 8) * zoomFactor),
      y: Math.round((bounds.y + 8) * zoomFactor),
      width: Math.round(overlayWidth * zoomFactor),
      height: Math.round(overlayHeight * zoomFactor),
    })

    // Load via custom protocol
    const encodedViewId = encodeURIComponent(viewId)
    const findUrl = `${OverlayService.FIND_PROTOCOL_PREFIX}${encodedViewId}`

    // Add overlay to window first
    win.contentView.addChildView(overlayView)
    overlayView.setVisible(true)

    // Load and focus
    overlayView.webContents
      .loadURL(findUrl)
      .then(() => {
        // Focus overlay
        setTimeout(() => {
          overlayView.webContents.focus()
        }, 50)
      })
      .catch((err) => {
        this.logger.error("Failed to load find overlay:", err)
      })

    // Uncomment to open DevTools for debugging
    // overlayView.webContents.openDevTools({ mode: "detach" })

    this.overlays.set(overlayId, {
      view: overlayView,
      parentViewId: viewId,
    })

    // Overlay created
  }

  /**
   * Update find overlay data
   */
  updateFindOverlay(viewId: string, data: Partial<FindOverlayData>): void {
    const overlayId = `find:${viewId}`
    const state = this.overlays.get(overlayId)
    if (!state) return

    // Update stored data
    const existingData = this.findOverlayData.get(viewId)
    if (existingData) {
      Object.assign(existingData, data)
    }

    // Send update to overlay
    state.view.webContents.send("browser.find:update", data)
  }

  /**
   * Close find overlay for a view
   */
  closeFindOverlay(viewId: string): void {
    const overlayId = `find:${viewId}`
    this.findOverlayData.delete(viewId)
    this.closeOverlay(overlayId)
  }

  /**
   * Close a specific overlay
   */
  private closeOverlay(overlayId: string): void {
    const win = this.win
    if (!win) return

    const state = this.overlays.get(overlayId)
    if (!state) return

    win.contentView.removeChildView(state.view)
    state.view.webContents.close()
    this.overlays.delete(overlayId)
  }

  /**
   * Update overlay position when parent view moves/resizes
   */
  updateOverlayPosition(viewId: string, bounds: BrowserViewBounds): void {
    const overlayId = `find:${viewId}`
    const state = this.overlays.get(overlayId)
    if (!state) {
      // No overlay found
      return
    }

    const zoomFactor = this.zoomService.getZoomFactor()
    const overlayWidth = 320
    const overlayHeight = 60

    const newBounds = {
      x: Math.round((bounds.x + bounds.width - overlayWidth - 8) * zoomFactor),
      y: Math.round((bounds.y + 8) * zoomFactor),
      width: Math.round(overlayWidth * zoomFactor),
      height: Math.round(overlayHeight * zoomFactor),
    }

    state.view.setBounds(newBounds)
  }

  /**
   * Update main window find overlay position (called on resize)
   */
  updateMainWindowFindOverlayPosition(): void {
    const overlayId = `find:__main__`
    const state = this.overlays.get(overlayId)
    if (!state) return

    const win = this.win
    if (!win) return

    const contentBounds = win.getContentBounds()
    const zoomFactor = this.zoomService.getZoomFactor()
    const overlayWidth = 320
    const overlayHeight = 60

    const newBounds = {
      x: Math.round((contentBounds.width - overlayWidth - 8) * zoomFactor),
      y: Math.round(8 * zoomFactor),
      width: Math.round(overlayWidth * zoomFactor),
      height: Math.round(overlayHeight * zoomFactor),
    }

    state.view.setBounds(newBounds)
  }

  /**
   * Check if find overlay is open for a view
   */
  isFindOverlayOpen(viewId: string): boolean {
    return this.overlays.has(`find:${viewId}`)
  }

  /**
   * Close all overlays
   */
  closeAll(): void {
    const win = this.win
    if (!win) return

    for (const [overlayId, state] of this.overlays) {
      win.contentView.removeChildView(state.view)
      state.view.webContents.close()
    }
    this.overlays.clear()
    this.findOverlayData.clear()
  }

  /**
   * Build Find Overlay HTML with theme support using template
   */
  private buildFindOverlayHtml(data: FindOverlayData): string {
    // Simple template variables
    const vars: Record<string, string> = {
      findText: data.findText || "",
      matchCountText:
        data.findMatches > 0
          ? `${data.findActiveMatch}/${data.findMatches}`
          : "",
      prevDisabled: data.findMatches === 0 ? "disabled" : "",
      nextDisabled: data.findMatches === 0 ? "disabled" : "",
    }

    // Replace all {{variable}} placeholders in template
    return findOverlayTemplate.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return vars[key] ?? match
    })
  }

  private buildErrorHtml(viewId: string): string {
    return `<!DOCTYPE html>
<html>
<head><title>Find Overlay Error</title></head>
<body style="font-family: sans-serif; padding: 20px;">
  <h3>Find Overlay Error</h3>
  <p>No data found for view: ${viewId}</p>
</body>
</html>`
  }
}
