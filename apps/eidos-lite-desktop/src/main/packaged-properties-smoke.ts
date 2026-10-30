import { performance } from "node:perf_hooks"
import { app, BrowserWindow } from "electron"
import type { WindowController } from "./window-controller"
import { observePackagedSmokeWindow } from "./packaged-startup-smoke"

export async function verifyPackagedProperties(
  controller: WindowController,
  owner: BrowserWindow,
  failures: string[]
) {
  const started = performance.now()
  let createdMs: number | null = null
  let shownMs: number | null = null
  let inspector: BrowserWindow | undefined
  const created = (_event: Electron.Event, window: BrowserWindow) => {
    inspector = window
    createdMs = performance.now() - started
    observePackagedSmokeWindow(window, failures)
    window.once("show", () => {
      shownMs = performance.now() - started
    })
  }
  app.once("browser-window-created", created)
  try {
    controller.showFileProperties(owner.webContents, "VTab Smoke/proof.txt")
  } finally {
    app.removeListener("browser-window-created", created)
  }
  if (!inspector) throw new Error("Properties window was not created")
  const window = inspector
  try {
    const deadline = Date.now() + 15_000
    while (
      window.webContents.isLoadingMainFrame() ||
      !window.webContents.getURL().endsWith("#/file-properties")
    ) {
      if (Date.now() > deadline)
        throw new Error("Properties renderer did not load")
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    await window.webContents.executeJavaScript(`(async () => {
      const deadline = Date.now() + 15000
      while (Date.now() < deadline) {
        const content = document.querySelector('.file-properties-content')
        const error = content?.querySelector('[role="alert"]')
        if (error) throw new Error(error.textContent)
        if (content?.getAttribute('aria-busy') === 'false' &&
            content.querySelector('.file-properties-identity strong')?.textContent === 'proof.txt' &&
            content.querySelector('.file-properties-body dl')?.textContent.includes('txt')) {
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          return
        }
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      throw new Error('Properties information did not render')
    })()`)
    while (shownMs === null) {
      if (Date.now() > deadline)
        throw new Error("Properties window stayed hidden")
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    const readyMs = performance.now() - started
    window.close()
    const closeDeadline = Date.now() + 10_000
    while (!window.isDestroyed()) {
      if (Date.now() > closeDeadline)
        throw new Error("Properties close did not finish")
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    return { createdMs, shownMs, readyMs, closed: true }
  } finally {
    if (!window.isDestroyed()) window.destroy()
  }
}
