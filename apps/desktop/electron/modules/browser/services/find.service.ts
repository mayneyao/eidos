import type { WebContents } from "electron"
import { IpcMethod, IpcServiceBase } from "@eidos.space/electron-ipc"

import { IpcInjectable, Inject } from "../../../common/di"
import { WindowService } from "../../window/window.service"
import { ViewManagerService } from "./view-manager.service"
import { OverlayService } from "./overlay.service"

export interface FindInPageOptions {
  forward?: boolean
  findNext?: boolean
  matchCase?: boolean
}

export interface FindInPageResult {
  requestId: number
  activeMatchOrdinal: number
  matches: number
  selectionArea?: {
    x: number
    y: number
    width: number
    height: number
  }
}

const MAIN_WINDOW_VIEW_ID = "__main__"

/**
 * Find Service - Provides find-in-page functionality for BrowserViews and the main window
 */
@IpcInjectable("browser.find", { exposeMode: "decorated" })
export class FindService extends IpcServiceBase {
  constructor(
    @Inject(ViewManagerService) private viewManager: ViewManagerService,
    @Inject(WindowService) private windowService: WindowService,
    @Inject(OverlayService) private overlayService: OverlayService
  ) {
    super()
  }

  private get win() {
    return this.windowService?.getMainWindow() ?? null
  }

  private isMainWindow(viewId: string): boolean {
    return viewId === MAIN_WINDOW_VIEW_ID
  }

  private getTargetWebContents(viewId: string): WebContents | null {
    if (this.isMainWindow(viewId)) {
      return this.win?.webContents ?? null
    }
    return this.viewManager.getView(viewId)?.webContents ?? null
  }

  /**
   * Find text in page
   */
  @IpcMethod()
  findInPage(
    viewId: string,
    text: string,
    options?: FindInPageOptions
  ): number {
    const target = this.getTargetWebContents(viewId)
    if (!target) return -1

    // Setup result handler
    const handler = (event: any, result: FindInPageResult) => {
      const win = this.win
      if (win) {
        // Send to main renderer
        win.webContents.send("browser.view:foundInPage", viewId, result)
        // Update overlay if open
        this.overlayService.updateFindOverlay(viewId, {
          findText: text,
          findMatches: result.matches,
          findActiveMatch: result.activeMatchOrdinal,
        })
      }
    }

    // Remove existing listener to avoid duplicates
    target.removeAllListeners("found-in-page")
    target.on("found-in-page", handler)

    const requestId = target.findInPage(text, {
      forward: options?.forward ?? true,
      findNext: options?.findNext ?? false,
      matchCase: options?.matchCase ?? false,
    })

    return requestId
  }

  /**
   * Stop find in page and clear selection
   */
  @IpcMethod()
  stopFindInPage(
    viewId: string,
    action?: "clearSelection" | "keepSelection"
  ): void {
    const target = this.getTargetWebContents(viewId)
    if (!target) return

    target.stopFindInPage(
      action === "keepSelection" ? "keepSelection" : "clearSelection"
    )
  }

  /**
   * Blur the webview to allow focus to move to React UI
   * This is needed when opening find-in-page UI
   */
  @IpcMethod()
  blurWebview(viewId: string): void {
    if (this.isMainWindow(viewId)) {
      // For main window, focus is already there
      const win = this.win
      if (win) {
        win.webContents.focus()
      }
      return
    }

    const view = this.viewManager.getView(viewId)
    if (!view) return

    // Move focus to the main window's webContents
    const win = this.win
    if (win) {
      win.webContents.focus()
    }
  }

  /**
   * Set find mode - adjusts view bounds to make room for find UI
   */
  @IpcMethod()
  setFindMode(viewId: string, findUiHeight?: number): void {
    if (this.isMainWindow(viewId)) return
    this.viewManager.setFindMode(viewId, findUiHeight)
  }

  /**
   * Exit find mode - restore original view bounds
   */
  @IpcMethod()
  exitFindMode(viewId: string): void {
    if (this.isMainWindow(viewId)) return
    this.viewManager.exitFindMode(viewId)
  }

  /**
   * Show find overlay for a view
   */
  @IpcMethod()
  showFindOverlay(
    viewId: string,
    options?: {
      findText?: string
      findMatches?: number
      findActiveMatch?: number
    }
  ): void {
    this.overlayService.showFindOverlay(viewId, options)
  }

  /**
   * Close find overlay for a view
   */
  @IpcMethod()
  closeFindOverlay(viewId: string): void {
    this.overlayService.closeFindOverlay(viewId)
  }

  /**
   * Update find overlay with search results
   */
  @IpcMethod()
  updateFindOverlay(
    viewId: string,
    data: {
      findText?: string
      findMatches?: number
      findActiveMatch?: number
    }
  ): void {
    this.overlayService.updateFindOverlay(viewId, data)
  }

  /**
   * Check if find overlay is open for a view
   */
  @IpcMethod()
  isFindOverlayOpen(viewId: string): boolean {
    return this.overlayService.isFindOverlayOpen(viewId)
  }
}
