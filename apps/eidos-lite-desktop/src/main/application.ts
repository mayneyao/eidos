import fs from "node:fs"
import path from "node:path"
import { app, BrowserWindow, dialog } from "electron"

import {
  resolveEidosLiteServiceEnvironment,
  runtimeEnvironmentOverride,
} from "../shared/service-environment"
import { registerIpc } from "./ipc"
import { eidosFilePathsFromArguments } from "./launch-intent"
import { createSyncControlPlane } from "./sync/create-sync-control-plane"
import { PACKAGED_SYNC_FAILURE_SEQUENCE } from "./sync/sync-failure"
import { WindowController } from "./window-controller"

const mainModuleStartedAtMs = Date.now()
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
const smokeLaunchedAtMs = Number(process.env.EIDOS_LITE_SMOKE_LAUNCHED_AT_MS)
if (smokeResult) {
  const smokeUserData = path.join(path.dirname(smokeResult), "user-data")
  fs.mkdirSync(smokeUserData, { recursive: true })
  app.setPath("userData", smokeUserData)
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()

const services = resolveEidosLiteServiceEnvironment(
  runtimeEnvironmentOverride(app.isPackaged, process.env.EIDOS_LITE_ENVIRONMENT)
)
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
  launchRoutingReady = false
  pendingLaunchFiles.length = 0
  void closeIpc()
    .then(() => launchRoutingInFlight)
    .then(() => controller.closeAll())
    .then(
      () => app.quit(),
      (error) => {
        console.error("Failed to close Eidos Lite runtimes", error)
        app.exit(1)
      }
    )
})

void app.whenReady().then(async () => {
  const appReadyAtMs = Date.now()
  const syncControl = createSyncControlPlane(services)
  if (smokeSpace || smokeResult) {
    if (!smokeSpace || !smokeResult) {
      throw new Error(
        "Packaged smoke requires EIDOS_LITE_SMOKE_SPACE and EIDOS_LITE_SMOKE_RESULT"
      )
    }
    try {
      await controller.recoverCloneOperations()
      closeIpc = registerIpc(controller, services, syncControl, {
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
      app.exit(0)
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
    return
  }
  await controller.recoverCloneOperations()
  closeIpc = registerIpc(controller, services, syncControl).close
  launchRoutingReady = true
  if (pendingLaunchFiles.length > 0) {
    await drainLaunchFiles()
  } else {
    controller.createWelcomeWindow()
  }
})
