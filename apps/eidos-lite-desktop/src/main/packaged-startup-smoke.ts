import type { BrowserWindow } from "electron"

import type { WindowController } from "./window-controller"

export interface PackagedStartupMilestones {
  launchedAtMs: number
  mainModuleStartedAtMs: number
  appReadyAtMs: number
  ipcReadyAtMs: number
}

export interface PackagedStartupTimings {
  launcherToMainMs: number
  mainToReadyMs: number
  readyToIpcMs: number
  ipcToProbeMs: number
  probeToRendererMs: number
  rendererToUsableMs: number
  totalMs: number
}

export interface PackagedSmokeStartup {
  coldStartMs: number
  failures: string[]
  timings: PackagedStartupTimings
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

function measureStartupTimings(
  milestones: PackagedStartupMilestones,
  probeStartedAtMs: number,
  rendererLoadedAtMs: number,
  usableAtMs: number
): PackagedStartupTimings {
  const ordered = [
    milestones.launchedAtMs,
    milestones.mainModuleStartedAtMs,
    milestones.appReadyAtMs,
    milestones.ipcReadyAtMs,
    probeStartedAtMs,
    rendererLoadedAtMs,
    usableAtMs,
  ]
  if (
    ordered.some((value) => !Number.isFinite(value) || value <= 0) ||
    ordered.some((value, index) => index > 0 && value < ordered[index - 1])
  ) {
    throw new Error("Packaged startup milestones are invalid or out of order")
  }
  return {
    launcherToMainMs:
      milestones.mainModuleStartedAtMs - milestones.launchedAtMs,
    mainToReadyMs: milestones.appReadyAtMs - milestones.mainModuleStartedAtMs,
    readyToIpcMs: milestones.ipcReadyAtMs - milestones.appReadyAtMs,
    ipcToProbeMs: probeStartedAtMs - milestones.ipcReadyAtMs,
    probeToRendererMs: rendererLoadedAtMs - probeStartedAtMs,
    rendererToUsableMs: usableAtMs - rendererLoadedAtMs,
    totalMs: usableAtMs - milestones.launchedAtMs,
  }
}

export async function runPackagedStartupSmoke(
  controller: WindowController,
  milestones: PackagedStartupMilestones
): Promise<PackagedSmokeStartup> {
  const failures: string[] = []
  let welcomeWindow: BrowserWindow | null = null
  const probeStartedAtMs = Date.now()
  try {
    let welcomeLoaded: (() => void) | undefined
    let rendererLoadedAtMs = 0
    const welcomeDidLoad = new Promise<void>((resolve) => {
      welcomeLoaded = resolve
    })
    welcomeWindow = controller.createWelcomeWindow((candidate) => {
      observePackagedSmokeWindow(candidate, failures)
      candidate.webContents.once("did-finish-load", () => {
        rendererLoadedAtMs = Date.now()
        welcomeLoaded?.()
      })
    })
    await welcomeDidLoad
    const welcomeReady = (await welcomeWindow.webContents.executeJavaScript(
      welcomeProbe,
      true
    )) as boolean
    if (!welcomeReady) throw new Error("Welcome window did not become usable")

    const timings = measureStartupTimings(
      milestones,
      probeStartedAtMs,
      rendererLoadedAtMs,
      Date.now()
    )
    const coldStartMs = timings.totalMs
    if (coldStartMs <= 0 || coldStartMs > 2_000) {
      throw new Error(
        `Packaged cold start exceeded the PRD P95 budget: ${coldStartMs}ms ` +
          JSON.stringify(timings)
      )
    }
    return { coldStartMs, failures, timings, welcomeWindow }
  } catch (error) {
    if (welcomeWindow && !welcomeWindow.isDestroyed()) welcomeWindow.destroy()
    throw error
  }
}
