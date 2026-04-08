/**
 * Window Module - BrowserWindow management and related services
 *
 * This module provides:
 * - Main window lifecycle management (create, show, hide, close)
 * - Window state persistence
 * - BrowserView management
 * - Global shortcuts
 * - System tray
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

@Module({
  imports: [ConfigModule],
  providers: [
    WindowService,
    BrowserViewService,
    GlobalShortcutsService,
    TrayService,
  ],
  exports: [
    WindowService,
    BrowserViewService,
    GlobalShortcutsService,
    TrayService,
  ],
})
export class WindowModule {}

// Re-exports for convenience
export { WindowService } from "./window.service"
export { BrowserViewService } from "./browser-view.service"
export { GlobalShortcutsService } from "./global-shortcuts.service"
export { TrayService } from "./tray.service"
