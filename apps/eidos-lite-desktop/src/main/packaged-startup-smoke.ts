import type { BrowserWindow } from "electron"

import type { WindowController } from "./window-controller"

export interface PackagedStartupMilestones {
  launchedAtMs: number
  bootstrapStartedAtMs: number
  mainModuleStartedAtMs: number
  appReadyAtMs: number
  ipcReadyAtMs: number
}

export interface PackagedStartupTimings {
  launcherToBootstrapMs: number
  bootstrapToMainMs: number
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

export function shouldEnforcePackagedPerformance(
  policy = process.env.EIDOS_LITE_SMOKE_PERFORMANCE_POLICY ?? "enforce"
): boolean {
  if (policy === "enforce") return true
  if (policy === "observe") return false
  throw new Error(`Invalid packaged smoke performance policy: ${policy}`)
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
      !document.getElementById("lite-startup") &&
      document.documentElement.dataset.startupState === "ready" &&
      [...welcome.querySelectorAll("button")].some((button) =>
        button.textContent?.includes("New Space")
      ) &&
      [...welcome.querySelectorAll("button")].some((button) =>
        button.textContent?.includes("Open Space")
      ) &&
      [...welcome.querySelectorAll("button")].some((button) =>
        button.textContent?.includes("Open Synced Space")
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
    milestones.bootstrapStartedAtMs,
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
    launcherToBootstrapMs:
      milestones.bootstrapStartedAtMs - milestones.launchedAtMs,
    bootstrapToMainMs:
      milestones.mainModuleStartedAtMs - milestones.bootstrapStartedAtMs,
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
    let documentLoads = 0
    welcomeWindow = await controller.createStartupWindow((candidate) => {
      observePackagedSmokeWindow(candidate, failures)
      candidate.webContents.on("did-finish-load", () => {
        documentLoads++
      })
      candidate.webContents.once("did-finish-load", () => {
        rendererLoadedAtMs = Date.now()
        welcomeLoaded?.()
      })
    })
    await welcomeDidLoad
    // Observe a rendered frame before restoration settles. The shell must
    // remain until real content is ready, without an interim selector.
    await welcomeWindow.webContents.executeJavaScript(`
      (async () => {
        window.__startupDocumentToken = "single-startup-document";
        const assertPending = () => {
          const shell = document.getElementById("lite-startup");
          if (!shell || getComputedStyle(shell).display === "none" ||
              document.querySelector('[data-welcome-ready="true"]'))
            throw new Error("Startup shell disappeared before restoration settled");
        };
        assertPending();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        assertPending();
      })()
    `)
    await controller.openDefaultWindow(welcomeWindow)
    const welcomeReady = (await welcomeWindow.webContents.executeJavaScript(
      welcomeProbe,
      true
    )) as boolean
    if (!welcomeReady) throw new Error("Welcome window did not become usable")
    if (
      documentLoads !== 1 ||
      !(await welcomeWindow.webContents.executeJavaScript(
        'window.__startupDocumentToken === "single-startup-document"'
      ))
    )
      throw new Error("Startup replaced the initial document")

    const timings = measureStartupTimings(
      milestones,
      probeStartedAtMs,
      rendererLoadedAtMs,
      Date.now()
    )
    const coldStartMs = timings.totalMs
    if (coldStartMs <= 0) {
      throw new Error(`Packaged cold start is invalid: ${coldStartMs}ms`)
    }
    if (shouldEnforcePackagedPerformance() && coldStartMs > 2_000) {
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
