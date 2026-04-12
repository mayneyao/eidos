import { IpcMethod } from "@eidos.space/electron-ipc"

import { IpcInjectable, Inject } from "../../../common/di"
import { ViewManagerService } from "./view-manager.service"

/**
 * Navigation Service - Handles BrowserView navigation (reload, back, forward, etc.)
 */
@IpcInjectable("browser.navigation")
export class NavigationService {
  constructor(
    @Inject(ViewManagerService) private viewManager: ViewManagerService
  ) {}

  @IpcMethod()
  reload(viewId: string): void {
    const view = this.viewManager.getView(viewId)
    view?.webContents.reload()
  }

  @IpcMethod()
  goBack(viewId: string): void {
    const view = this.viewManager.getView(viewId)
    if (view?.webContents.navigationHistory.canGoBack()) {
      view.webContents.navigationHistory.goBack()
    }
  }

  @IpcMethod()
  goForward(viewId: string): void {
    const view = this.viewManager.getView(viewId)
    if (view?.webContents.navigationHistory.canGoForward()) {
      view.webContents.navigationHistory.goForward()
    }
  }

  @IpcMethod()
  loadURL(viewId: string, url: string): void {
    const view = this.viewManager.getView(viewId)
    view?.webContents.loadURL(url)
  }

  @IpcMethod()
  stop(viewId: string): void {
    const view = this.viewManager.getView(viewId)
    view?.webContents.stop()
  }

  @IpcMethod()
  canGoBack(viewId: string): boolean {
    const view = this.viewManager.getView(viewId)
    return view?.webContents.navigationHistory.canGoBack() ?? false
  }

  @IpcMethod()
  canGoForward(viewId: string): boolean {
    const view = this.viewManager.getView(viewId)
    return view?.webContents.navigationHistory.canGoForward() ?? false
  }

  @IpcMethod()
  getURL(viewId: string): string | undefined {
    const view = this.viewManager.getView(viewId)
    return view?.webContents.getURL()
  }

  @IpcMethod()
  getTitle(viewId: string): string | undefined {
    const view = this.viewManager.getView(viewId)
    return view?.webContents.getTitle()
  }

  @IpcMethod()
  isLoading(viewId: string): boolean {
    const view = this.viewManager.getView(viewId)
    return view?.webContents.isLoading() ?? false
  }
}
