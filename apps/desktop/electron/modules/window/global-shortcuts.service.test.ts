// @vitest-environment node

import "reflect-metadata"

import { beforeEach, describe, expect, it, vi } from "vitest"

import type { LoggerService } from "../logger/logger.service"
import { GlobalShortcutsService } from "./global-shortcuts.service"
import type { WindowService } from "./window.service"

const electronMocks = vi.hoisted(() => ({
  register: vi.fn<(accelerator: string, callback: () => void) => boolean>(),
  unregisterAll: vi.fn(),
}))

vi.mock("electron", () => ({
  globalShortcut: electronMocks,
}))

vi.mock("../../common/di", () => ({
  Inject: () => () => undefined,
  Injectable: () => (target: unknown) => target,
}))

interface FakeWindow {
  emit(event: "focus" | "blur"): void
  isDestroyed: ReturnType<typeof vi.fn>
  isFocused: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  webContents: {
    send: ReturnType<typeof vi.fn>
  }
}

const createWindow = (initiallyFocused: boolean): FakeWindow => {
  const listeners = new Map<string, Array<() => void>>()
  const window = {
    emit(event: "focus" | "blur") {
      for (const listener of listeners.get(event) ?? []) {
        listener()
      }
    },
    isDestroyed: vi.fn(() => false),
    isFocused: vi.fn(() => initiallyFocused),
    on: vi.fn((event: string, listener: () => void) => {
      const eventListeners = listeners.get(event) ?? []
      eventListeners.push(listener)
      listeners.set(event, eventListeners)
      return window
    }),
    webContents: {
      send: vi.fn(),
    },
  }

  return window
}

const createService = (window: FakeWindow) => {
  const logger = {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  } as unknown as LoggerService
  const windowService = {
    getMainWindow: () => window,
  } as unknown as WindowService
  const service = new GlobalShortcutsService(logger)

  service.setWindowService(windowService)

  return service
}

describe("GlobalShortcutsService", () => {
  beforeEach(() => {
    electronMocks.register.mockReset()
    electronMocks.register.mockReturnValue(true)
    electronMocks.unregisterAll.mockReset()
  })

  it("registers shortcuts when listeners are attached to an already focused window", () => {
    const window = createWindow(true)
    const service = createService(window)

    service.setupWindowFocusListeners()

    expect(service.getWindowFocusState()).toBe(true)
    expect(service.isShortcutsRegistered()).toBe(true)
    expect(electronMocks.register).toHaveBeenCalledWith(
      "CommandOrControl+P",
      expect.any(Function)
    )
  })

  it("waits for focus before registering shortcuts for a background window", () => {
    const window = createWindow(false)
    const service = createService(window)

    service.setupWindowFocusListeners()

    expect(electronMocks.register).not.toHaveBeenCalled()
    expect(service.isShortcutsRegistered()).toBe(false)

    window.emit("focus")

    expect(service.isShortcutsRegistered()).toBe(true)
    expect(electronMocks.register).toHaveBeenCalledWith(
      "CommandOrControl+P",
      expect.any(Function)
    )
  })

  it("dispatches the Cmd+P action to the renderer", () => {
    const window = createWindow(true)
    const service = createService(window)

    service.setupWindowFocusListeners()

    const registration = electronMocks.register.mock.calls.find(
      ([accelerator]) => accelerator === "CommandOrControl+P"
    )
    expect(registration).toBeDefined()

    registration?.[1]()

    expect(window.webContents.send).toHaveBeenCalledWith(
      "global-shortcut-triggered",
      expect.objectContaining({
        accelerator: "CommandOrControl+P",
        id: "toggle-global-search",
      })
    )
  })

  it("unregisters shortcuts on blur and registers them again on refocus", () => {
    const window = createWindow(true)
    const service = createService(window)

    service.setupWindowFocusListeners()
    window.emit("blur")

    expect(service.getWindowFocusState()).toBe(false)
    expect(service.isShortcutsRegistered()).toBe(false)

    const registerCallsAfterBlur = electronMocks.register.mock.calls.length
    window.emit("focus")

    expect(service.getWindowFocusState()).toBe(true)
    expect(service.isShortcutsRegistered()).toBe(true)
    expect(electronMocks.register.mock.calls.length).toBeGreaterThan(
      registerCallsAfterBlur
    )
  })
})
