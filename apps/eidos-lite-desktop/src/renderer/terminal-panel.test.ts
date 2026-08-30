// @vitest-environment jsdom

import { act, createElement, StrictMode } from "react"
import { createRoot } from "react-dom/client"

interface MockTerminalInstance {
  element: HTMLElement | null
  options: Record<string, unknown>
  writes: string[]
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
    writes: string[] = []
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
    write(data: string) {
      this.writes.push(data)
    }
    reset() {}
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
import { EIDOS_LITE_SPACE_PATH_DRAG_TYPE } from "./space-path-drag"

it("keeps independent terminal tabs through Strict Mode remounts", async () => {
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

  let nextSession = 0
  const startTerminal = vi.fn(async () => ({
    id: `terminal-session-${++nextSession}`,
    shell: "zsh",
  }))
  const closeTerminal = vi.fn().mockResolvedValue(undefined)
  const openExternalUrl = vi.fn().mockResolvedValue(undefined)
  const writeTerminal = vi.fn()
  const writeTerminalPath = vi.fn().mockResolvedValue(undefined)
  const writeClipboardText = vi.fn().mockResolvedValue(undefined)
  const resizeTerminal = vi.fn()
  const onCycleLayout = vi.fn()
  const titlebarNavigationClick = vi.fn()
  let terminalDataListener: ((sessionId: string, data: string) => void) | null =
    null
  Object.assign(window, {
    eidosLite: {
      startTerminal,
      closeTerminal,
      writeTerminal,
      writeTerminalPath,
      writeClipboardText,
      resizeTerminal,
      openExternalUrl,
      onTerminalData: vi.fn((listener) => {
        terminalDataListener = listener
        return () => {
          if (terminalDataListener === listener) terminalDataListener = null
        }
      }),
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
          layout: "bottom",
          layoutShortcutLabel: "⌃⇧`",
          open: true,
          spaceName: "Test Space",
          theme: "dark",
          titlebarNavigation: createElement(
            "button",
            {
              "data-test-titlebar-navigation": true,
              onClick: titlebarNavigationClick,
            },
            "Toggle sidebar"
          ),
          onClose: vi.fn(),
          onCycleLayout,
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
  const titlebarNavigation = host.querySelector<HTMLButtonElement>(
    "[data-test-titlebar-navigation]"
  )
  expect(titlebarNavigation?.closest(".terminal-panel-header")).not.toBeNull()
  titlebarNavigation?.click()
  expect(titlebarNavigationClick).toHaveBeenCalledOnce()

  await act(async () => {
    host
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Move terminal beside file content"]'
      )
      ?.click()
  })
  expect(onCycleLayout).toHaveBeenCalledOnce()

  const terminal = xtermState.instances.at(-1)
  terminal?.emitData("中文输入")
  expect(writeTerminal).toHaveBeenCalledWith("terminal-session-1", "中文输入")
  terminal?.emitResize(120, 36)
  expect(resizeTerminal).toHaveBeenCalledWith("terminal-session-1", 120, 36)

  const dataTransfer = {
    dropEffect: "none",
    types: [EIDOS_LITE_SPACE_PATH_DRAG_TYPE],
    getData: (type: string) =>
      type === EIDOS_LITE_SPACE_PATH_DRAG_TYPE ? "notes/today's draft.md" : "",
  }
  const terminalViewport = host.querySelector(".terminal-viewport")
  const dragOver = new Event("dragover", { bubbles: true, cancelable: true })
  Object.defineProperty(dragOver, "dataTransfer", { value: dataTransfer })
  terminalViewport?.dispatchEvent(dragOver)
  expect(dragOver.defaultPrevented).toBe(true)
  expect(dataTransfer.dropEffect).toBe("copy")

  const drop = new Event("drop", { bubbles: true, cancelable: true })
  Object.defineProperty(drop, "dataTransfer", { value: dataTransfer })
  terminalViewport?.dispatchEvent(drop)
  expect(drop.defaultPrevented).toBe(true)
  expect(writeTerminalPath).toHaveBeenCalledWith(
    "terminal-session-1",
    "notes/today's draft.md"
  )

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
          layout: "bottom",
          layoutShortcutLabel: "⌃⇧`",
          open: true,
          spaceName: "Test Space",
          theme: "light",
          onClose: vi.fn(),
          onCycleLayout,
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

  const addTerminalButton = host.querySelector<HTMLButtonElement>(
    'button[aria-label="New terminal"]'
  )
  expect(
    addTerminalButton?.parentElement?.classList.contains(
      "terminal-panel-tab-strip"
    )
  ).toBe(true)
  expect(addTerminalButton?.previousElementSibling?.getAttribute("role")).toBe(
    "tablist"
  )
  expect(
    host.querySelector('.terminal-panel-actions [aria-label="New terminal"]')
  ).toBeNull()

  await act(async () => {
    addTerminalButton?.click()
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(startTerminal).toHaveBeenCalledTimes(2)
  expect(host.querySelectorAll(".terminal-emulator")).toHaveLength(2)
  const tabButtons = host.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  expect(tabButtons).toHaveLength(2)
  expect(tabButtons[0]?.getAttribute("aria-selected")).toBe("false")
  expect(tabButtons[1]?.getAttribute("aria-selected")).toBe("true")

  const secondTerminal = xtermState.instances.at(-1)
  secondTerminal?.emitData("second tab input")
  expect(writeTerminal).toHaveBeenCalledWith(
    "terminal-session-2",
    "second tab input"
  )
  await act(async () => {
    terminalDataListener?.("terminal-session-1", "first output")
    terminalDataListener?.("terminal-session-2", "second output")
  })
  expect(terminal?.writes).toContain("first output")
  expect(secondTerminal?.writes).toContain("second output")

  await act(async () => tabButtons[0]?.click())
  const panes = host.querySelectorAll<HTMLElement>(".terminal-session-viewport")
  expect(panes[0]?.hidden).toBe(false)
  expect(panes[1]?.hidden).toBe(true)
  terminal?.emitData("first tab again")
  expect(writeTerminal).toHaveBeenCalledWith(
    "terminal-session-1",
    "first tab again"
  )

  await act(async () => {
    host
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Close terminal tab: Terminal 1"]'
      )
      ?.click()
    await Promise.resolve()
  })
  expect(closeTerminal).toHaveBeenCalledWith("terminal-session-1")
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(1)
  expect(
    host.querySelector('[role="tab"]')?.getAttribute("aria-selected")
  ).toBe("true")

  await act(async () => {
    addTerminalButton?.click()
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(
    [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].map(
      (button) => button.textContent
    )
  ).toEqual(["Terminal 2", "Terminal 1"])
  expect(startTerminal).toHaveBeenCalledTimes(3)

  await act(async () => {
    host
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Close terminal tab: Terminal 2"]'
      )
      ?.click()
    await Promise.resolve()
  })
  await act(async () => {
    host
      .querySelector<HTMLButtonElement>(
        'button[aria-label="Close terminal tab: Terminal 1"]'
      )
      ?.click()
    await Promise.resolve()
  })
  expect(host.querySelectorAll('[role="tab"]')).toHaveLength(0)
  expect(closeTerminal).toHaveBeenCalledWith("terminal-session-2")
  expect(closeTerminal).toHaveBeenCalledWith("terminal-session-3")

  await act(async () => {
    addTerminalButton?.click()
    await Promise.resolve()
    await Promise.resolve()
  })
  expect(host.querySelector('[role="tab"]')?.textContent).toBe("Terminal 1")
  expect(startTerminal).toHaveBeenCalledTimes(4)

  await act(async () => root.unmount())
  expect(closeTerminal).toHaveBeenCalledWith("terminal-session-4")
  host.remove()
  delete document.documentElement.dataset.theme
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
