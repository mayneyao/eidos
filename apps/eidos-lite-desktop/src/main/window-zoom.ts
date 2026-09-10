import type { BrowserWindow } from "electron"

/** Debounce window events so a drag-resize re-applies zoom once it settles. */
const REASSERT_DELAY_MS = 100

export interface WindowZoomScheduler {
  (callback: () => void, delayMs: number): () => void
}

export interface WindowZoomOptions {
  schedule?: WindowZoomScheduler
}

function defaultSchedule(callback: () => void, delayMs: number): () => void {
  const timer = setTimeout(callback, delayMs)
  return () => clearTimeout(timer)
}

/**
 * Keeps the persisted interface scale applied to a window. Chromium can reset
 * the effective `webContents` zoom while a window is resized, maximized, or
 * restored, so the saved preference is re-asserted after those events instead
 * of only on load. Reloads read current preferences, not the initial snapshot.
 */
export function installWindowZoom(
  window: BrowserWindow,
  readZoom: () => Promise<number>,
  options: WindowZoomOptions = {}
): () => void {
  const schedule = options.schedule ?? defaultSchedule
  let disposed = false
  let generation = 0
  let cancelPending: (() => void) | null = null

  const applyZoom = () => {
    if (disposed || window.isDestroyed()) return
    const current = ++generation
    void readZoom().then((zoom) => {
      if (disposed || window.isDestroyed() || current !== generation) return
      window.webContents.setZoomFactor(zoom)
    })
  }

  const reassertZoom = () => {
    cancelPending?.()
    cancelPending = schedule(() => {
      cancelPending = null
      applyZoom()
    }, REASSERT_DELAY_MS)
  }

  window.webContents.on("did-finish-load", applyZoom)
  window.on("resized", reassertZoom)
  window.on("moved", reassertZoom)
  window.on("resize", reassertZoom)
  window.on("move", reassertZoom)
  window.on("maximize", reassertZoom)
  window.on("unmaximize", reassertZoom)
  window.on("restore", reassertZoom)

  return () => {
    disposed = true
    cancelPending?.()
    cancelPending = null
  }
}
