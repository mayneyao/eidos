import { EventEmitter } from "node:events"
import type { BrowserWindow } from "electron"
import { expect, it, vi } from "vitest"
import { installWindowZoom } from "./window-zoom"

it("restores the latest saved zoom after each reload", async () => {
  const webContents = Object.assign(new EventEmitter(), {
    setZoomFactor: vi.fn(),
  })
  let zoom = 1
  let destroyed = false
  installWindowZoom(
    { webContents, isDestroyed: () => destroyed } as unknown as BrowserWindow,
    async () => zoom
  )
  webContents.emit("did-finish-load")
  await Promise.resolve()
  expect(webContents.setZoomFactor).toHaveBeenLastCalledWith(1)
  zoom = 1.5
  webContents.emit("did-finish-load")
  await Promise.resolve()
  expect(webContents.setZoomFactor).toHaveBeenLastCalledWith(1.5)
  webContents.emit("did-finish-load")
  destroyed = true
  await Promise.resolve()
  expect(webContents.setZoomFactor).toHaveBeenCalledTimes(2)
})
