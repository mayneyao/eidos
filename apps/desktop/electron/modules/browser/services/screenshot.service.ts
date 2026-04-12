import { IpcMethod } from "@eidos.space/electron-ipc"

import { IpcInjectable, Inject } from "../../../common/di"
import { ViewManagerService } from "./view-manager.service"

/**
 * Screenshot Service - Captures screenshots of BrowserViews
 */
@IpcInjectable("browser.screenshot")
export class ScreenshotService {
  constructor(
    @Inject(ViewManagerService) private viewManager: ViewManagerService
  ) {}

  /**
   * Capture a screenshot of the current page
   */
  @IpcMethod()
  async capturePage(viewId: string): Promise<string | null> {
    const view = this.viewManager.getView(viewId)
    if (!view) return null

    const image = await view.webContents.capturePage()
    return image.toDataURL()
  }

  /**
   * Get the native image as PNG buffer
   */
  @IpcMethod()
  async capturePageBuffer(viewId: string): Promise<Buffer | null> {
    const view = this.viewManager.getView(viewId)
    if (!view) return null

    const image = await view.webContents.capturePage()
    return image.toPNG()
  }

  /**
   * Get the native image as JPEG buffer
   */
  @IpcMethod()
  async capturePageJpeg(
    viewId: string,
    quality?: number
  ): Promise<Buffer | null> {
    const view = this.viewManager.getView(viewId)
    if (!view) return null

    const image = await view.webContents.capturePage()
    return image.toJPEG(quality ?? 90)
  }
}
