import type { BrowserWindow } from "electron"

/** Reloads must read current preferences, not the initial window snapshot. */
export function installWindowZoom(
  window: BrowserWindow,
  readZoom: () => Promise<number>
): void {
  window.webContents.on("did-finish-load", () => {
    void readZoom().then((zoom) => {
      if (!window.isDestroyed()) window.webContents.setZoomFactor(zoom)
    })
  })
}
