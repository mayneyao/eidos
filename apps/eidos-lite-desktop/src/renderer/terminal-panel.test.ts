// @vitest-environment jsdom

import { act, createElement, StrictMode } from "react"
import { createRoot } from "react-dom/client"

interface MockTerminalInstance {
  element: HTMLElement | null
  options: Record<string, unknown>
  emitData(data: string): void
  emitResize(cols: number, rows: number): void
}

const xtermState = vi.hoisted(() => ({
  instances: [] as MockTerminalInstance[],
  fitCalls: 0,
}))

vi.mock("@xterm/xterm", () => ({
  Terminal: class MockTerminal implements MockTerminalInstance {
    element: HTMLElement | null = null
    options: Record<string, unknown>
    private dataListener: ((data: string) => void) | null = null
    private resizeListener:
      | ((size: { cols: number; rows: number }) => void)
      | null = null

    constructor(options: Record<string, unknown>) {
      this.options = options
      xtermState.instances.push(this)
    }

    loadAddon() {}

    open(element: HTMLElement) {
      this.element = element
      const marker = document.createElement("span")
      marker.className = "mock-xterm-screen"
      element.appendChild(marker)
    }

    onData(listener: (data: string) => void) {
      this.dataListener = listener
      return { dispose: () => (this.dataListener = null) }
    }

    onResize(listener: (size: { cols: number; rows: number }) => void) {
      this.resizeListener = listener
      return { dispose: () => (this.resizeListener = null) }
    }

    emitData(data: string) {
      this.dataListener?.(data)
    }

    emitResize(cols: number, rows: number) {
      this.resizeListener?.({ cols, rows })
    }

    focus() {}
    write() {}
    reset() {}
    clear() {}
    dispose() {
      this.element?.replaceChildren()
    }
  },
}))

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class MockFitAddon {
    fit() {
      xtermState.fitCalls += 1
    }
  },
}))

import { TerminalPanel } from "./terminal-panel"

it("keeps one current xterm session through Strict Mode remounts", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  const frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 0
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = ++nextFrame
    frames.set(id, callback)
    queueMicrotask(() => {
      const current = frames.get(id)
      if (!current) return
      frames.delete(id)
      current(performance.now())
    })
    return id
  })
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    frames.delete(id)
  })
  class MockResizeObserver {
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", MockResizeObserver)
  document.documentElement.dataset.theme = "dark"
  const nativeGetComputedStyle = window.getComputedStyle.bind(window)
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
    const styledElement = element as HTMLElement
    if (styledElement.style.color.startsWith("var(")) {
      const colorScheme =
        styledElement.style.getPropertyValue("color-scheme") ||
        document.documentElement.dataset.theme
      return {
        color:
          colorScheme === "light" ? "rgb(255, 255, 255)" : "rgb(12, 18, 21)",
      } as CSSStyleDeclaration
    }
    return nativeGetComputedStyle(element)
  })

  const startTerminal = vi
    .fn()
    .mockResolvedValue({ id: "terminal-session", shell: "zsh" })
  const closeTerminal = vi.fn().mockResolvedValue(undefined)
  const writeTerminal = vi.fn()
  const resizeTerminal = vi.fn()
  Object.assign(window, {
    eidosLite: {
      startTerminal,
      closeTerminal,
      writeTerminal,
      resizeTerminal,
      openExternalUrl: vi.fn().mockResolvedValue(undefined),
      onTerminalData: vi.fn(() => () => {}),
      onTerminalExit: vi.fn(() => () => {}),
    },
  })

  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(TerminalPanel, {
          open: true,
          placement: "bottom",
          placementShortcutLabel: "⌃⇧`",
          spaceName: "Test Space",
          theme: "dark",
          onClose: vi.fn(),
          onTogglePlacement: vi.fn(),
        })
      )
    )
    await Promise.resolve()
    await Promise.resolve()
  })

  expect(xtermState.instances).toHaveLength(2)
  expect(host.querySelectorAll(".terminal-emulator")).toHaveLength(1)
  expect(
    host.querySelector(".terminal-emulator .mock-xterm-screen")
  ).not.toBeNull()
  expect(startTerminal).toHaveBeenCalledOnce()
  expect(xtermState.fitCalls).toBeGreaterThan(0)

  const terminal = xtermState.instances.at(-1)
  terminal?.emitData("中文输入")
  expect(writeTerminal).toHaveBeenCalledWith("terminal-session", "中文输入")
  terminal?.emitResize(120, 36)
  expect(resizeTerminal).toHaveBeenCalledWith("terminal-session", 120, 36)

  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(TerminalPanel, {
          open: true,
          placement: "bottom",
          placementShortcutLabel: "⌃⇧`",
          spaceName: "Test Space",
          theme: "light",
          onClose: vi.fn(),
          onTogglePlacement: vi.fn(),
        })
      )
    )
    await Promise.resolve()
  })
  expect((terminal?.options.theme as { background?: string }).background).toBe(
    "rgb(255, 255, 255)"
  )

  await act(async () => root.unmount())
  expect(closeTerminal).toHaveBeenCalledWith("terminal-session")
  host.remove()
  delete document.documentElement.dataset.theme
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
