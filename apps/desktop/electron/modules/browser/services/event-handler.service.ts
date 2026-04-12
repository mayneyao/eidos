import { shell } from "electron"

import { Inject } from "../../../common/di"
import { WindowService } from "../../window/window.service"
import type { ViewEventData } from "../types"
import { ViewManagerService } from "./view-manager.service"

/**
 * Event Handler Service - Manages BrowserView event listeners
 *
 * Note: Event subscription methods (onUpdate, onNewTab, etc.) are not exposed via IPC.
 * Frontend should use window.eidos.on() directly to listen to these events.
 */
export class EventHandlerService {
  private attachedViews = new Set<string>()

  constructor(
    @Inject(ViewManagerService) private viewManager: ViewManagerService,
    @Inject(WindowService) private windowService: WindowService
  ) {}

  private get win() {
    return this.windowService?.getMainWindow() ?? null
  }

  /**
   * Attach event listeners to a view
   */
  attachEventListeners(viewId: string): void {
    if (this.attachedViews.has(viewId)) return

    const view = this.viewManager.getView(viewId)
    const win = this.win
    if (!view || !win) return

    this.attachedViews.add(viewId)

    const wc = view.webContents
    const send = (data: ViewEventData) => {
      win.webContents.send("browser.view:update", viewId, data)
    }

    // Navigation events
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

    // Loading events
    wc.on("did-start-loading", () => {
      send({ type: "loading", isLoading: true })
    })

    wc.on("did-stop-loading", () => {
      send({ type: "loading", isLoading: false })
    })

    wc.on("did-fail-load", () => {
      send({ type: "loading", isLoading: false })
    })

    // Title change
    wc.on("page-title-updated", (_, title) => {
      send({ type: "title", title })
    })

    // Fullscreen handling
    wc.on("enter-html-full-screen", () => {
      this.viewManager.setFullscreen(viewId, true)
      const win = this.win
      if (win) {
        const updateFullscreenBounds = () => {
          if (!this.viewManager.isFullscreen(viewId)) return
          const bounds = win.getContentBounds()
          view.setBounds({
            x: 0,
            y: 0,
            width: bounds.width,
            height: bounds.height,
          })
        }
        updateFullscreenBounds()

        const onResize = () => {
          if (this.viewManager.isFullscreen(viewId)) {
            updateFullscreenBounds()
          }
        }
        win.on("resize", onResize)
        setTimeout(() => win.off("resize", onResize), 1000)
      }
    })

    wc.on("leave-html-full-screen", () => {
      this.viewManager.setFullscreen(viewId, false)
      const win = this.win
      if (win) {
        win.webContents.send("browser.view:requestBoundsUpdate", viewId)
      }
    })

    // Window open handler (for new tabs)
    wc.setWindowOpenHandler(({ url, frameName, features }) => {
      console.log("[EventHandlerService] Window open:", url)
      const protocol = new URL(url).protocol
      if (protocol === "https:" || protocol === "http:") {
        const win = this.win
        if (win) {
          win.webContents.send("browser.view:newTab", {
            url,
            frameName,
            features,
          })
        }
      }
      return { action: "deny" }
    })
  }

  /**
   * Detach event listeners (called when view is closed)
   */
  detachEventListeners(viewId: string): void {
    this.attachedViews.delete(viewId)
  }

  /**
   * Open a view with event listeners attached
   */
  open(
    viewId: string,
    url: string,
    bounds: { x: number; y: number; width: number; height: number }
  ): void {
    this.viewManager.open(viewId, url, bounds)
    this.attachEventListeners(viewId)
  }

  /**
   * Close a view with event listeners detached
   */
  close(viewId: string): void {
    this.detachEventListeners(viewId)
    this.viewManager.close(viewId)
  }
}
