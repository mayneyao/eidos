import type { BrowserWindow, WebContentsView } from "electron"
import { IpcMethod } from "@eidos.space/electron-ipc"

import { IpcInjectable, Inject } from "../../../common/di"
import { WindowService } from "../../window/window.service"

/**
 * Zoom Service - Manages zoom level synchronization between main window and BrowserViews
 */
@IpcInjectable("browser.zoom")
export class ZoomService {
  private views = new Map<string, WebContentsView>()

  constructor(@Inject(WindowService) private windowService: WindowService) {}

  private get win(): BrowserWindow | null {
    return this.windowService?.getMainWindow() ?? null
  }

  /**
   * Register a view for zoom synchronization
   */
  registerView(viewId: string, view: WebContentsView): void {
    this.views.set(viewId, view)
  }

  /**
   * Unregister a view
   */
  unregisterView(viewId: string): void {
    this.views.delete(viewId)
  }

  /**
   * Setup zoom level synchronization from main window
   */
  setupZoomSync(): void {
    const win = this.win
    if (!win) return

    win.webContents.on("zoom-changed", (_, direction) => {
      const newZoomLevel = win.webContents.getZoomLevel()
      this.syncZoomToAllViews(newZoomLevel)
    })
  }

  /**
   * Sync zoom level to all registered views
   */
  syncZoomToAllViews(zoomLevel: number): void {
    for (const [, view] of this.views) {
      view.webContents.setZoomLevel(zoomLevel)
    }

    // Notify renderer to update bounds after zoom change
    const win = this.win
    if (win) {
      win.webContents.send("browser.view:zoomChanged", zoomLevel)
    }
  }

  /**
   * Get current zoom level from main window
   */
  getCurrentZoomLevel(): number {
    const win = this.win
    return win?.webContents.getZoomLevel() ?? 0
  }

  /**
   * Get zoom factor from main window
   */
  getZoomFactor(): number {
    const win = this.win
    return win?.webContents.getZoomFactor() ?? 1
  }

  @IpcMethod()
  setZoomLevel(viewId: string, zoomLevel: number): void {
    const view = this.views.get(viewId)
    if (view) {
      view.webContents.setZoomLevel(zoomLevel)
    }
  }

  @IpcMethod()
  getZoomLevel(viewId: string): number | undefined {
    const view = this.views.get(viewId)
    return view?.webContents.getZoomLevel()
  }
}
