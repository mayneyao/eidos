import { WebContentsView, Menu, MenuItem, dialog, clipboard } from "electron"

import { Inject, getService } from "../../../common/di"
import { WindowService } from "../../window/window.service"
import type { BrowserViewBounds, ViewState } from "../types"
import { ZoomService } from "./zoom.service"
import { ReaderViewService } from "./reader-view.service"
import { RawDataService } from "../../rawdata/rawdata.service"
import { ConfigManager } from "../../config/config.module"

// Extended view state with space info
interface ExtendedViewState extends ViewState {
  space?: string
  visible: boolean
  wasVisibleBeforeFullscreen?: boolean
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
    @Inject(ZoomService) private zoomService: ZoomService,
    @Inject(ConfigManager) private configManager: ConfigManager
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

      // ── Navigation ──
      menu.append(
        new MenuItem({
          label: "Back",
          enabled: view.webContents.navigationHistory.canGoBack(),
          click: () => view.webContents.navigationHistory.goBack(),
        })
      )
      menu.append(
        new MenuItem({
          label: "Forward",
          enabled: view.webContents.navigationHistory.canGoForward(),
          click: () => view.webContents.navigationHistory.goForward(),
        })
      )
      menu.append(
        new MenuItem({
          label: "Copy URL",
          click: () => {
            clipboard.writeText(view.webContents.getURL())
          },
        })
      )
      menu.append(
        new MenuItem({
          label: "Reload",
          click: () => view.webContents.reload(),
        })
      )
      menu.append(new MenuItem({ type: "separator" }))

      // ── Image ──
      if (params.mediaType === "image" && params.srcURL) {
        menu.append(
          new MenuItem({
            label: "Copy Image",
            click: () => {
              view.webContents.copyImageAt(params.x, params.y)
            },
          })
        )
        menu.append(
          new MenuItem({
            label: "Copy Image URL",
            click: () => {
              clipboard.writeText(params.srcURL)
            },
          })
        )
        menu.append(new MenuItem({ type: "separator" }))
      }

      // Add Read Mode / Exit Read Mode option - handled entirely in backend
      menu.append(
        new MenuItem({
          label: isReaderView ? "Exit Read Mode" : "Read Mode",
          click: async () => {
            await this.handleReadMode(viewId)
          },
        })
      )

      if (isReaderView && readerViewService) {
        const readerData = readerViewService.getReaderViewData(viewId)
        if (readerData?.markdown) {
          menu.append(
            new MenuItem({
              label: "Copy as Markdown",
              click: () => {
                clipboard.writeText(readerData.markdown!)
              },
            })
          )
        }
      }

      // Add Adapter submenu - only in normal mode, handled entirely in backend
      const browserConfig = this.configManager.get("browser")
      console.log("[BrowserContextMenu] Checking adapter menu:", {
        isReaderView,
        hasSpace: !!space,
        hasRawDataService: !!this.rawDataService,
        enableRawData: browserConfig?.enableRawData,
      })
      if (
        browserConfig?.enableRawData &&
        !isReaderView &&
        space &&
        this.rawDataService
      ) {
        const currentUrl = view.webContents.getURL()
        console.log(
          "[BrowserContextMenu] Finding adapters for:",
          space,
          currentUrl
        )
        const adapters = await this.rawDataService.findListAdapters(
          space,
          currentUrl
        )
        console.log("[BrowserContextMenu] Found adapters:", adapters.length)

        if (adapters.length > 0) {
          menu.append(
            new MenuItem({
              label: "Raw Data",
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

      menu.append(new MenuItem({ type: "separator" }))

      // Add Inspect option (Developer Tools) - handled entirely in backend
      menu.append(
        new MenuItem({
          label: "Inspect",
          click: () => {
            view.webContents.openDevTools({ mode: "detach" })
          },
        })
      )

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

    this.views.set(viewId, { view, isFullscreen: false, visible: false })
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
      state.visible = visible
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
   * Set fullscreen state for a view.
   * When entering fullscreen, hides all other views and records their visibility.
   * When leaving fullscreen, restores the previous visibility of other views.
   */
  setFullscreen(viewId: string, isFullscreen: boolean): void {
    const state = this.views.get(viewId)
    if (!state) return

    if (isFullscreen) {
      for (const [otherViewId, otherState] of this.views) {
        if (otherViewId !== viewId) {
          otherState.wasVisibleBeforeFullscreen = otherState.visible
          otherState.view.setVisible(false)
          otherState.visible = false
        }
      }
    } else {
      for (const [otherViewId, otherState] of this.views) {
        if (otherViewId !== viewId) {
          if (otherState.wasVisibleBeforeFullscreen) {
            otherState.view.setVisible(true)
            otherState.visible = true
          }
          otherState.wasVisibleBeforeFullscreen = undefined
        }
      }
    }

    state.isFullscreen = isFullscreen
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
      const win = this.win
      win?.webContents.send("browser.readerview:loading", viewId, true)
      try {
        const result = await readerViewService.captureAsReaderView(viewId)
        if (result.success && result.content) {
          await readerViewService.openReaderView(viewId, {
            html: result.content,
            title: result.title || "Reader View",
            originalUrl: result.url || view.webContents.getURL(),
            markdown: result.contentMarkdown,
          })
        } else {
          dialog.showErrorBox(
            "Read Mode Failed",
            result.error || "Could not extract content"
          )
        }
      } finally {
        win?.webContents.send("browser.readerview:loading", viewId, false)
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
    const view = this.views.get(viewId)?.view
    const win = this.win
    if (!view || !win) return

    // Notify frontend to switch to rawdata table view.
    // Adapter execution is handled by the frontend (auto-run when no data, or manual refresh).
    win.webContents.send("browser.view:update", viewId, {
      type: "rawdata-navigation",
      url: view.webContents.getURL(),
      adapterPath,
    })
  }
}
