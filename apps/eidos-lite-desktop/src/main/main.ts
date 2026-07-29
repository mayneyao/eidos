import fs from "node:fs"
import path from "node:path"
import { app, BrowserWindow } from "electron"

import {
  resolveEidosLiteServiceEnvironment,
  runtimeEnvironmentOverride,
} from "../shared/service-environment"
import { registerIpc } from "./ipc"
import { runPackagedSmoke } from "./packaged-smoke"
import { createSyncControlPlane } from "./sync/create-sync-control-plane"
import { PACKAGED_SYNC_FAILURE_SEQUENCE } from "./sync/sync-failure"
import { WindowController } from "./window-controller"

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

app.on("second-instance", () => {
  controller.createWelcomeWindow().focus()
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    controller.createWelcomeWindow()
  }
})

app.on("before-quit", (event) => {
  if (shutdownStarted) return
  event.preventDefault()
  shutdownStarted = true
  void closeIpc()
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
      if (!Number.isFinite(smokeLaunchedAtMs) || smokeLaunchedAtMs <= 0) {
        throw new Error("Packaged smoke requires its process launch timestamp")
      }
      await runPackagedSmoke(
        controller,
        smokeSpace,
        smokeResult,
        smokeLaunchedAtMs
      )
      app.exit(0)
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
    return
  }
  await controller.recoverCloneOperations()
  closeIpc = registerIpc(controller, services, syncControl).close
  controller.createWelcomeWindow()
})
