import { shell, WebContentsView } from "electron"
import type { BrowserWindow } from "electron"
import { IpcServiceBase, IpcMethod } from "@eidos.space/electron-ipc"

import {
  IpcInjectable,
  Inject,
  forwardRef,
  InjectForwardRef,
} from "../../common/di"
import type { WindowService } from "./window.service"

export interface BrowserViewBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Browser View Service - Manages WebContentsView instances
 *
 * Responsibilities:
 * - Create and manage BrowserView instances
 * - Handle navigation (back, forward, reload)
 * - Manage view bounds and visibility
 * - Capture page screenshots
 */
@IpcInjectable("browser.view")
export class BrowserViewService extends IpcServiceBase {
  private views = new Map<string, WebContentsView>()
  private fullscreenViews = new Set<string>()
  private windowService: WindowService | null = null

  constructor() {
    super()
  }

  setWindowService(windowService: WindowService): void {
    this.windowService = windowService
  }

  /**
   * Get the main window from window service
   */
  private get win(): BrowserWindow | null {
    return this.windowService?.getMainWindow() ?? null
  }

  @IpcMethod()
  open(viewId: string, url: string, bounds: BrowserViewBounds) {
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
    view.setBounds(bounds)
    win.contentView.addChildView(view)

    view.webContents.setWindowOpenHandler(
      ({ url, frameName, features, disposition }) => {
        console.log("[BrowserViewService] Window open handler triggered:", url)
        const protocol = new URL(url).protocol
        if (protocol === "https:" || protocol === "http:") {
          // Send to renderer to open in new tab instead of external browser
          const win = this.win
          if (win) {
            win.webContents.send("browser.view:newTab", {
              url,
              frameName,
              features,
            })
            console.log("[BrowserViewService] Sent newTab event:", url)
          } else {
            console.warn(
              "[BrowserViewService] No window available to send newTab event"
            )
          }
        }
        return { action: "deny" }
      }
    )

    this._attachEventListeners(viewId, view)
    this.views.set(viewId, view)
  }

  private _attachEventListeners(viewId: string, view: WebContentsView) {
    const win = this.win
    if (!win) return

    const wc = view.webContents
    const send = (data: any) => {
      win.webContents.send("browser.view:update", viewId, data)
    }

    // Record history on navigation
    wc.on("did-navigate", (_, url) => {
      send({
        type: "navigate",
        url,
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
      })
    })

    wc.on("did-navigate-in-page", (_, url) => {
      send({
        type: "navigate",
        url,
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
      })
    })

    wc.on("did-start-loading", () => send({ type: "loading", isLoading: true }))

    // Update title when page finishes loading
    wc.on("did-stop-loading", () => {
      send({ type: "loading", isLoading: false })
    })

    wc.on("did-fail-load", () => send({ type: "loading", isLoading: false }))

    // Handle HTML fullscreen (e.g., video fullscreen)
    // Just expand view to fill window - don't control window fullscreen state
    // This keeps the web content's fullscreen state in sync
    wc.on("enter-html-full-screen", () => {
      this.fullscreenViews.add(viewId)
      const win = this.win
      if (win) {
        // Function to update view bounds to fill the window content area
        const updateFullscreenBounds = () => {
          if (!this.fullscreenViews.has(viewId)) return
          const bounds = win.getContentBounds()
          view.setBounds({
            x: 0,
            y: 0,
            width: bounds.width,
            height: bounds.height,
          })
        }

        // Immediate update
        updateFullscreenBounds()

        // Listen to window resize events for smooth fullscreen animation
        const onResize = () => {
          if (this.fullscreenViews.has(viewId)) {
            updateFullscreenBounds()
          }
        }
        win.on("resize", onResize)

        // Stop listening after fullscreen transition completes
        setTimeout(() => {
          win.off("resize", onResize)
        }, 1000)
      }
    })

    wc.on("leave-html-full-screen", () => {
      this.fullscreenViews.delete(viewId)
      const win = this.win
      if (win) {
        // Notify renderer to restore normal bounds
        win.webContents.send("browser.view:requestBoundsUpdate", viewId)
      }
    })
  }

  @IpcMethod()
  reload(viewId: string) {
    const view = this.views.get(viewId)
    view?.webContents.reload()
  }

  @IpcMethod()
  goBack(viewId: string) {
    const view = this.views.get(viewId)
    if (view?.webContents.navigationHistory.canGoBack()) {
      view.webContents.navigationHistory.goBack()
    }
  }

  @IpcMethod()
  goForward(viewId: string) {
    const view = this.views.get(viewId)
    if (view?.webContents.navigationHistory.canGoForward()) {
      view.webContents.navigationHistory.goForward()
    }
  }

  @IpcMethod()
  loadURL(viewId: string, url: string) {
    const view = this.views.get(viewId)
    view?.webContents.loadURL(url)
  }

  @IpcMethod()
  updateBounds(viewId: string, bounds: BrowserViewBounds) {
    // Ignore bounds updates while in fullscreen mode
    if (this.fullscreenViews.has(viewId)) {
      return
    }
    const view = this.views.get(viewId)
    if (view) {
      view.setBounds(bounds)
    }
  }

  @IpcMethod()
  close(viewId: string) {
    const win = this.win
    if (!win) return

    const view = this.views.get(viewId)
    if (view) {
      win.contentView.removeChildView(view)
      view.webContents.close()
      this.views.delete(viewId)
      this.fullscreenViews.delete(viewId)
    }
  }

  @IpcMethod()
  setVisible(viewId: string, visible: boolean) {
    const view = this.views.get(viewId)
    if (view) {
      view.setVisible(visible)
    }
  }

  @IpcMethod()
  async capturePage(viewId: string): Promise<string | null> {
    const view = this.views.get(viewId)
    if (!view) return null
    const image = await view.webContents.capturePage()
    return image.toDataURL()
  }

  @IpcMethod()
  closeAll() {
    const win = this.win
    if (!win) return

    for (const [viewId, view] of this.views) {
      win.contentView.removeChildView(view)
      view.webContents.close()
    }
    this.views.clear()
    this.fullscreenViews.clear()
  }

  @IpcMethod()
  openDevTools(
    viewId: string,
    options?: { mode: "right" | "bottom" | "undocked" | "detach" }
  ) {
    const view = this.views.get(viewId)
    if (view) {
      view.webContents.openDevTools(options)
    }
  }

  @IpcMethod()
  closeDevTools(viewId: string) {
    const view = this.views.get(viewId)
    if (view) {
      view.webContents.closeDevTools()
    }
  }

  @IpcMethod()
  setUserAgent(viewId: string, userAgent: string) {
    const view = this.views.get(viewId)
    if (view) {
      view.webContents.setUserAgent(userAgent)
    }
  }

  @IpcMethod()
  getUserAgent(viewId: string): string | undefined {
    const view = this.views.get(viewId)
    return view?.webContents.getUserAgent()
  }

  @IpcMethod()
  stop(viewId: string) {
    const view = this.views.get(viewId)
    if (view) {
      view.webContents.stop()
    }
  }

  @IpcMethod()
  getAllViews(): Array<{
    viewId: string
    url: string
    title: string
    isLoading: boolean
    canGoBack: boolean
    canGoForward: boolean
  }> {
    const result = []
    for (const [viewId, view] of this.views) {
      const wc = view.webContents
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

  @IpcMethod()
  getViewCount(): number {
    return this.views.size
  }
}

// Backward compatibility export
export { BrowserViewService as BrowserViewManager }
