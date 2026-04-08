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
import { TerminalService } from "./modules/terminal/terminal.module"

// Legacy imports (will be migrated gradually)
import { registerElectronFetchIpc } from "./ipc/fetch-proxy"
import { showPortInUseDialog } from "./modules/api-server/api-server.module"
import {
  SpaceRegistry,
  resolveStartupSpace,
} from "./modules/space-management/space-management.module"
import { DataSpaceManager, DataSpaceIpcService } from "./modules/data-space"
import {
  WindowService,
  GlobalShortcutsService,
  TrayService,
} from "./modules/window"
import { ProtocolHandler } from "./services/protocol-handler"
import { getSpacePath } from "./utils/paths"

// Legacy service imports (migrated to DI)
// import { cliService } from "./services/cli-service"  // Migrated to DI
// import { configService as legacyConfigService } from "./services/config-service"  // Migrated to DI
// import { contextMenuService } from "./services/context-menu-service"  // Migrated to DI
// import { dataSpaceService } from "./services/data-space/data-space-service"  // Migrated to DI
// import { fetchService } from "./services/fetch-service"  // Migrated to DI
// import { fileSystemService as legacyFileSystemService } from "./services/file-system-service"
// import { licenseService } from "./services/license-service"  // Migrated to DI
import { OpenDataService } from "./services/opendata-service"
// import { relayService } from "./services/relay-service"  // Migrated to DI
// import { SpaceManagementService } from "./services/space-management-service"  // Migrated to DI
// import { syncService as legacySyncService } from "./services/sync-service"
// import { TerminalService } from "./services/terminal-service"  // Migrated to DI
import { corsManager } from "./services/cors-manager"
import { webviewService } from "./services/webview-service"

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
let protocolHandler: ProtocolHandler
let openDataService: OpenDataService | null = null
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

  // App event handlers
  app.on("window-all-closed", () => {
    // Close dataspace via DI if available
    try {
      const dataSpaceManager = container.get(DataSpaceManager)
      dataSpaceManager.getDataSpace()?.close()
    } catch {}
    // Cleanup global shortcuts via DI
    try {
      const globalShortcutsService = container.get(GlobalShortcutsService)
      globalShortcutsService.destroy()
    } catch {}
    openDataService?.closeAll()
    // Cleanup DI terminal service
    try {
      const terminalService = container.get(TerminalService)
      terminalService.cleanup()
    } catch {}
    win = null
  })

  app.on("before-quit", () => {
    openDataService?.closeAll()
    // Cleanup DI terminal service
    try {
      const terminalService = container.get(TerminalService)
      terminalService.cleanup()
    } catch {}
    forceQuit = true
  })

  // Protocol handling
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient("eidos", process.execPath, [
        path.resolve(process.argv[1]),
      ])
    }
  } else {
    app.setAsDefaultProtocolClient("eidos")
  }

  // App ready handler
  app.whenReady().then(async () => {
    // Initialize CORS
    corsManager.initialize()

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

    // Register app-lifecycle handlers that need access to main process state
    ipcMain.handle("app-lifecycle:reloadApp", async () => {
      app.relaunch()
      win?.reload()
    })

    ipcMain.handle("app-lifecycle:quitApp", async () => {
      forceQuit = true
      // Destroy tray via DI
      try {
        const trayService = container.get(TrayService)
        trayService.destroyTray()
      } catch {}
      // Close dataspace via DI if available
      try {
        const dataSpaceManager = container.get(DataSpaceManager)
        dataSpaceManager.getDataSpace()?.close()
      } catch {}
      app.quit()
    })

    // Register legacy services (gradually migrate to DI)
    openDataService = new OpenDataService(getSpacePath, () => win?.id)
    openDataService.register()

    // Use DI ConfigService
    const configService = container.get(ConfigService)

    // Register services
    // NOTE: DI services auto-registered via bootstrap:
    // Config, FileSystem, Sync, License, Network, Cli, Terminal, DataSpace, Window

    // cliService.register()  // Migrated to DI
    // dataSpaceService.register()  // Migrated to DI - now auto-registered via DI
    // fetchService.register()  // Migrated to DI
    // contextMenuService.register()  // Migrated to DI
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

    // Protocol handler
    protocolHandler = new ProtocolHandler(win)

    // Window close handler
    win.on("close", (event) => {
      if (!forceQuit) {
        if (process.platform === "darwin") {
          event.preventDefault()
          win?.hide()
        } else {
          forceQuit = true
          trayService.destroyTray()
          app.quit()
        }
      }
    })

    // App updater (auto-registered via DI)
    const updaterService = container.get(UpdaterService)
    updaterService.initialize()
    updaterService.checkForUpdates()

    // App lifecycle service (auto-registered via DI)
    // Note: reloadApp and quitApp handlers are registered via IPC in main process
    // SpaceManagementService is auto-registered via DI

    console.log("[Main] Application initialized successfully")
  })

  app.on("activate", () => {
    const windowService = container.get(WindowService)
    windowService.showWindow()
  })

  // Protocol URL handling
  let pendingProtocolUrl: string | null = null

  app.on("open-url", (event, url) => {
    event.preventDefault()
    console.log("Received protocol URL:", url)
    if (protocolHandler && win) {
      protocolHandler.handleUrl(url)
    } else {
      pendingProtocolUrl = url
    }
  })

  app.on("second-instance", (event, commandLine) => {
    const protocolUrl = commandLine.find((arg) => arg.startsWith("eidos://"))
    if (protocolUrl && protocolHandler) {
      protocolHandler.handleUrl(protocolUrl)
    }
    const windowService = container.get(WindowService)
    if (windowService.isWindowMinimized()) {
      windowService.restoreWindow()
    }
    windowService.focusWindow()
  })
}

// Run main
main().catch((error) => {
  console.error("[Main] Fatal error:", error)
  electronLog.error("[Main] Fatal error:", error)
  app.quit()
  process.exit(1)
})
