// @vitest-environment node

import "reflect-metadata"

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({
  BrowserWindow: class {},
  MessageChannelMain: class {},
  session: {},
}))

describe("ElectronFileExtensionRuntimeTransport", () => {
  beforeEach(() => vi.restoreAllMocks())

  it("starts the port only after the runtime listener is installed", async () => {
    const { ElectronFileExtensionRuntimeTransport } =
      await import("./electron-runtime-transport")
    const portListeners = new Map<string, (event?: unknown) => void>()
    const windowListeners = new Map<string, () => void>()
    const webContentsListeners = new Map<string, () => void>()
    const port = {
      on: vi.fn((event: string, listener: (event?: unknown) => void) => {
        portListeners.set(event, listener)
      }),
      start: vi.fn(),
      postMessage: vi.fn(),
      close: vi.fn(),
    }
    const runtimeWindow = {
      on: vi.fn((event: string, listener: () => void) => {
        windowListeners.set(event, listener)
      }),
      webContents: {
        on: vi.fn((event: string, listener: () => void) => {
          webContentsListeners.set(event, listener)
        }),
      },
      isDestroyed: vi.fn(() => false),
      destroy: vi.fn(),
    }
    const runtimeSession = { clearStorageData: vi.fn(async () => undefined) }
    const transport = new ElectronFileExtensionRuntimeTransport(
      runtimeWindow as never,
      runtimeSession as never,
      port as never
    )

    expect(port.start).not.toHaveBeenCalled()
    const onMessage = vi.fn()
    transport.onMessage(onMessage)
    expect(port.start).toHaveBeenCalledOnce()

    portListeners.get("message")?.({ data: { type: "ready" } })
    expect(onMessage).toHaveBeenCalledWith({ type: "ready" })

    transport.onMessage(onMessage)
    expect(port.start).toHaveBeenCalledOnce()
  })

  it("reports a renderer close that happens before onClose registration", async () => {
    const { ElectronFileExtensionRuntimeTransport } =
      await import("./electron-runtime-transport")
    const portListeners = new Map<string, () => void>()
    const port = {
      on: vi.fn((event: string, listener: () => void) => {
        portListeners.set(event, listener)
      }),
      start: vi.fn(),
      postMessage: vi.fn(),
      close: vi.fn(),
    }
    const runtimeWindow = {
      on: vi.fn(),
      webContents: { on: vi.fn() },
      isDestroyed: vi.fn(() => false),
      destroy: vi.fn(),
    }
    const runtimeSession = { clearStorageData: vi.fn(async () => undefined) }
    const transport = new ElectronFileExtensionRuntimeTransport(
      runtimeWindow as never,
      runtimeSession as never,
      port as never
    )

    portListeners.get("close")?.()
    const onClose = vi.fn()
    transport.onClose(onClose)
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce())

    transport.dispose()
    expect(runtimeWindow.destroy).toHaveBeenCalledOnce()
    expect(runtimeSession.clearStorageData).toHaveBeenCalledOnce()
  })
})
