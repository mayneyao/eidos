import { WebContentsView, Menu, MenuItem, dialog } from "electron"

import { Inject, getService } from "../../../common/di"
import { WindowService } from "../../window/window.service"
import type { BrowserViewBounds, ViewState } from "../types"
import { ZoomService } from "./zoom.service"
import { ReaderViewService } from "./reader-view.service"
import { RawDataService } from "../../rawdata/rawdata.service"

// Extended view state with space info
interface ExtendedViewState extends ViewState {
  space?: string
}

/**
 * View Manager Service - Manages BrowserView lifecycle (create, update, close)
 *
 * Note: This is an internal service, not exposed via IPC.
 * Use BrowserService for IPC access.
 */
export class ViewManagerService {
  private views = new Map<string, ExtendedViewState>()

  constructor(
    @Inject(WindowService) private windowService: WindowService,
    @Inject(ZoomService) private zoomService: ZoomService
  ) {}

  /**
   * Get ReaderViewService lazily to avoid circular dependency
   */
  private get readerViewService(): ReaderViewService | undefined {
    try {
      return getService(ReaderViewService)
    } catch {
      return undefined
    }
  }

  /**
   * Get RawDataService lazily to avoid circular dependency
   */
  private get rawDataService(): RawDataService | undefined {
    try {
      return getService(RawDataService)
    } catch {
      return undefined
    }
  }

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
      const view = this.views.get(viewId)?.view
      if (view) {
        // Update bounds and reload URL if changed
        this.updateBounds(viewId, bounds)
        const currentUrl = view.webContents.getURL()
        if (currentUrl !== url) {
          view.webContents.loadURL(url)
        }
      }
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

    // Listen for focus events to activate the corresponding tab
    view.webContents.on("focus", () => {
      const win = this.win
      if (win) {
        win.webContents.send("browser.view:focus", viewId)
      }
    })

    // Handle context menu for webview
    view.webContents.on("context-menu", async (event, params) => {
      const win = this.win
      if (!win) return

      const menu = new Menu()
      const state = this.views.get(viewId)
      const space = state?.space

      // Check if currently in reader view
      const readerViewService = this.readerViewService
      const isReaderView =
        readerViewService?.isReaderViewActive(viewId) ?? false

      // Add Inspect option (Developer Tools) - handled entirely in backend
      menu.append(
        new MenuItem({
          label: "Inspect",
          click: () => {
            view.webContents.openDevTools({ mode: "detach" })
          },
        })
      )

      // Add Read Mode / Exit Read Mode option - handled entirely in backend
      menu.append(
        new MenuItem({
          label: isReaderView ? "Exit Read Mode" : "Read Mode",
          click: async () => {
            await this.handleReadMode(viewId)
          },
        })
      )

      // Add Adapter submenu - only in normal mode, handled entirely in backend
      if (!isReaderView && space && this.rawDataService) {
        const currentUrl = view.webContents.getURL()
        const adapters = await this.rawDataService.findListAdapters(
          space,
          currentUrl
        )

        if (adapters.length > 0) {
          menu.append(
            new MenuItem({
              label: "Adapter",
              submenu: adapters.map((adapter) => ({
                label: adapter.name,
                click: async () => {
                  await this.handleAdapter(viewId, space, adapter.filePath)
                },
              })),
            })
          )
        }
      }

      // Convert BrowserView coordinates to window coordinates
      const viewBounds = view.getBounds()
      menu.popup({
        window: win,
        x: viewBounds.x + params.x,
        y: viewBounds.y + params.y,
      })
    })

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
   * Set find in page mode - adjusts view bounds to make room for find UI
   * @param viewId - The view ID
   * @param findUiHeight - Height of the find UI in pixels (default: 40)
   */
  setFindMode(viewId: string, findUiHeight: number = 40): void {
    const state = this.views.get(viewId)
    const win = this.win
    if (!state || !win) return

    // Store original bounds if not already stored
    if (!state.originalBounds) {
      state.originalBounds = state.view.getBounds()
    }

    // Adjust bounds to make room for find UI at the top
    const zoomFactor = this.zoomService.getZoomFactor()
    const bounds = state.originalBounds
    state.view.setBounds({
      x: bounds.x,
      y: Math.round((bounds.y + findUiHeight) * zoomFactor),
      width: Math.round(bounds.width * zoomFactor),
      height: Math.round((bounds.height - findUiHeight) * zoomFactor),
    })
  }

  /**
   * Exit find in page mode - restore original view bounds
   */
  exitFindMode(viewId: string): void {
    const state = this.views.get(viewId)
    if (!state || !state.originalBounds) return

    const zoomFactor = this.zoomService.getZoomFactor()
    state.view.setBounds({
      x: state.originalBounds.x,
      y: Math.round(state.originalBounds.y * zoomFactor),
      width: Math.round(state.originalBounds.width * zoomFactor),
      height: Math.round(state.originalBounds.height * zoomFactor),
    })
    state.originalBounds = undefined
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

  /**
   * Set the space for a view (called by frontend when tab is created/updated)
   */
  setViewSpace(viewId: string, space: string): void {
    const state = this.views.get(viewId)
    if (state) {
      state.space = space
    }
  }

  /**
   * Handle Read Mode toggle - backend only
   */
  private async handleReadMode(viewId: string): Promise<void> {
    const view = this.views.get(viewId)?.view
    if (!view) return

    const readerViewService = this.readerViewService
    if (!readerViewService) {
      dialog.showErrorBox(
        "Read Mode Error",
        "Reader View service not available"
      )
      return
    }

    // Check if already in reader view
    const isReaderView = readerViewService.isReaderViewActive(viewId)
    if (isReaderView) {
      // Get current URL and exit reader view
      const currentUrl = view.webContents.getURL()
      await readerViewService.exitReaderView(viewId, currentUrl)
    } else {
      const result = await readerViewService.captureAsReaderView(viewId)
      if (result.success && result.content) {
        await readerViewService.openReaderView(viewId, {
          html: result.content,
          title: result.title || "Reader View",
          originalUrl: result.url || view.webContents.getURL(),
        })
      } else {
        dialog.showErrorBox(
          "Read Mode Failed",
          result.error || "Could not extract content"
        )
      }
    }
  }

  /**
   * Handle Adapter run - backend only
   */
  private async handleAdapter(
    viewId: string,
    space: string,
    adapterPath: string
  ): Promise<void> {
    if (!this.rawDataService) {
      dialog.showErrorBox("Adapter Error", "RawData service not available")
      return
    }

    try {
      const result = await this.rawDataService.runAdapter(
        space,
        adapterPath,
        {}
      )

      // Show success notification
      dialog.showMessageBox(this.win!, {
        type: "info",
        title: "Adapter Sync Complete",
        message: `${result.adapter.name} synced successfully`,
        detail: `Persisted ${result.persisted.agents} agents, ${result.persisted.goods} goods, ${result.persisted.relations} relations`,
        buttons: ["OK"],
      })
    } catch (error) {
      dialog.showErrorBox(
        "Adapter Sync Failed",
        error instanceof Error ? error.message : String(error)
      )
    }
  }
}
