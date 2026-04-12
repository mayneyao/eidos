import { IpcMethod } from "@eidos.space/electron-ipc"

import { IpcInjectable, Inject } from "../../../common/di"
import { ViewManagerService } from "./view-manager.service"

/**
 * User Agent Service - Manages User-Agent for BrowserViews
 */
@IpcInjectable("browser.useragent")
export class UserAgentService {
  constructor(
    @Inject(ViewManagerService) private viewManager: ViewManagerService
  ) {}

  @IpcMethod()
  setUserAgent(viewId: string, userAgent: string): void {
    const view = this.viewManager.getView(viewId)
    if (view) {
      view.webContents.setUserAgent(userAgent)
    }
  }

  @IpcMethod()
  getUserAgent(viewId: string): string | undefined {
    const view = this.viewManager.getView(viewId)
    return view?.webContents.getUserAgent()
  }

  @IpcMethod()
  getSystemUserAgent(): string {
    // Return the default system user agent
    return "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
  }
}
