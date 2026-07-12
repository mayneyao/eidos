import { IpcServiceBase, IpcMethod } from "@eidos.space/electron-ipc"

import { IpcInjectable, Inject } from "../../common/di"
import { WindowService } from "../window/window.service"
import { RawDataService } from "../rawdata/rawdata.service"
import {
  ViewManagerService,
  NavigationService,
  ReaderViewService,
  ZoomService,
  EventHandlerService,
  ScreenshotService,
  DevToolsService,
  UserAgentService,
  FindService,
  OverlayService,
} from "./services"

/**
 * Browser Service - Main facade for all browser-related functionality
 *
 * This service acts as a backward-compatible API for existing code.
 * New code should use the specific services directly.
 */
@IpcInjectable("browser.view", { exposeMode: "decorated" })
export class BrowserService extends IpcServiceBase {
  constructor(
    @Inject(WindowService) private windowService: WindowService,
    @Inject(ViewManagerService) private viewManager: ViewManagerService,
    @Inject(NavigationService) private navigation: NavigationService,
    @Inject(ReaderViewService) private readerView: ReaderViewService,
    @Inject(ZoomService) private zoom: ZoomService,
    @Inject(EventHandlerService) private events: EventHandlerService,
    @Inject(ScreenshotService) private screenshot: ScreenshotService,
    @Inject(DevToolsService) private devtools: DevToolsService,
    @Inject(UserAgentService) private userAgent: UserAgentService,
    @Inject(FindService) private find: FindService,
    @Inject(OverlayService) private overlay: OverlayService
  ) {
    super()
  }

  /**
   * Setup services that need window reference
   */
  setWindowService(windowService: WindowService): void {
    // Zoom sync is now handled internally by ZoomService
    this.zoom.setupZoomSync()
  }

  // ============================================================
  // View Management (delegated to ViewManagerService)
  // ============================================================

  @IpcMethod()
  open(
    viewId: string,
    url: string,
    bounds: { x: number; y: number; width: number; height: number }
  ): void {
    this.events.open(viewId, url, bounds)
  }

  @IpcMethod()
  close(viewId: string): void {
    this.events.close(viewId)
  }

  @IpcMethod()
  closeAll(): void {
    this.viewManager.closeAll()
  }

  @IpcMethod()
  updateBounds(
    viewId: string,
    bounds: { x: number; y: number; width: number; height: number }
  ): void {
    this.viewManager.updateBounds(viewId, bounds)
  }

  @IpcMethod()
  setVisible(viewId: string, visible: boolean): void {
    this.viewManager.setVisible(viewId, visible)
  }

  @IpcMethod()
  getViewCount(): number {
    return this.viewManager.getViewCount()
  }

  @IpcMethod()
  getAllViews() {
    return this.viewManager.getAllViews()
  }

  // ============================================================
  // Navigation (delegated to NavigationService)
  // ============================================================

  @IpcMethod()
  reload(viewId: string): void {
    this.navigation.reload(viewId)
  }

  @IpcMethod()
  goBack(viewId: string): void {
    this.navigation.goBack(viewId)
  }

  @IpcMethod()
  goForward(viewId: string): void {
    this.navigation.goForward(viewId)
  }

  @IpcMethod()
  loadURL(viewId: string, url: string): void {
    this.navigation.loadURL(viewId, url)
  }

  @IpcMethod()
  stop(viewId: string): void {
    this.navigation.stop(viewId)
  }

  // ============================================================
  // Reader View (delegated to ReaderViewService)
  // ============================================================

  @IpcMethod()
  openReaderView(
    viewId: string,
    data: {
      html: string
      title: string
      originalUrl: string
      markdown?: string
    }
  ) {
    return this.readerView.openReaderView(viewId, data)
  }

  @IpcMethod()
  exitReaderView(viewId: string, originalUrl: string): Promise<void> {
    return this.readerView.exitReaderView(viewId, originalUrl)
  }

  @IpcMethod()
  isReaderViewActive(viewId: string): boolean {
    return this.readerView.isReaderViewActive(viewId)
  }

  @IpcMethod()
  captureAsReaderView(viewId: string) {
    return this.readerView.captureAsReaderView(viewId)
  }

  // ============================================================
  // Screenshot (delegated to ScreenshotService)
  // ============================================================

  @IpcMethod()
  capturePage(viewId: string): Promise<string | null> {
    return this.screenshot.capturePage(viewId)
  }

  // ============================================================
  // DevTools (delegated to DevToolsService)
  // ============================================================

  @IpcMethod()
  openDevTools(
    viewId: string,
    options?: { mode: "right" | "bottom" | "undocked" | "detach" }
  ): void {
    this.devtools.openDevTools(viewId, options)
  }

  @IpcMethod()
  closeDevTools(viewId: string): void {
    this.devtools.closeDevTools(viewId)
  }

  // ============================================================
  // User Agent (delegated to UserAgentService)
  // ============================================================

  @IpcMethod()
  setUserAgent(viewId: string, userAgent: string): void {
    this.userAgent.setUserAgent(viewId, userAgent)
  }

  @IpcMethod()
  getUserAgent(viewId: string): string | undefined {
    return this.userAgent.getUserAgent(viewId)
  }

  // ============================================================
  // Find in Page (delegated to FindService)
  // ============================================================

  @IpcMethod()
  findInPage(
    viewId: string,
    text: string,
    options?: { forward?: boolean; findNext?: boolean; matchCase?: boolean }
  ): number {
    return this.find.findInPage(viewId, text, options)
  }

  @IpcMethod()
  stopFindInPage(
    viewId: string,
    action?: "clearSelection" | "keepSelection"
  ): void {
    this.find.stopFindInPage(viewId, action)
  }

  // ============================================================
  // Find Overlay Position Sync
  // ============================================================

  @IpcMethod()
  syncFindOverlayPosition(
    viewId: string,
    bounds: { x: number; y: number; width: number; height: number }
  ): void {
    this.overlay.updateOverlayPosition(viewId, bounds)
  }

  // ============================================================
  // View Space Management (for context menu adapter functionality)
  // ============================================================

  @IpcMethod()
  setViewSpace(viewId: string, space: string): void {
    this.viewManager.setViewSpace(viewId, space)
  }

  // Note: Event subscription methods (onUpdate, onNewTab, onRequestBoundsUpdate, onZoomChanged)
  // are NOT exposed via IPC. Frontend should use window.eidos.on() directly:
  //
  // window.eidos.on("browser.view:update", (viewId, data) => { ... })
  // window.eidos.on("browser.view:newTab", (data) => { ... })
  // window.eidos.on("browser.view:requestBoundsUpdate", (viewId) => { ... })
  // window.eidos.on("browser.view:zoomChanged", () => { ... })
}
