import fs from "fs/promises"
import path from "path"
import { fetchAvailableModels } from "@/packages/ai/helper"
import { BucketClient } from "@/packages/sync/bucket"
import {
  BrowserWindow,
  Menu,
  Tray,
  app,
  dialog,
  ipcMain,
  nativeImage,
  shell,
  webContents,
} from "electron"
import { default as console, default as electronLog } from "electron-log"

import { MsgType } from "@/lib/const"

import { getConfigManager } from "./config"
import { corsManager } from "./cors-manager"
import { CredentialsManager } from "./credentials"
import { DataSpaceProcessPool } from "./data-space/process-pool"
import {
  closeDataSpace,
  getCurrentSpaceId,
  getDataSpace,
  getOrSetDataSpace,
  reloadDataSpace,
} from "./data-space"
import {
  cleanupPlaygroundWatchers,
  initializePlayground,
} from "./file-system/playground"
import { ProtocolHandler } from "./protocol-handler"
import { getApiAgentStatus, initApiAgent } from "./server/api-agent"
import { type PortInUseError, startServer } from "./server/server"
import {
  formatProcessInfo,
  getKillCommand,
  isProcessRunning,
  killProcess,
  type PortOccupancyInfo,
} from "./port-checker"
import { GlobalShortcutManager } from "./services/global-shortcut-manager"
import { terminalService } from "./services/terminal-service"
import {
  getCliBinaryPath,
  installCli,
  isCliInstalled,
  uninstallCli,
} from "./services/cli-installer"
import { getSpaceRegistry, migrateFromLegacyConfig } from "./space-registry"
import { AppUpdater } from "./updater"
import { createWindow, windowManager } from "./window-manager/createWindow"
import { convertToElectronMenuTemplateWithIds } from "./window-manager/menu-utils"
import { LicenseManager } from "./license"
import { registerElectronFetchIpc } from "./lib/electron-fetch"

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
 * Show port in use dialog with process information
 * Returns the user's choice and whether the process was killed
 */
async function showPortInUseDialog(
  port: number,
  processInfo?: PortOccupancyInfo | null
): Promise<{ action: "retry" | "exit"; killed: boolean }> {
  const hasProcessInfo = processInfo && processInfo.pid
  const killCmd = hasProcessInfo ? getKillCommand(processInfo) : null

  const buildDetailMessage = () => {
    const detailLines: string[] = [
      `The port ${port} required by Eidos is already in use by another process.`,
      "",
    ]

    if (processInfo) {
      detailLines.push(formatProcessInfo(processInfo))
      detailLines.push("")
    }

    if (killCmd) {
      detailLines.push(
        `You can click "Kill Process" to automatically terminate it, or run the following command manually:`
      )
      detailLines.push(``)
      detailLines.push(`${killCmd}`)
      detailLines.push(``)
    }

    detailLines.push("Please stop the conflicting process and try again.")
    return detailLines.join("\n")
  }

  // Buttons: Kill Process (if applicable), Retry, Exit
  const buttons = hasProcessInfo
    ? ["Kill Process", "Retry", "Exit"]
    : ["Retry", "Exit"]

  const result = await dialog.showMessageBox({
    type: "warning",
    title: "Port Already in Use",
    message: `Eidos cannot start because port ${port} is occupied`,
    detail: buildDetailMessage(),
    buttons,
    defaultId: hasProcessInfo ? 1 : 0, // Default to Retry
    cancelId: hasProcessInfo ? 2 : 1, // Cancel maps to Exit
  })

  // Handle button clicks
  if (hasProcessInfo) {
    // Button order: ["Kill Process", "Retry", "Exit"]
    switch (result.response) {
      case 0: // Kill Process
        if (processInfo.pid) {
          // Check if process is still running
          if (!isProcessRunning(processInfo.pid)) {
            // Process already exited
            await dialog.showMessageBox({
              type: "info",
              title: "Process Already Terminated",
              message: "The process has already been terminated.",
              buttons: ["Retry"],
              defaultId: 0,
            })
            return { action: "retry", killed: true }
          }

          const success = await killProcess(processInfo.pid)
          if (success) {
            // Verify the process is actually gone
            await new Promise((resolve) => setTimeout(resolve, 500))
            if (!isProcessRunning(processInfo.pid)) {
              await dialog.showMessageBox({
                type: "info",
                title: "Process Killed",
                message: `Process ${processInfo.processName || processInfo.pid} has been terminated.`,
                buttons: ["Continue"],
                defaultId: 0,
              })
              return { action: "retry", killed: true }
            }
          }

          // Kill failed
          const retryResult = await dialog.showMessageBox({
            type: "error",
            title: "Failed to Kill Process",
            message: `Unable to terminate process ${processInfo.processName || processInfo.pid}.`,
            detail:
              "The process may require elevated privileges (administrator/root) to terminate.",
            buttons: ["Retry", "Exit"],
            defaultId: 0,
          })
          return {
            action: retryResult.response === 0 ? "retry" : "exit",
            killed: false,
          }
        }
        return { action: "retry", killed: false }

      case 1: // Retry
        return { action: "retry", killed: false }

      case 2: // Exit
      default:
        return { action: "exit", killed: false }
    }
  } else {
    // Button order: ["Retry", "Exit"]
    return {
      action: result.response === 0 ? "retry" : "exit",
      killed: false,
    }
  }
}

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
ipcMain.on("webview-dom-ready", (_, id) => {
  const wc = webContents.fromId(id)
  wc?.setWindowOpenHandler(({ url }) => {
    const protocol = new URL(url).protocol
    // Only allow http and https protocol external links to open in system browser
    if (["https:", "http:"].includes(protocol)) {
      shell.openExternal(url)
    }
    // Deny other types of window open requests to maintain app security
    return { action: "deny" }
  })
})

ipcMain.handle("get-app-data-folder", () => {
  return getConfigManager().get("dataFolder")
})

ipcMain.handle("get-config", (event, key) => {
  return getConfigManager().get(key)
})

ipcMain.handle("set-config", (event, key, value) => {
  getConfigManager().set(key, value)
})

ipcMain.handle("get-ai-config", () => {
  return getConfigManager().get("ai")
})

ipcMain.handle("get-user-config-path", () => {
  return path.join(app.getPath("userData"), "config.json")
})

ipcMain.handle("sqlite-msg", async (event, payload) => {
  try {
    let dataSpace = getDataSpace()
    const { space, dbName } = payload.data
    const spaceId = space || dbName

    if (!spaceId) {
      throw new Error("No space ID provided in sqlite-msg")
    }

    const currentSpaceId = getCurrentSpaceId()
    if (!dataSpace || !currentSpaceId) {
      dataSpace = await getOrSetDataSpace(spaceId)
    } else if (spaceId !== currentSpaceId) {
      electronLog.info("switching to data space", spaceId)
      dataSpace = await getOrSetDataSpace(spaceId)
    }

    if (!dataSpace) {
      throw new Error("Failed to initialize data space")
    }

    const res = await (dataSpace as any)._executePayload(
      payload.data,
      payload.id,
      (msg: any) => {
        event.sender.send(`sqlite-iterator-${payload.id}`, msg)
      }
    )

    return res
  } catch (error) {
    console.error("sqlite-msg error:", error)

    // Special handling for "An object could not be cloned" error
    if (
      error instanceof Error &&
      error.message.includes("An object could not be cloned")
    ) {
      console.error("CLONING ERROR DETAILS:")
      console.error("- Error message:", error.message)
      console.error("- Error stack:", error.stack)
      console.error("- Payload method:", payload.data?.method)
      console.error("- Payload params count:", payload.data?.params?.length)
      console.error("- Payload params:", payload.data?.params)

      // Try to inspect the payload data
      try {
        console.error("- Payload data keys:", Object.keys(payload.data || {}))
        console.error(
          "- Payload data types:",
          Object.fromEntries(
            Object.entries(payload.data || {}).map(([k, v]) => [k, typeof v])
          )
        )
      } catch (inspectError) {
        console.error("- Failed to inspect payload:", inspectError)
      }
    }

    throw error
  }
})

ipcMain.handle("sqlite-msg-read", async (event, payload) => {
  try {
    let dataSpace = getDataSpace()
    const { space, dbName } = payload.data
    const spaceId = space || dbName

    if (!spaceId) {
      throw new Error("No space ID provided in sqlite-msg-read")
    }

    const currentSpaceId = getCurrentSpaceId()
    if (!dataSpace || !currentSpaceId) {
      dataSpace = await getOrSetDataSpace(spaceId)
    } else if (spaceId !== currentSpaceId) {
      electronLog.info("switching to data space", spaceId)
      dataSpace = await getOrSetDataSpace(spaceId)
    }

    if (!dataSpace) {
      throw new Error("Failed to initialize data space")
    }

    const res = await (dataSpace as any)._executePayload(
      payload.data,
      payload.id,
      (msg: any) => {
        event.sender.send(`sqlite-iterator-${payload.id}`, msg)
      }
    )

    return res
  } catch (error) {
    console.error("sqlite-msg-read error:", error)

    // Special handling for "An object could not be cloned" error
    if (
      error instanceof Error &&
      error.message.includes("An object could not be cloned")
    ) {
      console.error("CLONING ERROR DETAILS:")
      console.error("- Error message:", error.message)
      console.error("- Error stack:", error.stack)
      console.error("- Payload method:", payload.data?.method)
      console.error("- Payload params count:", payload.data?.params?.length)
      console.error("- Payload params:", payload.data?.params)
      console.error(
        "- Payload data keys:",
        payload.data ? Object.keys(payload.data) : "no data"
      )
      console.error(
        "- Payload data types:",
        payload.data
          ? Object.fromEntries(
              Object.entries(payload.data).map(([k, v]) => [k, typeof v])
            )
          : "no data"
      )
    }

    throw error
  }
})

ipcMain.handle(MsgType.SwitchDatabase, (event, args) => {
  const { databaseName, id } = args
  // Perform the database switch logic here
  const data = { dbName: databaseName } // Example response data
  getOrSetDataSpace(databaseName)
  return { id, data }
})

ipcMain.handle(MsgType.Pull, async (event, args) => {
  const { spaceName } = args
  const dataSpace = await getOrSetDataSpace(spaceName)
  return dataSpace?.pull()
})

ipcMain.handle(MsgType.Push, async (event, args) => {
  const { spaceName } = args
  const dataSpace = await getOrSetDataSpace(spaceName)
  return dataSpace?.push()
})

ipcMain.handle(MsgType.Fetch, async (event, args) => {
  const { spaceName } = args
  const dataSpace = await getOrSetDataSpace(spaceName)
  return dataSpace?.fetch()
})

ipcMain.handle(MsgType.Hydrate, async (event, args) => {
  const { spaceName } = args
  const dataSpace = await getOrSetDataSpace(spaceName)
  return dataSpace?.hydrate()
})

ipcMain.handle(MsgType.Snapshot, async (event, args) => {
  const { spaceName } = args
  const dataSpace = await getOrSetDataSpace(spaceName)
  return dataSpace?.snapshot()
})
ipcMain.handle(MsgType.Status, async (event, args) => {
  const { spaceName } = args
  const dataSpace = await getOrSetDataSpace(spaceName)
  return dataSpace?.status()
})

ipcMain.handle(MsgType.Volumes, async (event, args) => {
  const { spaceName } = args
  const dataSpace = await getOrSetDataSpace(spaceName)
  return dataSpace?.volumes()
})

ipcMain.handle(MsgType.CreateSpace, async (event, args) => {
  const { spaceName, enableSync } = args
  const data = { spaceName }
  const dataSpace = await getOrSetDataSpace(spaceName)
  if (dataSpace) {
    return { data, success: true }
  } else {
    return { data, success: false }
  }
})

ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
  })

  if (result.canceled) {
    return undefined
  } else {
    return result.filePaths[0]
  }
})

ipcMain.handle("show-in-file-manager", async (event, path) => {
  if (path) {
    try {
      const stats = await fs.stat(path)
      if (stats.isFile()) {
        shell.showItemInFolder(path)
      } else {
        shell.openPath(path)
      }
    } catch (error) {
      electronLog.error("Error accessing path:", error)
      return { success: false, error: "Failed to access path" }
    }
  } else {
    electronLog.warn("No path provided")
    return { success: false, error: "No path provided" }
  }
  return { success: true }
})

ipcMain.handle("open-url", async (event, url) => {
  if (!url || typeof url !== "string") {
    electronLog.warn("Invalid URL provided")
    return { success: false, error: "Invalid URL provided" }
  }

  try {
    await shell.openExternal(url)
    electronLog.info(`URL opened successfully: ${url}`)
    return { success: true }
  } catch (error) {
    electronLog.error(`Error opening URL: ${error}`)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
})

ipcMain.handle(
  "browser-view:open",
  (_, viewId: string, url: string, bounds) => {
    windowManager?.browserViewManager.create(viewId, url, bounds)
    return { success: true }
  }
)

ipcMain.handle("browser-view:update-bounds", (_, viewId: string, bounds) => {
  windowManager?.browserViewManager.updateBounds(viewId, bounds)
  return { success: true }
})

ipcMain.handle("browser-view:close", (_, viewId: string) => {
  windowManager?.browserViewManager.close(viewId)
  return { success: true }
})

ipcMain.handle("browser-view:close-all", () => {
  windowManager?.browserViewManager.closeAll()
  return { success: true }
})

ipcMain.handle("browser-view:reload", (_, viewId: string) => {
  windowManager?.browserViewManager.reload(viewId)
  return { success: true }
})

ipcMain.handle("browser-view:go-back", (_, viewId: string) => {
  windowManager?.browserViewManager.goBack(viewId)
  return { success: true }
})

ipcMain.handle("browser-view:go-forward", (_, viewId: string) => {
  windowManager?.browserViewManager.goForward(viewId)
  return { success: true }
})

ipcMain.handle("browser-view:load-url", (_, viewId: string, url: string) => {
  windowManager?.browserViewManager.loadURL(viewId, url)
  return { success: true }
})

ipcMain.handle(
  "browser-view:set-visible",
  (_, viewId: string, visible: boolean) => {
    windowManager?.browserViewManager.setVisible(viewId, visible)
    return { success: true }
  }
)

ipcMain.handle("browser-view:capture-page", async (_, viewId: string) => {
  const dataUrl = await windowManager?.browserViewManager.capturePage(viewId)
  return { success: !!dataUrl, dataUrl }
})

ipcMain.on("browser-view:close-all", () => {
  windowManager?.browserViewManager.closeAll()
})

ipcMain.handle("pipeline:run", async (_, steps, args, options) => {
  try {
    const { result, logs, rendererLogs } =
      await windowManager!.pipelineRunner.run(steps, args, options)
    return { success: true, result, logs, rendererLogs }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
})

ipcMain.handle("reload-app", () => {
  // Reinitialize global shortcuts after reload
  if (win && globalShortcutManager) {
    globalShortcutManager.setMainWindow(win)
    // GlobalShortcutManager will handle registration based on focus state
  }
  app.relaunch()
  win?.reload()
})

app.on("window-all-closed", () => {
  cleanupPlaygroundWatchers()
  getDataSpace()?.close()
  globalShortcutManager?.destroy()
  globalShortcutManager = null
  terminalService.cleanup()
  win = null
})

ipcMain.handle("check-for-updates", () => {
  appUpdater.checkForUpdatesManually()
})

ipcMain.handle("quit-and-install", () => {
  forceQuit = true
  appUpdater.quitAndInstall()
})

ipcMain.handle("initialize-playground", (event, space, blockId, files) => {
  return initializePlayground(space, blockId, files)
})

// Credentials management
ipcMain.handle(
  "set-sync-credentials",
  async (event, credentials, providerId) => {
    return CredentialsManager.setSyncCredentials(credentials, providerId)
  }
)

ipcMain.handle("get-sync-credentials", async (event, providerId) => {
  return CredentialsManager.getSyncCredentials(providerId)
})

ipcMain.handle("clear-sync-credentials", async (event, providerId) => {
  return CredentialsManager.clearSyncCredentials(providerId)
})

ipcMain.handle("has-sync-credentials", async (event, providerId) => {
  return CredentialsManager.hasSyncCredentials(providerId)
})

ipcMain.handle("pull-relay-messages", async (event, spaceId) => {
  const processPool = DataSpaceProcessPool.getInstance()
  processPool.sendToProcess(spaceId, { type: "pull-relay-messages" })
  return { success: true }
})

ipcMain.handle("get-relay-messages", async (event, spaceId, data) => {
  const processPool = DataSpaceProcessPool.getInstance()
  return processPool.callProcess(spaceId, "get-relay-messages", data)
})

ipcMain.handle("ack-relay-messages", async (event, spaceId, data) => {
  const processPool = DataSpaceProcessPool.getInstance()
  return processPool.callProcess(spaceId, "ack-relay-messages", data)
})

ipcMain.handle("get-relay-channel-counts", async (event, spaceId, data) => {
  const processPool = DataSpaceProcessPool.getInstance()
  return processPool.callProcess(spaceId, "get-relay-channel-counts", data)
})

ipcMain.handle("get-relay-total-counts", async (event, spaceId) => {
  const processPool = DataSpaceProcessPool.getInstance()
  return processPool.callProcess(spaceId, "get-relay-total-counts", {})
})

// Get all available sync providers (including eidos.space if connected)
ipcMain.handle("get-sync-providers", async () => {
  try {
    const configManager = getConfigManager()
    const syncConfig = configManager.getSyncConfig()
    const accountUser = configManager.getAccountUser()

    // Build list of providers with their credential status
    const providers: Array<{
      id: string
      name: string
      endpoint?: string
      bucketName?: string
      hasCredentials: boolean
      isBuiltIn: boolean
    }> = []

    // Check if eidos.space should be shown
    // Only show if user has configured eidos.space credentials
    const hasEidosSpaceCreds =
      await CredentialsManager.hasSyncCredentials("eidos.space")

    if (hasEidosSpaceCreds) {
      // For eidos.space, bucketName comes from credentials, not config
      const credentials =
        await CredentialsManager.getSyncCredentials("eidos.space")
      providers.push({
        id: "eidos.space",
        name: "eidos.space",
        bucketName: credentials?.bucketName, // Get bucketName from credentials
        hasCredentials: true,
        isBuiltIn: true,
      })
    }

    // Add custom providers from config (bucketName comes from config)
    for (const [id, provider] of Object.entries(syncConfig.providers)) {
      const hasCreds = await CredentialsManager.hasSyncCredentials(id)
      providers.push({
        id,
        name: provider.name || id,
        endpoint: provider.endpoint,
        bucketName: provider.bucketName, // Get bucketName from config
        hasCredentials: hasCreds,
        isBuiltIn: false,
      })
    }

    return {
      success: true,
      providers,
      defaultProvider: syncConfig.defaultProvider,
    }
  } catch (error) {
    console.error("Failed to get sync providers:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
})

ipcMain.handle("list-remote-spaces", async (event, providerId: string) => {
  try {
    // Get sync credentials for the provider
    const credentials = await CredentialsManager.getSyncCredentials(providerId)
    if (!credentials) {
      return { success: false, error: "No credentials found for provider" }
    }

    // Create S3 client with the credentials
    const s3Client = new BucketClient({
      endpoint: credentials.endpoint,
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      bucketName: credentials.bucketName,
    })

    // List root folders (remote spaces)
    const spaces = await s3Client.listRootFolders(credentials.bucketName)

    return { success: true, spaces }
  } catch (error) {
    console.error("Failed to list remote spaces:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
})

// Test sync connection with provided credentials
ipcMain.handle(
  "test-sync-connection",
  async (
    event,
    config: {
      endpoint: string
      bucketName: string
      region?: string
      accessKeyId: string
      secretAccessKey: string
    }
  ) => {
    try {
      // Create S3 client with the provided credentials
      const s3Client = new BucketClient({
        endpoint: config.endpoint,
        region: config.region,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        bucketName: config.bucketName,
      })

      // Try to list root folders to verify connection
      // This will fail if credentials are invalid or bucket doesn't exist
      await s3Client.listRootFolders(config.bucketName)

      return {
        success: true,
        message: "Connection successful! Bucket is accessible.",
      }
    } catch (error) {
      console.error("Failed to test sync connection:", error)

      // Provide more user-friendly error messages
      let errorMessage =
        error instanceof Error ? error.message : "Unknown error"

      // Parse common S3 errors
      if (errorMessage.includes("InvalidAccessKeyId")) {
        errorMessage = "Invalid Access Key ID. Please check your credentials."
      } else if (errorMessage.includes("SignatureDoesNotMatch")) {
        errorMessage =
          "Invalid Secret Access Key. Please check your credentials."
      } else if (errorMessage.includes("NoSuchBucket")) {
        errorMessage = `Bucket "${config.bucketName}" does not exist. Please check the bucket name.`
      } else if (
        errorMessage.includes("Forbidden") ||
        errorMessage.includes("403")
      ) {
        errorMessage =
          "Access denied. Please check your permissions or credentials."
      } else if (
        errorMessage.includes("ENOTFOUND") ||
        errorMessage.includes("ECONNREFUSED")
      ) {
        errorMessage =
          "Cannot connect to the endpoint. Please check the endpoint URL."
      }

      return {
        success: false,
        error: errorMessage,
      }
    }
  }
)

// Clone a space from remote
ipcMain.handle(
  "clone-space",
  async (
    _,
    {
      localPath,
      remoteUrl,
      providerId,
      spaceName,
    }: {
      localPath: string
      remoteUrl: string
      providerId: string
      spaceName?: string
    }
  ) => {
    try {
      const registry = getSpaceRegistry()

      // 1. Register the space first
      const space = registry.registerSpace(localPath, {
        customName: spaceName,
        remoteUrl,
      })

      // 2. Get or initialize DataSpace with sync enabled
      // This will automatically initialize the database and set up graft
      const dataSpace = await getOrSetDataSpace(space.id, {
        enabled: true,
        remote: remoteUrl,
      })

      // 3. Pull data from remote
      try {
        await dataSpace.pull()
      } catch (pullError) {
        console.warn("Initial pull failed (remote may be empty):", pullError)
        // Don't fail clone if pull fails - remote might be new/empty
      }

      return {
        success: true,
        space,
        message: "Space cloned successfully",
      }
    } catch (error) {
      console.error("Failed to clone space:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }
)

// License management
ipcMain.handle("get-machine-id", async () => {
  return LicenseManager.getMachineId()
})

ipcMain.handle(
  "activate-license",
  async (event, licenseKey: string, token?: string) => {
    try {
      const hwId = await LicenseManager.getMachineId()
      const deviceName = LicenseManager.getDeviceName()
      const baseUrl = app.isPackaged
        ? "https://eidos.space"
        : "https://local-dev.eidos.space"
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      }
      if (token) {
        headers["Authorization"] = `Bearer ${token}`
      }
      const response = await fetch(`${baseUrl}/api/license/activate`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          licenseKey,
          hardwareId: hwId,
          deviceName,
          deviceInfo: {
            os: process.platform,
            arch: process.arch,
            version: app.getVersion(),
          },
        }),
      })

      const result = await response.json()
      if (result.success) {
        await LicenseManager.saveLicense(licenseKey, result.certificate)
        const payload = await LicenseManager.verifyCertificate(
          result.certificate
        )
        return { success: true, payload }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      console.error("Activation error:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }
)

ipcMain.handle("get-license-info", async () => {
  const stored = await LicenseManager.getLicense()
  if (!stored) return null

  const payload = await LicenseManager.verifyCertificate(stored.certificate)
  if (!payload) return null

  return {
    licenseKey: stored.licenseKey,
    plan: payload.plan,
    expiresAt: payload.expiresAt,
  }
})

ipcMain.handle("clear-license", async () => {
  await LicenseManager.clearLicense()
  return { success: true }
})

app.on("before-quit", () => {
  cleanupPlaygroundWatchers()
  terminalService.cleanup()
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

  ipcMain.handle("get-api-agent-status", () => {
    return getApiAgentStatus()
  })

  ipcMain.handle("list-spaces", () => {
    const registry = getSpaceRegistry()
    return registry.getAllSpaces()
  })

  ipcMain.handle("switch-space", async (_, spaceId: string) => {
    const registry = getSpaceRegistry()
    const space = registry.getSpace(spaceId)

    if (!space) {
      throw new Error(`Space not found: ${spaceId}`)
    }

    const configManager = getConfigManager()
    configManager.setLastOpenedSpace(spaceId)

    // Pre-initialize DataSpace before switching URL
    // This ensures the backend is ready when the frontend starts querying
    console.log(`🔧 Pre-initializing DataSpace for: ${spaceId}`)
    try {
      await getOrSetDataSpace(spaceId)
      console.log(`✅ DataSpace initialized for: ${spaceId}`)
    } catch (error) {
      console.error(`❌ Failed to initialize DataSpace for ${spaceId}:`, error)
      throw error
    }

    if (win) {
      // Wait for page to load before reloading to ensure URL change is applied
      const waitForLoad = () => {
        return new Promise<void>((resolve) => {
          win!.webContents.once("did-finish-load", () => {
            const currentURL = win!.webContents.getURL()
            console.log(`📍 Page loaded at: ${currentURL}`)
            resolve()
          })
        })
      }

      if (process.env.VITE_DEV_SERVER_URL) {
        const devUrl = new URL(process.env.VITE_DEV_SERVER_URL)
        const devSubdomainUrl = `http://${spaceId}.eidos.localhost:${devUrl.port}/`
        console.log(
          `🔄 Switching to space in development mode: ${devSubdomainUrl}`
        )
        win.loadURL(devSubdomainUrl)
        await waitForLoad()
        console.log(`✅ Page loaded, now reloading to ensure clean state...`)
        win.reload()
        await waitForLoad()
        console.log(`🎉 Space switch complete to: ${spaceId}`)
      } else {
        const prodSubdomainUrl = `http://${spaceId}.eidos.localhost:${PORT}/`
        console.log(
          `🔄 Switching to space in production mode: ${prodSubdomainUrl}`
        )
        win.loadURL(prodSubdomainUrl)
        await waitForLoad()
        console.log(`✅ Page loaded, now reloading to ensure clean state...`)
        win.reload()
        await waitForLoad()
        console.log(`🎉 Space switch complete to: ${spaceId}`)
      }
    }

    return { success: true }
  })

  ipcMain.handle(
    "register-space",
    async (
      _,
      spacePath: string,
      options: {
        customName?: string
        remoteUrl?: string
      } = {}
    ) => {
      const registry = getSpaceRegistry()
      try {
        const space = registry.registerSpace(spacePath, {
          customName: options.customName,
          remoteUrl: options.remoteUrl,
        })
        return { success: true, space }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  ipcMain.handle("remove-space", async (_, spaceId: string) => {
    const registry = getSpaceRegistry()
    const success = registry.removeSpace(spaceId)
    return { success }
  })

  ipcMain.handle("get-current-space", () => {
    const configManager = getConfigManager()
    const spaceId = configManager.getLastOpenedSpace()
    if (!spaceId) {
      return null
    }

    const registry = getSpaceRegistry()
    return registry.getSpace(spaceId)
  })

  ipcMain.handle("get-space-by-id", (_, spaceId: string) => {
    const registry = getSpaceRegistry()
    return registry.getSpace(spaceId)
  })

  ipcMain.handle(
    "update-space",
    async (_, spaceId: string, updates: { name?: string; relay?: any }) => {
      const registry = getSpaceRegistry()
      try {
        const success = registry.updateSpace(spaceId, updates)
        if (success) {
          const processPool = DataSpaceProcessPool.getInstance()
          processPool.sendToProcess(spaceId, {
            type: "update-space-info",
            spaceInfo: registry.getSpace(spaceId),
          })
          return { success: true }
        } else {
          return { success: false, error: "Space not found" }
        }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  )

  // Toggle space sync on/off
  ipcMain.handle(
    "toggle-space-sync",
    async (
      _,
      spaceId: string,
      enabled: boolean,
      remote?: string,
      provider?: "eidos.space" | "custom"
    ) => {
      try {
        const registry = getSpaceRegistry()
        const space = registry.getSpace(spaceId)
        if (!space) {
          return { success: false, error: "Space not found" }
        }

        const dataSpace = getDataSpace()
        if (!dataSpace) {
          return { success: false, error: "Data space not initialized" }
        }

        // Use provided provider, fallback to space's current provider, then default
        const configManager = getConfigManager()
        const effectiveProvider =
          provider ||
          space.sync?.provider ||
          configManager.getDefaultSyncProvider() ||
          "eidos.space"

        if (enabled) {
          // Enable sync: convert to graft
          if (!remote) {
            return {
              success: false,
              error: "Remote URL is required to enable sync",
            }
          }

          // Check if credentials exist for selected provider
          const credentials =
            await CredentialsManager.getSyncCredentials(effectiveProvider)
          if (!credentials) {
            return {
              success: false,
              error: `No sync credentials found for ${effectiveProvider}. Please configure sync settings first.`,
            }
          }

          await dataSpace.convertToGraft(remote)

          // Update space registry
          registry.setSpaceSync(spaceId, {
            enabled: true,
            remote: remote,
            provider: effectiveProvider,
          })

          return { success: true }
        } else {
          // Disable sync: export to sqlite
          await dataSpace.exportToSqlite()

          // Update space registry
          registry.setSpaceSync(spaceId, {
            enabled: false,
            remote: space.sync?.remote || "",
            provider: space.sync?.provider,
          })

          return { success: true }
        }
      } catch (error: any) {
        console.error("Failed to toggle space sync:", error)
        return { success: false, error: error.message }
      }
    }
  )
})

app.on("activate", () => {
  if (win) {
    win.show()
  }
})

ipcMain.handle("quit-app", () => {
  cleanupPlaygroundWatchers()
  forceQuit = true
  destroyTray()
  getDataSpace()?.close()
  app.quit()
})

ipcMain.handle("reload-query-worker", async () => {
  console.log("prepare for import")
  // Importing CSV will enable exclusive locks, causing read-only sqlite worker queries to timeout. We directly shut down all workers before importing CSV
  return { success: true }
})

ipcMain.handle("reload-data-space", async () => {
  return reloadDataSpace()
})

ipcMain.handle("close-data-space", async () => {
  return closeDataSpace()
})

// Simple fetch proxy - just forward to Node.js fetch (no CORS restrictions)
ipcMain.handle("fetch", async (_, url, options) => {
  const res = await fetch(url, options)
  const body = await res.arrayBuffer()

  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    headers: Object.fromEntries(res.headers.entries()),
    url: res.url,
    body: body,
  }
})

ipcMain.handle(
  "fetch-available-models",
  async (event, apiKey: string, providerType: string, baseUrl?: string) => {
    try {
      const models = await fetchAvailableModels(
        apiKey,
        providerType as any,
        baseUrl
      )
      return { success: true, models }
    } catch (error) {
      console.error("Error fetching available models:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }
)

// Native context menu handling
ipcMain.handle(
  "show-native-context-menu",
  async (
    event,
    options: { items: NativeMenuItem[]; x?: number; y?: number }
  ) => {
    try {
      const { items, x, y } = options

      // Convert menu items to Electron menu template with click handlers
      const menuTemplate = convertToElectronMenuTemplateWithIds(items)

      // Create and show the menu
      const menu = Menu.buildFromTemplate(menuTemplate)

      // Get the window from the event sender
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window) {
        throw new Error("Cannot find window from event sender")
      }

      // Show the menu at the specified position or at cursor
      if (x !== undefined && y !== undefined) {
        menu.popup({
          window,
          x: Math.round(x),
          y: Math.round(y),
          callback: () => {
            // Menu closed - cleanup if needed
          },
        })
      } else {
        menu.popup({
          window,
          callback: () => {
            // Menu closed - cleanup if needed
          },
        })
      }

      return { success: true }
    } catch (error) {
      console.error("Error showing native context menu:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }
)

// CLI installation IPC handlers
ipcMain.handle("cli:is-installed", async () => {
  return isCliInstalled()
})

ipcMain.handle("cli:install", async () => {
  return installCli()
})

ipcMain.handle("cli:uninstall", async () => {
  return uninstallCli()
})

ipcMain.handle("cli:get-path", async () => {
  return getCliBinaryPath()
})
