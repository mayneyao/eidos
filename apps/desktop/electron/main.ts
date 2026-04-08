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

import type { BrowserWindow } from "electron"
import { app, ipcMain } from "electron"
import { default as console, default as electronLog } from "electron-log"
import path from "path"

// DI System
import { AppModule } from "./app.module"
import { bootstrap, container } from "./common/di"

// Import services for backward compatibility
import { ConfigManager, ConfigService } from "./modules/config/config.module"

// Legacy imports (will be migrated gradually)
import { showPortInUseDialog } from "./modules/api-server/api-server.module"
import { DataSpaceIpcService } from "./modules/data-space"
import { registerElectronFetchIpc } from "./modules/network/fetch-proxy"
import {
  SpaceRegistry,
  resolveStartupSpace,
} from "./modules/space-management/space-management.module"
import {
  AppLifecycleService,
  GlobalShortcutsService,
  ProtocolService,
  TrayService,
  WebviewService,
  WindowService,
} from "./modules/window"

// Legacy service imports (migrated to DI)
// import { cliService } from "./services/cli-service"  // Migrated to DI
// import { configService as legacyConfigService } from "./services/config-service"  // Migrated to DI
// import { contextMenuService } from "./services/context-menu-service"  // Migrated to DI
// import { dataSpaceService } from "./services/data-space/data-space-service"  // Migrated to DI
// import { fetchService } from "./services/fetch-service"  // Migrated to DI
// import { fileSystemService as legacyFileSystemService } from "./services/file-system-service"
// import { licenseService } from "./services/license-service"  // Migrated to DI
// import { OpenDataService } from "./services/opendata-service"  // Migrated to DI
import { OpenDataService } from "./modules/opendata"
// import { relayService } from "./services/relay-service"  // Migrated to DI
// import { SpaceManagementService } from "./services/space-management-service"  // Migrated to DI
// import { syncService as legacySyncService } from "./services/sync-service"
// import { TerminalService } from "./services/terminal-service"  // Migrated to DI
// import { corsManager } from "./services/cors-manager"  // Migrated to DI
// import { webviewService } from "./services/webview-service"  // Migrated to DI
import { CorsService } from "./modules/network/network.module"

// DI imports for window providers
import {
  ApiServerService,
  type PortInUseError,
} from "./modules/api-server/api-server.module"
import { MainWindowProvider } from "./modules/space-management/space-management.module"
import { TerminalWindowProvider } from "./modules/terminal/terminal.module"
import { UpdaterService } from "./modules/updater/updater.module"

// Export main window for other modules
export let win: BrowserWindow | null
export function getMainWindowWebContents() {
  const windowService = container.get(WindowService)
  return windowService.getMainWindowWebContents()
}

// App state
// let openDataService: OpenDataService | null = null  // Now via DI
// let terminalService: TerminalService | null =  // Now via DI
// let globalShortcutManager: GlobalShortcutsService | null = null  // Now via DI
let forceQuit = false

export const PORT = 13127

// Disable security warnings in development
process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true"
process.env.DIST = path.join(__dirname, "../dist")
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, "../public")

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

  // Bootstrap DI container
  console.log("[Main] Bootstrapping DI container...")
  await bootstrap(AppModule, {
    autoRegisterIpc: true,
    setupRegistry: true,
  })

  // Initialize server first
  await initializeServer()

  // Check for single instance
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    process.exit(0)
  }

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

    // Set up app lifecycle handlers
    const appLifecycleService = container.get(AppLifecycleService)
    appLifecycleService.setupLifecycleHandlers(
      () => {
        forceQuit = true
      },
      () => {
        win = null
      }
    )
    appLifecycleService.registerIpcHandlers(
      () => forceQuit,
      (value) => {
        forceQuit = value
      },
      () => win
    )

    // Initialize OpenDataService via DI
    const openDataService = container.get(OpenDataService)
    openDataService.register()

    // Use DI ConfigService
    const configService = container.get(ConfigService)

    // Register services
    // NOTE: DI services auto-registered via bootstrap:
    // Config, FileSystem, Sync, License, Network, Cli, Terminal, DataSpace, Window, OpenData

    // cliService.register()  // Migrated to DI
    // dataSpaceService.register()  // Migrated to DI - now auto-registered via DI
    // fetchService.register()  // Migrated to DI
    // contextMenuService.register()  // Migrated to DI
    // webviewService.register()  // Migrated to DI - now auto-registered via DI

    // Initialize window-related DI services
    const webviewService = container.get(WebviewService)
    webviewService.register()

    // Migrate legacy config
    const spaceRegistry = container.get(SpaceRegistry)
    await spaceRegistry.migrateFromLegacyConfig()

    // Determine startup space
    let spaceId = resolveStartupSpace(null, spaceRegistry)

    // Get WindowService and create window
    const windowService = container.get(WindowService)
    windowService.setPort(PORT)
    win = windowService.createWindow(spaceId)

    // Setup window providers (must be after win is created)
    const terminalWindowProvider = container.get(TerminalWindowProvider)
    terminalWindowProvider.setWindowProvider(() => win)

    const mainWindowProvider = container.get(MainWindowProvider)
    mainWindowProvider.setWindowProvider(() => win)

    // Initialize global shortcuts service
    const globalShortcutsService = container.get(GlobalShortcutsService)
    globalShortcutsService.setupWindowFocusListeners()

    // Config change listener
    const configManager = container.get(ConfigManager)

    configManager.on(
      "configChanged",
      ({ key, newValue }: { key: string; newValue: unknown }) => {
        if (key === "security") {
          console.log("security changed", newValue)
        }
      }
    )

    // Create tray via DI
    const trayService = container.get(TrayService)
    trayService.createTray(() => {
      forceQuit = true
    })

    // Protocol handler via DI
    const protocolService = container.get(ProtocolService)

    // Register as default protocol client for eidos://
    protocolService.registerProtocolClient()

    // Handle any pending protocol URL (received before window was created)
    protocolService.handlePendingProtocolUrl()

    // Set up window close handler
    windowService.setupCloseHandler(
      win,
      () => forceQuit,
      (value) => {
        forceQuit = value
      }
    )

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
