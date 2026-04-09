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
 * - RawDataService, TerminalService (via lazy injection to avoid circular deps)
 */

import { Module } from "../../common/di"
import { ConfigModule } from "../config/config.module"
import { UpdaterModule } from "../updater/updater.module"
import { DataSpaceModule } from "../data-space"
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
    // RawDataModule and TerminalModule use lazy injection to avoid circular deps
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

// Note: Services are imported directly from their files to avoid
// circular dependency issues during module initialization
