import { Module } from "../../common/di"
import { WindowModule } from "../window/window.module"

import { BrowserService } from "./browser.service"
import {
  ViewManagerService,
  NavigationService,
  ReaderViewService,
  ZoomService,
  EventHandlerService,
  ScreenshotService,
  DevToolsService,
  UserAgentService,
} from "./services"

/**
 * Browser Module - Manages BrowserView functionality
 *
 * Provides:
 * - View lifecycle management (create, update, close)
 * - Navigation control (back, forward, reload)
 * - Reader View mode (via eidos-read:// protocol)
 * - Zoom synchronization
 * - Screenshot capture
 * - DevTools management
 */
@Module({
  imports: [WindowModule],
  providers: [
    // Core services
    ViewManagerService,
    NavigationService,
    ReaderViewService,
    ZoomService,
    EventHandlerService,
    ScreenshotService,
    DevToolsService,
    UserAgentService,
    // Main facade service
    BrowserService,
  ],
  exports: [BrowserService],
})
export class BrowserModule {}
