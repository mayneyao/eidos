import {
  BrowserWindow,
  Menu,
  Tray,
  app,
  dialog,
  ipcMain,
  nativeImage,
} from "electron"
import { default as console, default as electronLog } from "electron-log"
import path from "path"

import { setupRegistryIpc } from "@eidos.space/electron-ipc"
import { getConfigManager } from "./services/config-manager"
import { corsManager } from "./services/cors-manager"
import { getDataSpace } from "./data-space"
import { cleanupPlaygroundWatchers } from "./file-system/playground"
import { getSpacePath } from "./file-system/space"
import { registerElectronFetchIpc } from "./lib/electron-fetch"
import { showPortInUseDialog } from "./services/port-checker"
import { ProtocolHandler } from "./services/protocol-handler"
import { initApiAgent } from "./server/api-agent"
import { startServer, type PortInUseError } from "./server/server"
import { AppLifecycleService } from "./services/app-lifecycle-service"
import { cliService } from "./services/cli-service"
import { configService } from "./services/config-service"
import { contextMenuService } from "./services/context-menu-service"
import { dataSpaceService } from "./services/data-space-service"
import { fetchService } from "./services/fetch-service"
import { fileSystemService } from "./services/file-system-service"
import { GlobalShortcutManager } from "./services/global-shortcut-manager"
import { licenseService } from "./services/license-service"
import { OpenDataService } from "./services/opendata-service"
import { PipelineService } from "./services/pipeline-service"
import { playgroundService } from "./services/playground-service"
import { relayService } from "./services/relay-service"
import { SpaceManagementService } from "./services/space-management-service"
import { syncService } from "./services/sync-service"
import { TerminalService } from "./services/terminal-service"
import { webviewService } from "./services/webview-service"
import {
  getSpaceRegistry,
  migrateFromLegacyConfig,
} from "./services/space-registry"
import { AppUpdater } from "./services/updater"
import { createWindow, windowManager } from "./window-manager/createWindow"

process.on("uncaughtException", (error) => {
  console.error("Unhandled Exception:", error) // Also log to console
  electronLog.error("Unhandled Exception:", error)
  // Consider showing an error dialog here in production
  // dialog.showErrorBox('Unhandled Exception', error.message);
  // app.quit(); // Ensure exit on error
})

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason)
  electronLog.error("Unhandled Rejection at:", promise, "reason:", reason)
  // Consider showing an error dialog here in production
  // dialog.showErrorBox('Unhandled Rejection', `${reason}`);
  // app.quit();
})

export let win: BrowserWindow | null

export function getMainWindowWebContents() {
  return win?.webContents || null
}
let appUpdater: AppUpdater
let tray: Tray | null
let protocolHandler: ProtocolHandler
let globalShortcutManager: GlobalShortcutManager | null = null
let openDataService: OpenDataService | null = null
let terminalService: TerminalService | null = null
let forceQuit = false

export const PORT = 13127

process.env["ELECTRON_DISABLE_SECURITY_WARNINGS"] = "true"
// The built directory structure
//
// ├─┬ dist
// │ ├─┬ electron
// │ │ ├── main.js
// │ │ └── preload.js
// │ ├── index.html
// │ ├── ...other-static-files-from-public
// │
process.env.DIST = path.join(__dirname, "../dist")
process.env.VITE_PUBLIC = app.isPackaged
  ? process.env.DIST
  : path.join(process.env.DIST, "../public")

// app.setName('Eidos')
// not working on windows, we just change name in package.json to eidos to avoid breaking change
// app.setPath('userData', path.join(app.getPath('appData'), 'eidos'))

/**
 * Initialize server with port conflict handling
 */
async function initializeServer(): Promise<void> {
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
        // User chose retry (either directly or after kill), continue the loop
        if (result.killed) {
          console.log("Process was killed, retrying immediately...")
        } else {
          console.log("User chose to retry, waiting for port to be freed...")
        }
        // Small delay before retry
        await new Promise((resolve) => setTimeout(resolve, 1000))
      } else {
        // Unexpected error
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

// Start server initialization
initializeServer()

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

// Set up window open handler when webview DOM is ready
// Prevents webview from opening new windows inside the app, redirects external links to system browser
// Webview IPC handlers are now handled by WebviewService
// See: services/webview-service.ts

// Config IPC handlers are now handled by ConfigService
// See: services/config-service.ts

// Data Space IPC handlers are now handled by DataSpaceService
// Note: sqlite-msg and sqlite-msg-read require event.sender for iterator callbacks
// These need manual registration to pass the event object
ipcMain.handle("sqlite-msg", async (event, payload) => {
  return dataSpaceService.sqliteMsg(event, payload)
})

ipcMain.handle("sqlite-msg-read", async (event, payload) => {
  return dataSpaceService.sqliteMsgRead(event, payload)
})

// File System IPC handlers are now handled by FileSystemService
// See: services/file-system-service.ts

// Pipeline IPC handlers are now handled by PipelineService
// See: services/pipeline-service.ts

// App lifecycle IPC handlers are now handled by AppLifecycleService
// See: services/app-lifecycle-service.ts

app.on("window-all-closed", () => {
  cleanupPlaygroundWatchers()
  getDataSpace()?.close()
  globalShortcutManager?.destroy()
  globalShortcutManager = null
  openDataService?.closeAll()
  terminalService?.cleanup()
  win = null
})

// Playground IPC handlers are now handled by PlaygroundService
// See: services/playground-service.ts

// Sync IPC handlers are now handled by SyncService
// See: services/sync-service.ts

// License IPC handlers are now handled by LicenseService
// See: services/license-service.ts

app.on("before-quit", () => {
  cleanupPlaygroundWatchers()
  openDataService?.closeAll()
  terminalService?.cleanup()
  forceQuit = true
})

function createTray() {
  if (process.platform === "darwin") {
    return
  }
  try {
    const iconPath = path.join(process.env.VITE_PUBLIC || "", "logo.png")
    electronLog.info("Tray icon path:", iconPath)

    const icon = nativeImage.createFromPath(iconPath)
    tray = new Tray(icon)

    const contextMenu = Menu.buildFromTemplate([
      { label: "show", click: () => win?.show() },
      {
        label: "exit",
        click: () => {
          forceQuit = true
          app.quit()
        },
      },
    ])

    tray.setToolTip("Eidos")
    tray.setContextMenu(contextMenu)

    electronLog.info("Tray created successfully")
  } catch (error) {
    electronLog.error("Error creating tray:", error)
  }
}

function destroyTray() {
  if (tray) {
    tray.destroy()
    tray = null
  }
}

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("eidos", process.execPath, [
      path.resolve(process.argv[1]),
    ])
  }
} else {
  app.setAsDefaultProtocolClient("eidos")
}

// Queue for protocol URLs received before app is ready
let pendingProtocolUrl: string | null = null

app.on("open-url", (event, url) => {
  event.preventDefault()
  console.log("Received protocol URL:", url)

  if (protocolHandler && win) {
    // App is ready, handle immediately
    protocolHandler.handleUrl(url)
  } else {
    // App not ready yet, queue the URL
    console.log("App not ready, queuing protocol URL")
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

/**
 * Extract spaceId from protocol URL if it's an open-space action
 */
function extractSpaceIdFromProtocolUrl(url: string): string | null {
  try {
    const urlObj = new URL(url)
    if (urlObj.hostname === "open-space" && urlObj.searchParams.has("space")) {
      return urlObj.searchParams.get("space")
    }
  } catch (error) {
    console.error("Failed to parse protocol URL:", error)
  }
  return null
}

app.whenReady().then(async () => {
  corsManager.initialize()

  // Register IPC handler for fetch proxy (bypass CORS)
  registerElectronFetchIpc()

  // Setup IPC registry for preload service discovery
  setupRegistryIpc()

  // Initialize OpenDataService for opendata adapter management
  openDataService = new OpenDataService(getSpacePath, () => win?.id)
  openDataService.register()
  configService.register()
  licenseService.register()
  fileSystemService.register()
  syncService.register()
  relayService.register()
  // Initialize TerminalService with getWindow callback
  terminalService = new TerminalService({
    getWindow: () => win,
  })
  terminalService.register()
  cliService.register()
  dataSpaceService.register()
  fetchService.register()
  contextMenuService.register()
  webviewService.register()
  playgroundService.register()

  // PipelineService requires windowManager, initialize after app is ready
  const pipelineService = new PipelineService({
    getWindowManager: () => windowManager!,
  })
  pipelineService.register()

  await migrateFromLegacyConfig()

  const registry = getSpaceRegistry()
  const configManager = getConfigManager()

  // Check if app was launched with a protocol URL
  let launchProtocolUrl: string | null = null
  let spaceIdFromProtocol: string | null = null

  // Check for pending URL from macOS 'open-url' event
  if (pendingProtocolUrl) {
    launchProtocolUrl = pendingProtocolUrl
    spaceIdFromProtocol = extractSpaceIdFromProtocolUrl(pendingProtocolUrl)
    console.log(
      "Found pending protocol URL:",
      pendingProtocolUrl,
      "-> spaceId:",
      spaceIdFromProtocol
    )
  }

  // Check for protocol URL in command line args (Windows/Linux)
  if (!launchProtocolUrl && process.platform !== "darwin") {
    const protocolUrl = process.argv.find((arg) => arg.startsWith("eidos://"))
    if (protocolUrl) {
      launchProtocolUrl = protocolUrl
      spaceIdFromProtocol = extractSpaceIdFromProtocolUrl(protocolUrl)
      console.log(
        "Found protocol URL in argv:",
        protocolUrl,
        "-> spaceId:",
        spaceIdFromProtocol
      )
    }
  }

  // Determine which space to open
  let spaceId: string | undefined

  if (spaceIdFromProtocol) {
    // Protocol URL takes precedence - validate it exists
    if (registry.validateSpace(spaceIdFromProtocol)) {
      spaceId = spaceIdFromProtocol
      console.log("Opening space from protocol URL:", spaceId)
      // Update last opened space
      configManager.setLastOpenedSpace(spaceId)
    } else {
      console.warn(`Space from protocol URL not found: ${spaceIdFromProtocol}`)
      // Fall back to last opened or first space
      spaceId = configManager.getLastOpenedSpace()
    }
  } else {
    // Normal startup - use last opened space
    spaceId = configManager.getLastOpenedSpace()
  }

  // Fallback to first available space if needed
  if (!spaceId) {
    const firstSpace = registry.getFirstSpace()
    spaceId = firstSpace?.id

    if (spaceId) {
      configManager.setLastOpenedSpace(spaceId)
    }
  }

  // Validate the final space selection
  if (spaceId && !registry.validateSpace(spaceId)) {
    console.warn(
      `Space ${spaceId} is invalid, falling back to first available space`
    )
    const firstSpace = registry.getFirstSpace()
    spaceId = firstSpace?.id
    if (spaceId) {
      configManager.setLastOpenedSpace(spaceId)
    }
  }

  // Create window with the determined spaceId
  win = createWindow(spaceId)

  // Initialize global shortcut manager (will register shortcuts when window gains focus)
  globalShortcutManager = new GlobalShortcutManager(win)

  configManager.on(
    "configChanged",
    ({ key, newValue }: { key: string; newValue: unknown }) => {
      if (key === "security") {
        console.log("security changed", newValue)
      }
    }
  )
  createTray()

  protocolHandler = new ProtocolHandler(win)

  // If there was a launch protocol URL that wasn't just open-space,
  // handle it after window loads (for other protocol actions like extension install)
  if (launchProtocolUrl && !spaceIdFromProtocol) {
    console.log("Processing non-open-space protocol URL:", launchProtocolUrl)
    pendingProtocolUrl = null

    win.webContents.once("did-finish-load", () => {
      protocolHandler?.handleUrl(launchProtocolUrl)
    })
  } else {
    // Clear the pending URL since we've already handled it by opening the right space
    pendingProtocolUrl = null
  }

  win.on("close", (event) => {
    if (!forceQuit) {
      if (process.platform === "darwin") {
        event.preventDefault()
        win?.hide()
      } else {
        cleanupPlaygroundWatchers()
        forceQuit = true
        destroyTray()
        app.quit()
      }
    }
  })
  appUpdater = new AppUpdater(win)
  appUpdater.checkForUpdates()
  initApiAgent()

  // Initialize AppLifecycleService with callbacks
  const appLifecycleService = new AppLifecycleService({
    appUpdater,
    onReloadApp: () => {
      // Reinitialize global shortcuts after reload
      if (win && globalShortcutManager) {
        globalShortcutManager.setMainWindow(win)
      }
      app.relaunch()
      win?.reload()
    },
    onQuitApp: () => {
      cleanupPlaygroundWatchers()
      forceQuit = true
      destroyTray()
      getDataSpace()?.close()
      app.quit()
    },
  })
  appLifecycleService.register()

  // Initialize and register SpaceManagementService
  const spaceManagementService = new SpaceManagementService({
    getMainWindow: () => win,
  })
  spaceManagementService.register()
})

app.on("activate", () => {
  if (win) {
    win.show()
  }
})

// quit-app is now handled by AppLifecycleService

// Fetch IPC handlers are now handled by FetchService
// See: services/fetch-service.ts

// Context menu IPC handlers are now handled by ContextMenuService
// See: services/context-menu-service.ts

// CLI installation IPC handlers
// CLI IPC handlers are now handled by CliService
// See: services/cli-service.ts
