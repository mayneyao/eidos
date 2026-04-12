import { WebContentsView } from "electron"

import { Inject } from "../../../common/di"
import { WindowService } from "../../window/window.service"
import type { BrowserViewBounds, ViewState } from "../types"
import { ZoomService } from "./zoom.service"

/**
 * View Manager Service - Manages BrowserView lifecycle (create, update, close)
 *
 * Note: This is an internal service, not exposed via IPC.
 * Use BrowserService for IPC access.
 */
export class ViewManagerService {
  private views = new Map<string, ViewState>()

  constructor(
    @Inject(WindowService) private windowService: WindowService,
    @Inject(ZoomService) private zoomService: ZoomService
  ) {}

  private get win() {
    return this.windowService?.getMainWindow() ?? null
  }

  /**
   * Open a new BrowserView
   */
  open(viewId: string, url: string, bounds: BrowserViewBounds): void {
    const win = this.win
    if (!win) return

    if (this.views.has(viewId)) {
      this.updateBounds(viewId, bounds)
      return
    }

    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })

    view.webContents.loadURL(url)

    // Set initial bounds with zoom factor
    const zoomFactor = this.zoomService.getZoomFactor()
    view.setBounds({
      x: Math.round(bounds.x * zoomFactor),
      y: Math.round(bounds.y * zoomFactor),
      width: Math.round(bounds.width * zoomFactor),
      height: Math.round(bounds.height * zoomFactor),
    })

    win.contentView.addChildView(view)
    view.setVisible(false) // Start hidden, frontend controls visibility

    // Sync zoom level
    const currentZoomLevel = this.zoomService.getCurrentZoomLevel()
    view.webContents.setZoomLevel(currentZoomLevel)

    // Register for zoom sync
    this.zoomService.registerView(viewId, view)

    this.views.set(viewId, { view, isFullscreen: false })
  }

  /**
   * Update view bounds
   */
  updateBounds(viewId: string, bounds: BrowserViewBounds): void {
    const state = this.views.get(viewId)
    const win = this.win
    if (!state || !win) return

    // Ignore bounds updates while in fullscreen
    if (state.isFullscreen) return

    const zoomFactor = this.zoomService.getZoomFactor()
    state.view.setBounds({
      x: Math.round(bounds.x * zoomFactor),
      y: Math.round(bounds.y * zoomFactor),
      width: Math.round(bounds.width * zoomFactor),
      height: Math.round(bounds.height * zoomFactor),
    })
  }

  /**
   * Set view visibility
   */
  setVisible(viewId: string, visible: boolean): void {
    const state = this.views.get(viewId)
    if (state) {
      state.view.setVisible(visible)
    }
  }

  /**
   * Check if view exists
   */
  hasView(viewId: string): boolean {
    return this.views.has(viewId)
  }

  /**
   * Get a view by ID
   */
  getView(viewId: string): WebContentsView | undefined {
    return this.views.get(viewId)?.view
  }

  /**
   * Close a specific view
   */
  close(viewId: string): void {
    const win = this.win
    if (!win) return

    const state = this.views.get(viewId)
    if (state) {
      win.contentView.removeChildView(state.view)
      state.view.webContents.close()
      this.views.delete(viewId)
      this.zoomService.unregisterView(viewId)
    }
  }

  /**
   * Close all views
   */
  closeAll(): void {
    const win = this.win
    if (!win) return

    for (const [viewId, state] of this.views) {
      win.contentView.removeChildView(state.view)
      state.view.webContents.close()
      this.zoomService.unregisterView(viewId)
    }
    this.views.clear()
  }

  /**
   * Get view count
   */
  getViewCount(): number {
    return this.views.size
  }

  /**
   * Get all views info
   */
  getAllViews(): Array<{
    viewId: string
    url: string
    title: string
    isLoading: boolean
    canGoBack: boolean
    canGoForward: boolean
  }> {
    const result = []
    for (const [viewId, state] of this.views) {
      const wc = state.view.webContents
      result.push({
        viewId,
        url: wc.getURL(),
        title: wc.getTitle(),
        isLoading: wc.isLoading(),
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
      })
    }
    return result
  }

  /**
   * Set fullscreen state for a view
   */
  setFullscreen(viewId: string, isFullscreen: boolean): void {
    const state = this.views.get(viewId)
    if (state) {
      state.isFullscreen = isFullscreen
    }
  }

  /**
   * Check if view is in fullscreen
   */
  isFullscreen(viewId: string): boolean {
    return this.views.get(viewId)?.isFullscreen ?? false
  }
}
