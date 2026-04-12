import { IpcMethod } from "@eidos.space/electron-ipc"

import { IpcInjectable, Inject } from "../../../common/di"
import { ViewManagerService } from "./view-manager.service"

/**
 * DevTools Service - Manages developer tools for BrowserViews
 */
@IpcInjectable("browser.devtools")
export class DevToolsService {
  constructor(
    @Inject(ViewManagerService) private viewManager: ViewManagerService
  ) {}

  @IpcMethod()
  openDevTools(
    viewId: string,
    options?: { mode: "right" | "bottom" | "undocked" | "detach" }
  ): void {
    const view = this.viewManager.getView(viewId)
    if (view) {
      view.webContents.openDevTools(options)
    }
  }

  @IpcMethod()
  closeDevTools(viewId: string): void {
    const view = this.viewManager.getView(viewId)
    if (view) {
      view.webContents.closeDevTools()
    }
  }

  @IpcMethod()
  isDevToolsOpened(viewId: string): boolean {
    const view = this.viewManager.getView(viewId)
    return view?.webContents.isDevToolsOpened() ?? false
  }

  @IpcMethod()
  isDevToolsFocused(viewId: string): boolean {
    const view = this.viewManager.getView(viewId)
    return view?.webContents.isDevToolsFocused() ?? false
  }

  @IpcMethod()
  toggleDevTools(viewId: string): void {
    const view = this.viewManager.getView(viewId)
    if (!view) return

    if (view.webContents.isDevToolsOpened()) {
      view.webContents.closeDevTools()
    } else {
      view.webContents.openDevTools()
    }
  }
}
