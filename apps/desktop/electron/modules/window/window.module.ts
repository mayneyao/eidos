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
 * - App lifecycle management
 *
 * Dependencies:
 * - ConfigModule (for window state persistence)
 * - UpdaterModule (for app lifecycle)
 * - DataSpaceModule (for cleanup on exit)
 * - OpenDataModule (for cleanup on exit)
 * - TerminalModule (for cleanup on exit)
 */

import { Module } from "../../common/di"
import { ConfigModule } from "../config/config.module"
import { UpdaterModule } from "../updater/updater.module"
import { DataSpaceModule } from "../data-space"
import { OpenDataModule } from "../opendata"
import { TerminalModule } from "../terminal/terminal.module"
import { WindowService } from "./window.service"
import { BrowserViewService } from "./browser-view.service"
import { GlobalShortcutsService } from "./global-shortcuts.service"
import { TrayService } from "./tray.service"
import { WebviewService } from "./webview.service"
import { ProtocolService } from "./protocol.service"
import { AppLifecycleService } from "./app-lifecycle.service"

@Module({
  imports: [
    ConfigModule,
    UpdaterModule,
    DataSpaceModule,
    OpenDataModule,
    TerminalModule,
  ],
  providers: [
    WindowService,
    BrowserViewService,
    GlobalShortcutsService,
    TrayService,
    WebviewService,
    ProtocolService,
    AppLifecycleService,
  ],
  exports: [
    WindowService,
    BrowserViewService,
    GlobalShortcutsService,
    TrayService,
    WebviewService,
    ProtocolService,
    AppLifecycleService,
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
export { AppLifecycleService } from "./app-lifecycle.service"
