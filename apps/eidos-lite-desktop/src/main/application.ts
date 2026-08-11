import fs from "node:fs"
import path from "node:path"
import { app, BrowserWindow, dialog, Menu, protocol } from "electron"

import {
  EIDOS_SPACE_DOCUMENT_SCHEME,
  EIDOS_SPACE_MEDIA_SCHEME,
  IPC_CHANNELS,
} from "../shared/contracts"
import {
  resolveEidosLiteServiceEnvironment,
  runtimeEnvironmentOverride,
} from "../shared/service-environment"
import { resolveEidosLiteLocale } from "../shared/i18n"
import { eidosLiteUpdatesEnabledInBuild } from "../shared/update-environment"
import { installElectronLogging } from "./electron-logging"
import { eidosLiteApplicationMenuTemplate } from "./application-menu"
import { registerIpc } from "./ipc"
import { serveMediaPreview } from "./space/media-file-preview"
import { eidosFilePathsFromArguments } from "./launch-intent"
import { initializeEidosLiteLogger } from "./logging"
import { createSyncControlPlane } from "./sync/create-sync-control-plane"
import { PACKAGED_SYNC_FAILURE_SEQUENCE } from "./sync/sync-failure"
import { EidosLiteUpdater, type EidosLiteAutoUpdater } from "./updater"
import { WindowController } from "./window-controller"

const mainModuleStartedAtMs = Date.now()

protocol.registerSchemesAsPrivileged([
  {
    scheme: EIDOS_SPACE_MEDIA_SCHEME,
    privileges: { stream: true },
  },
  {
    scheme: EIDOS_SPACE_DOCUMENT_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
    },
  },
])
const bootstrapState = (
  globalThis as typeof globalThis & {
    __eidosLiteBootstrapState?: {
      startedAtMs: number
      pendingOpenFiles: string[]
      handleOpenFile: (event: Electron.Event, filePath: string) => void
    }
  }
).__eidosLiteBootstrapState
const bootstrapStartedAtMs =
  bootstrapState?.startedAtMs ?? mainModuleStartedAtMs

app.setName("Eidos Lite")

const smokeSpace = process.env.EIDOS_LITE_SMOKE_SPACE
const smokeResult = process.env.EIDOS_LITE_SMOKE_RESULT
const isPackagedSmoke = Boolean(smokeSpace || smokeResult)
const smokeLaunchedAtMs = Number(process.env.EIDOS_LITE_SMOKE_LAUNCHED_AT_MS)
let smokeUserData: string | null = null
if (smokeResult) {
  smokeUserData = path.join(path.dirname(smokeResult), "user-data")
  fs.mkdirSync(smokeUserData, { recursive: true })
  app.setPath("userData", smokeUserData)
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  if (isPackagedSmoke) {
    console.error(
      "Packaged smoke could not acquire the Eidos Lite single-instance lock"
    )
  }
  process.exit(isPackagedSmoke ? 2 : 0)
}

const services = resolveEidosLiteServiceEnvironment(
  runtimeEnvironmentOverride(app.isPackaged, process.env.EIDOS_LITE_ENVIRONMENT)
)
if (smokeUserData) {
  app.setAppLogsPath(path.join(smokeUserData, "logs"))
} else {
  app.setAppLogsPath()
}
const logger = initializeEidosLiteLogger(app.getPath("logs"))
const stopLogging = installElectronLogging(app, logger)
const updater = new EidosLiteUpdater({
  currentVersion: app.getVersion(),
  platform: process.platform,
  architecture: process.arch,
  packaged: app.isPackaged,
  production: services.name === "production",
  updatesEnabled: eidosLiteUpdatesEnabledInBuild(),
  loadAutoUpdater: async () => {
    const { autoUpdater } = await import("electron-updater")
    return autoUpdater as unknown as EidosLiteAutoUpdater
  },
  broadcast: (status) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send(IPC_CHANNELS.updateChanged, status)
      }
    }
  },
  logger,
})
logger.info("app.started", {
  appVersion: app.getVersion(),
  packaged: app.isPackaged,
  environment: services.name,
  platform: process.platform,
  arch: process.arch,
  electronVersion: process.versions.electron,
})
const controller = new WindowController(services)
let shutdownStarted = false
let closeIpc = (): Promise<void> => Promise.resolve()
const pendingLaunchFiles = eidosFilePathsFromArguments(
  process.argv,
  process.cwd()
)
let launchRoutingReady = false
let launchRoutingInFlight: Promise<void> | null = null

function enqueueLaunchFiles(paths: readonly string[]): void {
  if (shutdownStarted) return
  for (const filePath of paths) {
    if (!pendingLaunchFiles.includes(filePath))
      pendingLaunchFiles.push(filePath)
  }
  if (launchRoutingReady) void drainLaunchFiles()
}

function drainLaunchFiles(): Promise<void> {
  if (!launchRoutingReady) return Promise.resolve()
  if (launchRoutingInFlight) return launchRoutingInFlight
  const work = (async () => {
    let filePath = pendingLaunchFiles.shift()
    while (filePath) {
      try {
        await controller.openEidosFilePath(filePath)
      } catch (error) {
        console.error("Could not open launched Eidos File", error)
        dialog.showErrorBox(
          "Could not open Eidos File",
          error instanceof Error ? error.message : String(error)
        )
        if (BrowserWindow.getAllWindows().length === 0) {
          controller.createWelcomeWindow()
        }
      }
      filePath = pendingLaunchFiles.shift()
    }
  })()
  launchRoutingInFlight = work.finally(() => {
    launchRoutingInFlight = null
    if (pendingLaunchFiles.length > 0) void drainLaunchFiles()
  })
  return launchRoutingInFlight
}

app.on("second-instance", (_event, commandLine, workingDirectory) => {
  const paths = eidosFilePathsFromArguments(commandLine, workingDirectory)
  if (paths.length > 0) {
    enqueueLaunchFiles(paths)
  } else if (!controller.focusAnyWindow() && launchRoutingReady) {
    controller.createWelcomeWindow()
  }
})

if (bootstrapState) {
  app.removeListener("open-file", bootstrapState.handleOpenFile)
  enqueueLaunchFiles(bootstrapState.pendingOpenFiles)
}
app.on("open-file", (event, filePath) => {
  event.preventDefault()
  enqueueLaunchFiles([filePath])
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

app.on("activate", () => {
  if (
    app.isReady() &&
    BrowserWindow.getAllWindows().length === 0 &&
    pendingLaunchFiles.length === 0 &&
    !launchRoutingInFlight
  ) {
    controller.createWelcomeWindow()
  }
})

app.on("before-quit", (event) => {
  if (shutdownStarted) return
  event.preventDefault()
  shutdownStarted = true
  logger.info("app.shutdown.started")
  launchRoutingReady = false
  pendingLaunchFiles.length = 0
  void closeIpc()
    .then(() => launchRoutingInFlight)
    .then(() => controller.closeAll())
    .then(
      () => app.quit(),
      (error) => {
        logger.error("app.shutdown.failed", undefined, error)
        console.error("Failed to close Eidos Lite runtimes", error)
        app.exit(1)
      }
    )
})

async function installApplicationMenu(): Promise<void> {
  const preferences = await controller.getPreferences()
  const locale = resolveEidosLiteLocale(preferences.language, app.getLocale())
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      eidosLiteApplicationMenuTemplate(
        process.platform,
        app.getName(),
        {
          openSettings: () => controller.showSettingsWindow(),
          openDocumentation: () => {
            void controller
              .openSettingsDestination("documentation")
              .catch((error) =>
                logger.warn("settings.destination.failed", {
                  destination: "documentation",
                  error: error instanceof Error ? error.message : String(error),
                })
              )
          },
          openWebsite: () => {
            void controller.openSettingsDestination("website").catch((error) =>
              logger.warn("settings.destination.failed", {
                destination: "website",
                error: error instanceof Error ? error.message : String(error),
              })
            )
          },
        },
        locale
      )
    )
  )
}

void app.whenReady().then(async () => {
  const appReadyAtMs = Date.now()
  logger.info("app.ready", {
    startupMs: Math.max(0, appReadyAtMs - bootstrapStartedAtMs),
  })
  protocol.handle(EIDOS_SPACE_MEDIA_SCHEME, (request) =>
    serveMediaPreview(request.url, request.headers)
  )
  const syncControl = createSyncControlPlane(services)
  if (isPackagedSmoke) {
    if (!smokeSpace || !smokeResult) {
      throw new Error(
        "Packaged smoke requires EIDOS_LITE_SMOKE_SPACE and EIDOS_LITE_SMOKE_RESULT"
      )
    }
    try {
      await controller.recoverCloneOperations()
      closeIpc = registerIpc(controller, services, syncControl, updater, {
        syncFailuresForTesting: PACKAGED_SYNC_FAILURE_SEQUENCE,
      }).close
      const ipcReadyAtMs = Date.now()
      if (!Number.isFinite(smokeLaunchedAtMs) || smokeLaunchedAtMs <= 0) {
        throw new Error("Packaged smoke requires its process launch timestamp")
      }
      const { runPackagedStartupSmoke } =
        await import("./packaged-startup-smoke")
      const startup = await runPackagedStartupSmoke(controller, {
        launchedAtMs: smokeLaunchedAtMs,
        bootstrapStartedAtMs,
        mainModuleStartedAtMs,
        appReadyAtMs,
        ipcReadyAtMs,
      })
      const { runPackagedSmoke } = await import("./packaged-smoke")
      await runPackagedSmoke(controller, smokeSpace, smokeResult, startup)
      logger.info("app.packaged-smoke.completed")
      app.exit(0)
    } catch (error) {
      logger.error("app.packaged-smoke.failed", undefined, error)
      console.error(error)
      app.exit(1)
    }
    return
  }
  await controller.recoverCloneOperations()
  closeIpc = registerIpc(controller, services, syncControl, updater).close
  await installApplicationMenu()
  controller.onPreferencesChanged(() => void installApplicationMenu())
  launchRoutingReady = true
  if (pendingLaunchFiles.length > 0) {
    await drainLaunchFiles()
  } else {
    controller.createWelcomeWindow()
  }
  const preferences = await controller.getPreferences()
  setTimeout(() => {
    void updater.start(preferences.automaticUpdates)
  }, 0)
})

app.once("quit", () => {
  logger.info("app.shutdown.completed")
  stopLogging()
})
