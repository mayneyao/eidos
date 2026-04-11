import { shell, WebContentsView } from "electron"
import type { BrowserWindow } from "electron"
import {
  IpcService,
  IpcServiceBase,
  IpcMethod,
} from "@eidos.space/electron-ipc"

import { Injectable } from "../../common/di"
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
@IpcService("browser-view")
@Injectable()
export class BrowserViewService extends IpcServiceBase {
  private views = new Map<string, WebContentsView>()
  private windowService: WindowService | null = null

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

    view.webContents.setWindowOpenHandler(({ url }) => {
      const protocol = new URL(url).protocol
      if (protocol === "https:" || protocol === "http:") {
        shell.openExternal(url)
      }
      return { action: "deny" }
    })

    this._attachEventListeners(viewId, view)
    this.views.set(viewId, view)
  }

  private _attachEventListeners(viewId: string, view: WebContentsView) {
    const win = this.win
    if (!win) return

    const wc = view.webContents
    const send = (data: any) => {
      win.webContents.send("browser-view:update", viewId, data)
    }

    wc.on("did-start-loading", () => send({ type: "loading", isLoading: true }))
    wc.on("did-stop-loading", () => send({ type: "loading", isLoading: false }))
    wc.on("did-fail-load", () => send({ type: "loading", isLoading: false }))
    wc.on("did-navigate", () =>
      send({
        type: "navigate",
        url: wc.getURL(),
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
      })
    )
    wc.on("did-navigate-in-page", () =>
      send({
        type: "navigate",
        url: wc.getURL(),
        canGoBack: wc.navigationHistory.canGoBack(),
        canGoForward: wc.navigationHistory.canGoForward(),
      })
    )
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
}

// Backward compatibility export
export { BrowserViewService as BrowserViewManager }
