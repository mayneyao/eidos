/**
 * Window Module - BrowserWindow management and related services
 *
 * This module provides:
 * - Main window lifecycle management (create, show, hide, close)
 * - Window state persistence
 * - BrowserView management
 * - Global shortcuts
 * - System tray
 * - Webview handling
 * - Protocol URL handling
 *
 * Dependencies:
 * - ConfigModule (for window state persistence)
 */

import { Module } from "../../common/di"
import { ConfigModule } from "../config/config.module"
import { WindowService } from "./window.service"
import { BrowserViewService } from "./browser-view.service"
import { GlobalShortcutsService } from "./global-shortcuts.service"
import { TrayService } from "./tray.service"
import { WebviewService } from "./webview.service"
import { ProtocolService } from "./protocol.service"

@Module({
  imports: [ConfigModule],
  providers: [
    WindowService,
    BrowserViewService,
    GlobalShortcutsService,
    TrayService,
    WebviewService,
    ProtocolService,
  ],
  exports: [
    WindowService,
    BrowserViewService,
    GlobalShortcutsService,
    TrayService,
    WebviewService,
    ProtocolService,
  ],
})
export class WindowModule {}

// Re-exports for convenience
export { WindowService } from "./window.service"
export { BrowserViewService } from "./browser-view.service"
export { GlobalShortcutsService } from "./global-shortcuts.service"
export { TrayService } from "./tray.service"
export { WebviewService } from "./webview.service"
export { ProtocolService } from "./protocol.service"
