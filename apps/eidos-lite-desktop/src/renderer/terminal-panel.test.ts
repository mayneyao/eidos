// @vitest-environment jsdom

import { act, createElement, StrictMode } from "react"
import { createRoot } from "react-dom/client"

interface MockTerminalInstance {
  element: HTMLElement | null
  options: Record<string, unknown>
  emitData(data: string): void
  emitKey(event: KeyboardEvent): boolean
  emitResize(cols: number, rows: number): void
  setSelection(selection: string): void
}

const xtermState = vi.hoisted(() => ({
  instances: [] as MockTerminalInstance[],
  fitCalls: 0,
  webLinkHandlers: [] as Array<(event: MouseEvent, uri: string) => void>,
}))

vi.mock("@xterm/xterm", () => ({
  Terminal: class MockTerminal implements MockTerminalInstance {
    element: HTMLElement | null = null
    options: Record<string, unknown>
    private dataListener: ((data: string) => void) | null = null
    private keyHandler: ((event: KeyboardEvent) => boolean) | null = null
    private resizeListener:
      | ((size: { cols: number; rows: number }) => void)
      | null = null
    private selection = ""

    constructor(options: Record<string, unknown>) {
      this.options = options
      xtermState.instances.push(this)
    }

    loadAddon() {}

    attachCustomKeyEventHandler(listener: (event: KeyboardEvent) => boolean) {
      this.keyHandler = listener
    }

    hasSelection() {
      return this.selection.length > 0
    }

    getSelection() {
      return this.selection
    }

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

    emitKey(event: KeyboardEvent) {
      return this.keyHandler?.(event) ?? true
    }

    emitResize(cols: number, rows: number) {
      this.resizeListener?.({ cols, rows })
    }

    setSelection(selection: string) {
      this.selection = selection
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

vi.mock("@xterm/addon-web-links", () => ({
  WebLinksAddon: class MockWebLinksAddon {
    constructor(handler: (event: MouseEvent, uri: string) => void) {
      xtermState.webLinkHandlers.push(handler)
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
      if (styledElement.style.color.includes("--canvas")) {
        return {
          color:
            colorScheme === "light" ? "rgb(255, 255, 255)" : "rgb(12, 18, 21)",
        } as CSSStyleDeclaration
      }
      if (styledElement.style.color.includes("--lite-accent")) {
        return {
          color:
            colorScheme === "light" ? "rgb(0, 120, 150)" : "rgb(80, 200, 220)",
        } as CSSStyleDeclaration
      }
      if (
        styledElement.style.color.includes("--terminal-selection-background")
      ) {
        return {
          color: "rgba(255, 255, 255, 0.3)",
        } as CSSStyleDeclaration
      }
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
  const openExternalUrl = vi.fn().mockResolvedValue(undefined)
  const writeTerminal = vi.fn()
  const writeClipboardText = vi.fn().mockResolvedValue(undefined)
  const resizeTerminal = vi.fn()
  Object.assign(window, {
    eidosLite: {
      startTerminal,
      closeTerminal,
      writeTerminal,
      writeClipboardText,
      resizeTerminal,
      openExternalUrl,
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

  terminal?.setSelection("selected 中文 output")
  expect(
    terminal?.emitKey(new KeyboardEvent("keydown", { key: "c", metaKey: true }))
  ).toBe(false)
  expect(writeClipboardText).toHaveBeenCalledWith("selected 中文 output")
  terminal?.setSelection("")
  expect(
    terminal?.emitKey(new KeyboardEvent("keydown", { key: "c", ctrlKey: true }))
  ).toBe(true)
  expect(
    terminal?.emitKey(new KeyboardEvent("keydown", { key: "c", metaKey: true }))
  ).toBe(false)

  const plainUrl = "https://eidos.space/docs"
  xtermState.webLinkHandlers.at(-1)?.(new MouseEvent("click"), plainUrl)
  expect(openExternalUrl).toHaveBeenCalledWith(plainUrl)
  const oscLinkHandler = terminal?.options.linkHandler as
    | { activate(event: MouseEvent, uri: string): void }
    | undefined
  const oscUrl = "https://editor.eidos.space/"
  oscLinkHandler?.activate(new MouseEvent("click"), oscUrl)
  expect(openExternalUrl).toHaveBeenCalledWith(oscUrl)

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
  expect(
    (terminal?.options.theme as { selectionBackground?: string })
      .selectionBackground
  ).toBe("rgb(0, 120, 150)")

  await act(async () => root.unmount())
  expect(closeTerminal).toHaveBeenCalledWith("terminal-session")
  host.remove()
  delete document.documentElement.dataset.theme
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
