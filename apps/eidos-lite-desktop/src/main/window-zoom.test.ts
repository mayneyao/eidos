import { EventEmitter } from "node:events"
import type { BrowserWindow } from "electron"
import { expect, it, vi } from "vitest"
import { installWindowZoom } from "./window-zoom"

function createWindow() {
  const webContents = Object.assign(new EventEmitter(), {
    setZoomFactor: vi.fn(),
  })
  const window = Object.assign(new EventEmitter(), {
    webContents,
    destroyed: false,
    isDestroyed() {
      return (this as { destroyed: boolean }).destroyed
    },
  })
  return window
}

it("restores the latest saved zoom after each reload", async () => {
  const window = createWindow()
  let zoom = 1
  installWindowZoom(window as unknown as BrowserWindow, async () => zoom)
  window.webContents.emit("did-finish-load")
  await Promise.resolve()
  expect(window.webContents.setZoomFactor).toHaveBeenLastCalledWith(1)
  zoom = 1.5
  window.webContents.emit("did-finish-load")
  await Promise.resolve()
  expect(window.webContents.setZoomFactor).toHaveBeenLastCalledWith(1.5)
  window.webContents.emit("did-finish-load")
  window.destroyed = true
  await Promise.resolve()
  expect(window.webContents.setZoomFactor).toHaveBeenCalledTimes(2)
})

it("re-applies the saved zoom after a resize settles", async () => {
  const window = createWindow()
  const scheduled = scheduler()
  installWindowZoom(
    window as unknown as BrowserWindow,
    async () => 1.25,
    scheduled.options
  )
  window.webContents.setZoomFactor.mockClear()
  window.emit("resized")
  expect(window.webContents.setZoomFactor).not.toHaveBeenCalled()
  scheduled.flush()
  await Promise.resolve()
  expect(window.webContents.setZoomFactor).toHaveBeenCalledExactlyOnceWith(1.25)
})

it("coalesces rapid window events into one re-assert", async () => {
  const window = createWindow()
  const scheduled = scheduler()
  installWindowZoom(
    window as unknown as BrowserWindow,
    async () => 1.5,
    scheduled.options
  )
  window.webContents.setZoomFactor.mockClear()
  for (const event of ["resize", "moved", "maximize", "restore"]) {
    window.emit(event)
  }
  expect(scheduled.pending()).toBe(1)
  scheduled.flush()
  await Promise.resolve()
  expect(window.webContents.setZoomFactor).toHaveBeenCalledExactlyOnceWith(1.5)
})

it("stops re-asserting after the disposer runs", async () => {
  const window = createWindow()
  const scheduled = scheduler()
  const dispose = installWindowZoom(
    window as unknown as BrowserWindow,
    async () => 1,
    scheduled.options
  )
  window.webContents.setZoomFactor.mockClear()
  window.emit("resized")
  dispose()
  scheduled.flush()
  window.emit("maximize")
  await Promise.resolve()
  expect(window.webContents.setZoomFactor).not.toHaveBeenCalled()
})

function scheduler() {
  const callbacks = new Set<() => void>()
  return {
    options: {
      schedule: (callback: () => void) => {
        callbacks.add(callback)
        return () => callbacks.delete(callback)
      },
    },
    pending: () => callbacks.size,
    flush: () => {
      const pending = [...callbacks]
      callbacks.clear()
      for (const callback of pending) callback()
    },
  }
}
