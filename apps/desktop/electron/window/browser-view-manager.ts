import { shell, WebContentsView } from "electron"
import type { BrowserWindow } from "electron"
import { IpcService, IpcServiceBase } from "@eidos.space/electron-ipc"

export interface BrowserViewBounds {
  x: number
  y: number
  width: number
  height: number
}

@IpcService("browser-view")
export class BrowserViewManager extends IpcServiceBase {
  private views = new Map<string, WebContentsView>()
  private win: BrowserWindow

  constructor(win: BrowserWindow) {
    super()
    this.win = win
  }

  open(viewId: string, url: string, bounds: BrowserViewBounds) {
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
    this.win.contentView.addChildView(view)

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
    const wc = view.webContents
    const send = (data: any) => {
      this.win.webContents.send("browser-view:update", viewId, data)
    }

    wc.on("did-start-loading", () => send({ type: "loading", isLoading: true }))
    wc.on("did-stop-loading", () => send({ type: "loading", isLoading: false }))
    wc.on("did-fail-load", () => send({ type: "loading", isLoading: false }))
    wc.on("did-navigate", () =>
      send({
        type: "navigate",
        url: wc.getURL(),
        canGoBack: wc.canGoBack(),
        canGoForward: wc.canGoForward(),
      })
    )
    wc.on("did-navigate-in-page", () =>
      send({
        type: "navigate",
        url: wc.getURL(),
        canGoBack: wc.canGoBack(),
        canGoForward: wc.canGoForward(),
      })
    )
  }

  reload(viewId: string) {
    const view = this.views.get(viewId)
    view?.webContents.reload()
  }

  goBack(viewId: string) {
    const view = this.views.get(viewId)
    if (view?.webContents.canGoBack()) {
      view.webContents.goBack()
    }
  }

  goForward(viewId: string) {
    const view = this.views.get(viewId)
    if (view?.webContents.canGoForward()) {
      view.webContents.goForward()
    }
  }

  loadURL(viewId: string, url: string) {
    const view = this.views.get(viewId)
    view?.webContents.loadURL(url)
  }

  updateBounds(viewId: string, bounds: BrowserViewBounds) {
    const view = this.views.get(viewId)
    if (view) {
      view.setBounds(bounds)
    }
  }

  close(viewId: string) {
    const view = this.views.get(viewId)
    if (view) {
      this.win.contentView.removeChildView(view)
      view.webContents.close()
      this.views.delete(viewId)
    }
  }

  setVisible(viewId: string, visible: boolean) {
    const view = this.views.get(viewId)
    if (view) {
      view.setVisible(visible)
    }
  }

  async capturePage(viewId: string): Promise<string | null> {
    const view = this.views.get(viewId)
    if (!view) return null
    const image = await view.webContents.capturePage()
    return image.toDataURL()
  }

  closeAll() {
    for (const [viewId, view] of this.views) {
      this.win.contentView.removeChildView(view)
      view.webContents.close()
    }
    this.views.clear()
  }

  openDevTools(
    viewId: string,
    options?: { mode: "right" | "bottom" | "undocked" | "detach" }
  ) {
    const view = this.views.get(viewId)
    if (view) {
      view.webContents.openDevTools(options)
    }
  }

  closeDevTools(viewId: string) {
    const view = this.views.get(viewId)
    if (view) {
      view.webContents.closeDevTools()
    }
  }

  setUserAgent(viewId: string, userAgent: string) {
    const view = this.views.get(viewId)
    if (view) {
      view.webContents.setUserAgent(userAgent)
    }
  }

  getUserAgent(viewId: string): string | undefined {
    const view = this.views.get(viewId)
    return view?.webContents.getUserAgent()
  }
}
