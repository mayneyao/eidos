/**
 * Window Module - BrowserWindow management and related services
 *
 * This module provides window management capabilities:
 * - Main window lifecycle management
 * - Window state persistence
 * - BrowserView management
 * - Global shortcuts
 * - System tray
 * - Webview handling
 * - Protocol URL handling
 *
 * @example
 * ```typescript
 * import { WindowModule, WindowService } from "./modules/window"
 *
 * // In your module:
 * @Module({
 *   imports: [WindowModule],
 * })
 * export class YourModule {}
 *
 * // In your service:
 * @Injectable()
 * export class YourService {
 *   constructor(
 *     @Inject(WindowService) private windowService: WindowService
 *   ) {}
 * }
 * ```
 */

export { WindowModule } from "./window.module"
export { WindowService } from "./window.service"
export { BrowserViewService } from "./browser-view.service"
export { GlobalShortcutsService } from "./global-shortcuts.service"
export { TrayService } from "./tray.service"
export { WebviewService } from "./webview.service"
export { ProtocolService } from "./protocol.service"

// Re-export types
export type { BrowserViewBounds } from "./browser-view.service"
export type {
  ShortcutAction,
  ShortcutHandler,
} from "./global-shortcuts.service"
export type { ProtocolUrlPayload } from "./protocol.service"

// Backward compatibility helpers
import { container } from "../../common/di"
import { WindowService } from "./window.service"
import { TrayService } from "./tray.service"
import { ProtocolService } from "./protocol.service"
import { WebviewService } from "./webview.service"

/**
 * Get the main window.
 * @deprecated Use WindowService.getMainWindow() via DI injection instead
 */
export function getMainWindow() {
  try {
    if (container.isBound(WindowService)) {
      return container.get(WindowService).getMainWindow()
    }
  } catch {
    // DI container not ready
  }
  return null
}

/**
 * Create the main window.
 * @deprecated Use WindowService.createWindow() via DI injection instead
 */
export function createWindow(spaceId?: string, port?: number) {
  const windowService = container.get(WindowService)
  if (port) {
    windowService.setPort(port)
  }
  return windowService.createWindow(spaceId)
}

/**
 * Create system tray.
 * @deprecated Use TrayService.createTray() via DI injection instead
 */
export function createTray(options: { onQuit: () => void }): void {
  const trayService = container.get(TrayService)
  trayService.createTray(options.onQuit)
}

/**
 * Destroy tray icon.
 * @deprecated Use TrayService.destroyTray() via DI injection instead
 */
export function destroyTray(): void {
  const trayService = container.get(TrayService)
  trayService.destroyTray()
}

/**
 * Register webview service.
 * @deprecated Use WebviewService.register() via DI injection instead
 */
export function registerWebviewService(): void {
  const webviewService = container.get(WebviewService)
  webviewService.register()
}

/**
 * Handle protocol URL.
 * @deprecated Use ProtocolService.handleUrl() via DI injection instead
 */
export function handleProtocolUrl(url: string): void {
  const protocolService = container.get(ProtocolService)
  protocolService.handleUrl(url)
}
