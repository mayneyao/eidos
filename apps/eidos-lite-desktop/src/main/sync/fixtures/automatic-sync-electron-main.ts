import assert from "node:assert/strict"
import fs from "node:fs/promises"
import path from "node:path"
import { app, BrowserWindow } from "electron"
import type { GraftClient } from "../../graft/graft-client"
import { WindowController } from "../../window-controller"
import { SpaceSession } from "../../space/space-session"
import { resolveEidosLiteServiceEnvironment } from "../../../shared/service-environment"
import { runAutomaticSyncElectronSmokeCore } from "../automatic-sync-electron-smoke"
import { runEncryptedAutomaticUnlockElectronSmoke } from "../encrypted-automatic-unlock-electron-smoke"

// An explicit non-UI Electron integration entry. It creates no BrowserWindow,
// never starts Vite, and never launches Electron's default application.
const evidenceRoot = process.env.EIDOS_TEST_ELECTRON_EVIDENCE
if (!evidenceRoot || !path.isAbsolute(evidenceRoot))
  throw new Error("Isolated evidence root is required")
app.setName("Eidos Lite Automatic Sync Host Test")
app.setPath("userData", path.join(evidenceRoot, "user-data"))

void app.whenReady().then(async () => {
  const resultPath = path.join(evidenceRoot, "result.json")
  try {
    const controller = new WindowController(
      resolveEidosLiteServiceEnvironment("staging")
    )
    const createClient = Reflect.get(
      controller,
      "createGraftClient"
    ) as () => GraftClient
    const createSession = async (root: string) => {
      const graft = createClient.call(controller)
      const session = await SpaceSession.create(
        root,
        path.join(evidenceRoot, "session-state"),
        { graft }
      )
      return { session, graft, close: () => session.close() }
    }
    await runAutomaticSyncElectronSmokeCore(
      path.join(evidenceRoot, "Space"),
      resultPath,
      createSession
    )
    await runEncryptedAutomaticUnlockElectronSmoke(evidenceRoot, createSession)
    assert.equal(
      BrowserWindow.getAllWindows().length,
      0,
      "Host acceptance must remain non-UI"
    )
    app.exit(0)
  } catch (error) {
    if (!(await fs.stat(resultPath).catch(() => null)))
      await fs.writeFile(
        resultPath,
        JSON.stringify({ status: "failed", message: String(error) }, null, 2)
      )
    console.error(error)
    app.exit(1)
  }
})
