import type { BrowserWindow } from "electron"

import type { WindowController } from "./window-controller"

export interface PackagedSmokeStartup {
  coldStartMs: number
  failures: string[]
  welcomeWindow: BrowserWindow
}

const welcomeProbe = `
(async () => {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    const welcome = document.querySelector(
      '[data-welcome-ready="true"]'
    )
    if (
      welcome &&
      [...welcome.querySelectorAll("button")].some((button) =>
        button.textContent?.includes("New Space")
      ) &&
      [...welcome.querySelectorAll("button")].some((button) =>
        button.textContent?.includes("Open Space")
      ) &&
      [...welcome.querySelectorAll("button")].some((button) =>
        button.textContent?.includes("Clone Synced Space")
      )
    ) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error("Timed out waiting for the usable Welcome window")
})()
`

export function observePackagedSmokeWindow(
  candidate: BrowserWindow,
  failures: string[]
): void {
  candidate.webContents.on("preload-error", (_event, preloadPath, error) => {
    failures.push(`Preload ${preloadPath}: ${error.message}`)
  })
  candidate.webContents.on("render-process-gone", (_event, details) => {
    failures.push(`Renderer exited: ${details.reason}`)
  })
  candidate.webContents.on("console-message", (event) => {
    if (event.level === "error") failures.push(`Console: ${event.message}`)
  })
}

export async function runPackagedStartupSmoke(
  controller: WindowController,
  launchedAtMs: number
): Promise<PackagedSmokeStartup> {
  const failures: string[] = []
  let welcomeWindow: BrowserWindow | null = null
  try {
    let welcomeLoaded: (() => void) | undefined
    const welcomeDidLoad = new Promise<void>((resolve) => {
      welcomeLoaded = resolve
    })
    welcomeWindow = controller.createWelcomeWindow((candidate) => {
      observePackagedSmokeWindow(candidate, failures)
      candidate.webContents.once("did-finish-load", () => welcomeLoaded?.())
    })
    await welcomeDidLoad
    const welcomeReady = (await welcomeWindow.webContents.executeJavaScript(
      welcomeProbe,
      true
    )) as boolean
    if (!welcomeReady) throw new Error("Welcome window did not become usable")

    const coldStartMs = Date.now() - launchedAtMs
    if (coldStartMs <= 0 || coldStartMs > 2_000) {
      throw new Error(
        `Packaged cold start exceeded the PRD P95 budget: ${coldStartMs}ms`
      )
    }
    return { coldStartMs, failures, welcomeWindow }
  } catch (error) {
    if (welcomeWindow && !welcomeWindow.isDestroyed()) welcomeWindow.destroy()
    throw error
  }
}
