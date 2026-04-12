/**
 * Main Process Entry Point - DI-based version
 *
 * This is the new entry point using NestJS-style DI with inversify.
 *
 * Architecture:
 * 1. Import 'reflect-metadata' first (required for decorators)
 * 2. Bootstrap the AppModule
 * 3. All services are automatically registered via DI
 */

// Required for decorator metadata
import "reflect-metadata"

// No direct Electron type imports needed
import { app, ipcMain } from "electron"
import { default as console, default as electronLog } from "electron-log"
import path from "path"

// DI System
import { AppModule } from "./app.module"
import { bootstrap, container } from "./common/di"

// Import services for backward compatibility
import { RawDataService } from "./modules/rawdata"
import { TerminalService } from "./modules/terminal/terminal.module"

// Legacy imports (will be migrated gradually)
import { showPortInUseDialog } from "./modules/api-server/api-server.module"
import { DataSpaceIpcService } from "./modules/data-space"
import { registerElectronFetchIpc } from "./modules/network/fetch-proxy"
import {
  SpaceRegistry,
  resolveStartupSpace,
} from "./modules/space-management/space-management.module"
// Import window services directly from their files to avoid circular deps
import { AppLifecycleService } from "./modules/window/app-lifecycle.service"
import { BrowserService } from "./modules/browser/browser.service"
import { GlobalShortcutsService } from "./modules/window/global-shortcuts.service"
import { ProtocolService } from "./modules/window/protocol.service"
import { TrayService } from "./modules/window/tray.service"
import { WebviewService } from "./modules/window/webview.service"
import { WindowService } from "./modules/window/window.service"

import { CorsService } from "./modules/network/network.module"

// DI imports for window providers
import {
  ApiServerService,
  type PortInUseError,
} from "./modules/api-server/api-server.module"
// Window providers get window reference via setter injection
import { MainWindowProvider } from "./modules/space-management/space-management.module"
import { TerminalWindowProvider } from "./modules/terminal/terminal.module"
import { UpdaterService } from "./modules/updater/updater.module"

// Export helper to get main window web contents
export function getMainWindowWebContents() {
  const windowService = container.get(WindowService)
  return windowService.getMainWindowWebContents()
}

// App state - now managed by services via DI

export const PORT = 13127

// Disable security warnings in development
process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true"
process.env.DIST = path.join(__dirname, "../dist")
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, "../public")

// Register custom protocols before app ready
// Reader View protocol: eidos-read://
import { protocol } from "electron"
protocol.registerSchemesAsPrivileged([
  {
    scheme: "eidos-read",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: false,
    },
  },
])

// Error handling
process.on("uncaughtException", (error) => {
  console.error("Unhandled Exception:", error)
  electronLog.error("Unhandled Exception:", error)
})

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason)
  electronLog.error("Unhandled Rejection at:", promise, "reason:", reason)
})

/**
 * Initialize server with port conflict handling
 */
async function initializeServer(): Promise<void> {
  const apiServer = container.get(ApiServerService)

  await apiServer.startServer(process.env.DIST, PORT, {
    onPortConflict: async (error: PortInUseError) => {
      const result = await showPortInUseDialog(PORT, error.processInfo)
      if (result.action === "exit") {
        console.log("User chose to exit due to port conflict")
        app.quit()
        process.exit(0)
      }
      if (result.killed) {
        console.log("Process was killed, retrying immediately...")
      } else {
        console.log("User chose to retry, waiting for port to be freed...")
      }
      return result
    },
  })
  console.log(`Server started successfully on port ${PORT}`)
}

/**
 * Main application bootstrap
 */
async function main() {
  console.log("[Main] Starting Eidos Desktop...")
  // Check for single instance
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    process.exit(0)
  }

  // Bootstrap DI container
  console.log("[Main] Bootstrapping DI container...")
  await bootstrap(AppModule, {
    autoRegisterIpc: true,
    setupRegistry: true,
  })

  // Initialize server first
  await initializeServer()

  // App event handlers - will be set up via AppLifecycleService

  // Protocol handling - will be set up after services are ready

  // App ready handler
  app.whenReady().then(async () => {
    // Initialize CORS via DI
    const corsService = container.get(CorsService)
    corsService.initialize()

    // Register fetch proxy
    registerElectronFetchIpc()

    // Register sqlite-msg handlers (need event object, manual registration)
    // These require event.sender for iterator callbacks
    // Get DataSpaceIpcService from DI container
    const dataSpaceIpcService = container.get(DataSpaceIpcService)
    ipcMain.handle("sqlite-msg", async (event, payload) => {
      return dataSpaceIpcService.sqliteMsg(event, payload)
    })

    ipcMain.handle("sqlite-msg-read", async (event, payload) => {
      return dataSpaceIpcService.sqliteMsgRead(event, payload)
    })

    // Get WindowService early (needed by other services)
    const windowService = container.get(WindowService)
    windowService.setPort(PORT)

    // Set up app lifecycle handlers
    const appLifecycleService = container.get(AppLifecycleService)
    const rawDataService = container.get(RawDataService)
    const terminalService = container.get(TerminalService)

    // Register cleanup callbacks
    appLifecycleService.onCleanup(() => rawDataService.closeAll())
    appLifecycleService.onCleanup(() => terminalService.cleanup())

    // Set WindowService for services that need it (avoid circular deps)
    rawDataService.setWindowService(windowService)
    container.get(MainWindowProvider).setWindowService(windowService)
    container.get(TerminalWindowProvider).setWindowService(windowService)

    appLifecycleService.setupLifecycleHandlers(() => {
      // before-quit cleanup
      rawDataService.closeAll()
      terminalService.cleanup()
    })
    appLifecycleService.registerIpcHandlers()

    // Initialize webview service (for backward compatibility)
    // NOTE: DI services are auto-registered via bootstrap, but we need to
    // instantiate webviewService to ensure it's ready for window creation
    container.get(WebviewService)

    // Migrate legacy config
    const spaceRegistry = container.get(SpaceRegistry)
    await spaceRegistry.migrateFromLegacyConfig()

    // Determine startup space
    let spaceId = resolveStartupSpace(null, spaceRegistry)

    // Create window
    windowService.createWindow(spaceId)

    // Initialize global shortcuts service
    const globalShortcutsService = container.get(GlobalShortcutsService)
    globalShortcutsService.setWindowService(windowService)
    globalShortcutsService.setupWindowFocusListeners()

    // Set WindowService on BrowserService
    container.get(BrowserService).setWindowService(windowService)

    // Create tray via DI
    const trayService = container.get(TrayService)
    trayService.setWindowService(windowService)
    trayService.createTray(() => {
      appLifecycleService.setForceQuit(true)
    })

    // Protocol handler via DI
    const protocolService = container.get(ProtocolService)

    // Register as default protocol client for eidos://
    protocolService.registerProtocolClient()

    // Handle any pending protocol URL (received before window was created)
    protocolService.handlePendingProtocolUrl()

    // Set up window close handler
    windowService.setupCloseHandler(appLifecycleService)

    // App updater (auto-registered via DI)
    const updaterService = container.get(UpdaterService)
    updaterService.initialize()
    updaterService.checkForUpdates()

    // App lifecycle service (auto-registered via DI)
    // Note: reloadApp and quitApp handlers are registered via IPC in main process
    // SpaceManagementService is auto-registered via DI

    // Set up app event handlers via services
    windowService.setupActivateHandler()
    protocolService.setupProtocolHandlers()

    console.log("[Main] Application initialized successfully")
  })
}

// Run main
main().catch((error) => {
  console.error("[Main] Fatal error:", error)
  electronLog.error("[Main] Fatal error:", error)
  app.quit()
  process.exit(1)
})
