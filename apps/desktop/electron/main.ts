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

import { BrowserWindow, app, dialog, ipcMain } from "electron"
import { default as console, default as electronLog } from "electron-log"
import path from "path"

// DI System
import { bootstrap, container, getService } from "./common/di"
import { AppModule } from "./app.module"

// Import services for backward compatibility
import { ConfigService, ConfigManager } from "./modules/config/config.module"
import { FileSystemService } from "./modules/file-system/file-system.module"
import { SyncService, CredentialsManager } from "./modules/sync/sync.module"

// Legacy imports (will be migrated gradually)
import { getSpacePath } from "./utils/paths"
import { registerElectronFetchIpc } from "./ipc/fetch-proxy"
import { showPortInUseDialog } from "./services/port-checker"
import { ProtocolHandler } from "./services/protocol-handler"
import { initApiAgent } from "./core/server/api-agent"
import { setServerContext } from "./core/server/context"
import { startServer, type PortInUseError } from "./core/server/server"
import {
  getOrSetDataSpace,
  getDataSpace,
} from "./services/data-space/data-space-manager"
import { isPortInUse, getProcessByPort } from "./services/port-checker"
import { GlobalShortcutManager } from "./window/global-shortcuts"
import { AppUpdater } from "./services/updater"
import { createWindow } from "./window/create-window"
import { createTray, destroyTray } from "./window/tray-manager"
import {
  getSpaceRegistry,
  migrateFromLegacyConfig,
  resolveStartupSpace,
} from "./services/space-registry"

// Legacy service imports
import { AppLifecycleService } from "./services/app-lifecycle-service"
import { cliService } from "./services/cli-service"
import { configService as legacyConfigService } from "./services/config-service"
import { contextMenuService } from "./services/context-menu-service"
import { dataSpaceService } from "./services/data-space/data-space-service"
import { fetchService } from "./services/fetch-service"
// import { fileSystemService as legacyFileSystemService } from "./services/file-system-service"
import { licenseService } from "./services/license-service"
import { OpenDataService } from "./services/opendata-service"
import { relayService } from "./services/relay-service"
import { SpaceManagementService } from "./services/space-management-service"
// import { syncService as legacySyncService } from "./services/sync-service"
import { TerminalService } from "./services/terminal-service"
import { webviewService } from "./services/webview-service"
import { BrowserViewManager } from "./window/browser-view-manager"
import { corsManager } from "./services/cors-manager"

// Export main window for other modules
export let win: BrowserWindow | null
export function getMainWindowWebContents() {
  return win?.webContents || null
}

// App state
let appUpdater: AppUpdater
let protocolHandler: ProtocolHandler
let globalShortcutManager: GlobalShortcutManager | null = null
let openDataService: OpenDataService | null = null
let terminalService: TerminalService | null = null
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
  // Get DI services
  let configManager: ConfigManager
  let credentialsManager: CredentialsManager

  try {
    configManager = getService(ConfigManager)
    credentialsManager = getService(CredentialsManager)
  } catch (e) {
    console.error("Failed to get DI services, falling back to legacy", e)
    // Fallback to legacy
    const { getConfigManager } = await import("./services/config-manager")
    const { CredentialsManager: LegacyCM } =
      await import("./services/credentials")
    configManager = getConfigManager() as any
    credentialsManager = LegacyCM as any
  }

  // Broadcast auth state change
  const broadcastAuthStateChange = (
    authenticated: boolean,
    user?: {
      id: string
      email?: string
      name?: string
      picture?: string
    } | null
  ) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send("auth-state-changed", { authenticated, user })
    })
  }

  setServerContext({
    dataSpaceManager: { getOrSetDataSpace, getDataSpace },
    configManager: {
      get: (key: string) => configManager.get(key as any),
      set: (key: string, value: any) => configManager.set(key as any, value),
      getDefaultSyncProvider: () => configManager.getDefaultSyncProvider(),
      getSyncProvider: (id: string) => configManager.getSyncProvider(id),
      on: (event: string, callback: Function) =>
        configManager.on(event, callback as any),
    },
    spaceRegistry: {
      getSpace: (id: string) => getSpaceRegistry().getSpace(id),
      getAllSpaces: () => getSpaceRegistry().getAllSpaces(),
      validateSpace: (id: string) => getSpaceRegistry().validateSpace(id),
    },
    portChecker: { isPortInUse, getProcessByPort },
    credentialsManager: {
      getSyncCredentials: (providerId: string) =>
        credentialsManager.getSyncCredentials(providerId),
      getTokens: () => credentialsManager.getTokens(),
      setTokens: (tokens) => credentialsManager.setTokens(tokens),
      getUserInfo: () => credentialsManager.getUserInfo(),
      setUserInfo: (userInfo) => credentialsManager.setUserInfo(userInfo),
      isAuthenticated: () => credentialsManager.isAuthenticated(),
      clearAll: () => credentialsManager.clearAll(),
      getAccessToken: () => credentialsManager.getAccessToken(),
    },
    broadcastAuthStateChange,
    logger: electronLog,
  })

  while (true) {
    try {
      await startServer({ dist: process.env.DIST, port: PORT })
      console.log(`Server started successfully on port ${PORT}`)
      return
    } catch (error) {
      const portError = error as PortInUseError
      if (portError.port && portError.port === PORT) {
        console.error(`Port ${PORT} is in use:`, error)
        const result = await showPortInUseDialog(PORT, portError.processInfo)
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
        await new Promise((resolve) => setTimeout(resolve, 1000))
      } else {
        console.error("Failed to start server:", error)
        await dialog.showErrorBox(
          "Server Error",
          `Failed to start Eidos server: ${error instanceof Error ? error.message : String(error)}`
        )
        app.quit()
        process.exit(1)
      }
    }
  }
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
    getDataSpace()?.close()
    globalShortcutManager?.destroy()
    globalShortcutManager = null
    openDataService?.closeAll()
    terminalService?.cleanup()
    win = null
  })

  app.on("before-quit", () => {
    openDataService?.closeAll()
    terminalService?.cleanup()
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
    ipcMain.handle("sqlite-msg", async (event, payload) => {
      return dataSpaceService.sqliteMsg(event, payload)
    })

    ipcMain.handle("sqlite-msg-read", async (event, payload) => {
      return dataSpaceService.sqliteMsgRead(event, payload)
    })

    // Register legacy services (gradually migrate to DI)
    openDataService = new OpenDataService(getSpacePath, () => win?.id)
    openDataService.register()

    // Use DI services where available
    const configService = container.isBound(ConfigService)
      ? container.get(ConfigService)
      : legacyConfigService

    // Register services
    // NOTE: DI services (Config, FileSystem, Sync) are auto-registered via bootstrap
    // legacyConfigService.register()  // Migrated to DI
    licenseService.register()
    // legacyFileSystemService.register()  // Migrated to DI
    // legacySyncService.register()  // Migrated to DI
    relayService.register()

    terminalService = new TerminalService({ getWindow: () => win })
    terminalService.register()

    cliService.register()
    dataSpaceService.register()
    fetchService.register()
    contextMenuService.register()
    webviewService.register()

    // Migrate legacy config
    await migrateFromLegacyConfig()

    // Determine startup space
    let spaceId = resolveStartupSpace(null)

    // Create window
    win = createWindow(spaceId)

    // Initialize window-related services
    const browserViewManager = new BrowserViewManager(win)
    browserViewManager.register()

    globalShortcutManager = new GlobalShortcutManager(win)

    // Config change listener
    const configManager = container.isBound(ConfigManager)
      ? container.get(ConfigManager)
      : (legacyConfigService as any)

    configManager.on(
      "configChanged",
      ({ key, newValue }: { key: string; newValue: unknown }) => {
        if (key === "security") {
          console.log("security changed", newValue)
        }
      }
    )

    // Create tray
    createTray({
      getWindow: () => win,
      onQuit: () => {
        forceQuit = true
      },
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
          destroyTray()
          app.quit()
        }
      }
    })

    // App updater
    appUpdater = new AppUpdater(win)
    appUpdater.checkForUpdates()
    initApiAgent()

    // App lifecycle service
    const appLifecycleService = new AppLifecycleService({
      appUpdater,
      onReloadApp: () => {
        if (win && globalShortcutManager) {
          globalShortcutManager.setMainWindow(win)
        }
        app.relaunch()
        win?.reload()
      },
      onQuitApp: () => {
        forceQuit = true
        destroyTray()
        getDataSpace()?.close()
        app.quit()
      },
    })
    appLifecycleService.register()

    // Space management service
    const spaceManagementService = new SpaceManagementService({
      getMainWindow: () => win,
    })
    spaceManagementService.register()

    console.log("[Main] Application initialized successfully")
  })

  app.on("activate", () => {
    if (win) {
      win.show()
    }
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
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })
}

// Run main
main().catch((error) => {
  console.error("[Main] Fatal error:", error)
  electronLog.error("[Main] Fatal error:", error)
  app.quit()
  process.exit(1)
})
