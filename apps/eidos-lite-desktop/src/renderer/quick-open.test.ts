// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { EidosLiteApi } from "../shared/contracts"
import { QuickOpen } from "./quick-open"

const recentFiles = [
  { relativePath: "notes/readme.md", name: "readme.md", kind: "file" as const },
  { relativePath: "data/crm.eidos", name: "crm.eidos", kind: "eidos" as const },
]

function keyDown(target: HTMLElement, key: string) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
  )
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value"
  )?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

describe("QuickOpen", () => {
  let host: HTMLDivElement | null = null
  let root: Root | null = null
  const scrollIntoView = vi.fn()

  // jsdom does not implement the browser's modal top layer.
  beforeEach(() => {
    scrollIntoView.mockClear()
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    })
    Object.defineProperties(HTMLDialogElement.prototype, {
      showModal: {
        configurable: true,
        value: vi.fn(function (this: HTMLDialogElement) {
          this.open = true
        }),
      },
      close: {
        configurable: true,
        value: vi.fn(function (this: HTMLDialogElement) {
          this.open = false
        }),
      },
    })
  })

  it("opens a native modal, focuses search, and handles native dismissal", async () => {
    const onClose = vi.fn()
    await renderQuickOpen({ onClose })
    const dialog = host!.querySelector("dialog")!
    expect(dialog.showModal).toHaveBeenCalledOnce()
    expect(dialog.open).toBe(true)
    expect(document.activeElement).toBe(host!.querySelector("input"))
    const cancel = new Event("cancel", { cancelable: true })
    await act(async () => {
      dialog.dispatchEvent(cancel)
    })
    expect(cancel.defaultPrevented).toBe(true)
    expect(onClose).toHaveBeenCalledOnce()
    await act(async () => {
      root!.unmount()
    })
    root = null
    expect(dialog.close).toHaveBeenCalledOnce()
  })

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    host?.remove()
    host = null
    root = null
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
  })

  async function renderQuickOpen(props: {
    recentFiles?: typeof recentFiles
    onOpen?: (selection: {
      kind: string
      name: string
      relativePath: string
    }) => void
    onOpenTable?: (tableId: string) => void
    onClose?: () => void
    activeTableSource?: {
      relativePath: string
      tables: { tableId: string; name: string }[]
    } | null
  }) {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root?.render(
        createElement(QuickOpen, {
          recentFiles: props.recentFiles ?? recentFiles,
          activeTableSource: props.activeTableSource ?? null,
          onOpen: props.onOpen ?? (() => undefined),
          onOpenTable: props.onOpenTable ?? (() => undefined),
          onClose: props.onClose ?? (() => undefined),
        })
      )
    })
    return host
  }

  it("lists recent files before any query is typed", async () => {
    await renderQuickOpen({})
    expect(host?.textContent).toContain("readme.md")
    expect(host?.textContent).toContain("crm.eidos")
    expect(host?.textContent).toContain("notes/")
  })

  it("keeps keyboard selection visible through long lists and wraparound without moving focus", async () => {
    const files = Array.from({ length: 30 }, (_, index) => ({
      relativePath: `notes/${index}.md`,
      name: `${index}.md`,
      kind: "file" as const,
    }))
    const onOpen = vi.fn()
    await renderQuickOpen({ recentFiles: files, onOpen })
    const input = host!.querySelector("input")!

    async function move(key: string, index: number) {
      scrollIntoView.mockClear()
      await act(async () => keyDown(input, key))
      const selected = host!.querySelector('[aria-selected="true"]')!
      expect(selected.id).toBe(`quick-open-item-${index}`)
      expect(input.getAttribute("aria-activedescendant")).toBe(selected.id)
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: "nearest",
        inline: "nearest",
        behavior: "instant",
      })
      expect(scrollIntoView.mock.contexts.at(-1)).toBe(selected)
      expect(document.activeElement).toBe(input)
    }

    await move("ArrowUp", 29)
    await move("ArrowDown", 0)
    for (let index = 1; index <= 20; index++) await move("ArrowDown", index)
    await move("ArrowUp", 19)
    await act(async () => keyDown(input, "Enter"))
    expect(onOpen).toHaveBeenCalledWith(files[19])
  })

  it("reveals the first result when an asynchronous search replaces the list", async () => {
    const searchSpacePaths = vi
      .fn()
      .mockResolvedValue([
        { relativePath: "a.md", name: "a.md", kind: "file", score: 10 },
      ])
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: { searchSpacePaths } as unknown as EidosLiteApi,
    })
    await renderQuickOpen({})
    const input = host!.querySelector("input")!
    await act(async () => keyDown(input, "ArrowDown"))
    await act(async () => setInputValue(input, "md"))
    scrollIntoView.mockClear()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150))
    })
    const selected = host!.querySelector('[aria-selected="true"]')!
    expect(selected.textContent).toContain("a.md")
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(selected)
    expect(document.activeElement).toBe(input)
  })

  it("ignores stationary hover after keyboard navigation and resumes selection on mouse movement", async () => {
    const onOpen = vi.fn()
    await renderQuickOpen({ onOpen })
    const input = host!.querySelector("input")!
    const options = host!.querySelectorAll<HTMLButtonElement>('[role="option"]')
    await act(async () => keyDown(input, "ArrowDown"))
    scrollIntoView.mockClear()

    await act(async () => {
      options[0].dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
      options[0].dispatchEvent(new MouseEvent("mousemove", { bubbles: true }))
    })
    expect(options[1].getAttribute("aria-selected")).toBe("true")
    expect(scrollIntoView).not.toHaveBeenCalled()

    await act(async () => {
      const movement = new MouseEvent("mousemove", { bubbles: true })
      Object.defineProperties(movement, {
        movementX: { value: 1 },
        movementY: { value: 0 },
      })
      options[0].dispatchEvent(movement)
    })
    expect(options[0].getAttribute("aria-selected")).toBe("true")
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(input)
    await act(async () => keyDown(input, "Enter"))
    expect(onOpen).toHaveBeenCalledWith(recentFiles[0])
  })

  it("searches after a debounce and opens the top hit with Enter", async () => {
    const searchSpacePaths = vi.fn().mockResolvedValue([
      {
        relativePath: "notes/meeting-notes.md",
        name: "meeting-notes.md",
        kind: "file",
        score: 42,
      },
    ])
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: { searchSpacePaths } as unknown as EidosLiteApi,
    })
    const onOpen = vi.fn()
    await renderQuickOpen({ onOpen })

    const input = host?.querySelector<HTMLInputElement>(
      'input[aria-label="Search files by name"]'
    )
    expect(input).not.toBeNull()
    await act(async () => {
      setInputValue(input!, "meeting")
    })
    expect(searchSpacePaths).not.toHaveBeenCalled()
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 150))
    })
    expect(searchSpacePaths).toHaveBeenCalledWith("meeting", 50)
    expect(host?.textContent).toContain("meeting-notes.md")

    await act(async () => {
      keyDown(input!, "Enter")
    })
    expect(onOpen).toHaveBeenCalledWith({
      kind: "file",
      name: "meeting-notes.md",
      relativePath: "notes/meeting-notes.md",
    })
  })

  it("moves the selection with arrow keys and opens that item", async () => {
    const searchSpacePaths = vi.fn().mockResolvedValue([
      { relativePath: "a.md", name: "a.md", kind: "file", score: 10 },
      { relativePath: "b.md", name: "b.md", kind: "file", score: 9 },
    ])
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: { searchSpacePaths } as unknown as EidosLiteApi,
    })
    const onOpen = vi.fn()
    await renderQuickOpen({ onOpen })
    const input = host?.querySelector<HTMLInputElement>(
      'input[aria-label="Search files by name"]'
    )
    await act(async () => {
      setInputValue(input!, "md")
      await new Promise((resolve) => setTimeout(resolve, 150))
    })

    await act(async () => {
      keyDown(input!, "ArrowDown")
    })
    await act(async () => {
      keyDown(input!, "Enter")
    })
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: "b.md" })
    )
  })

  it("closes on Escape and when the backdrop is clicked", async () => {
    const onClose = vi.fn()
    await renderQuickOpen({ onClose })
    const input = host?.querySelector<HTMLInputElement>(
      'input[aria-label="Search files by name"]'
    )
    await act(async () => {
      keyDown(input!, "Escape")
    })
    expect(onClose).toHaveBeenCalledTimes(1)

    await act(async () => {
      host
        ?.querySelector(".quick-open-backdrop")
        ?.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, cancelable: true })
        )
    })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it("shows an empty state when nothing matches", async () => {
    const searchSpacePaths = vi.fn().mockResolvedValue([])
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: { searchSpacePaths } as unknown as EidosLiteApi,
    })
    await renderQuickOpen({})
    const input = host?.querySelector<HTMLInputElement>(
      'input[aria-label="Search files by name"]'
    )
    await act(async () => {
      setInputValue(input!, "zzzz")
      await new Promise((resolve) => setTimeout(resolve, 150))
    })
    expect(host?.textContent).toContain("No matching files")
  })

  it("reports index failure instead of claiming there are no matching files", async () => {
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: {
        searchSpacePaths: vi
          .fn()
          .mockRejectedValue(new Error("Index scan failed")),
      },
    })
    await renderQuickOpen({})
    const input = host?.querySelector<HTMLInputElement>(
      'input[aria-label="Search files by name"]'
    )
    await act(async () => {
      setInputValue(input!, "RELEASE_NOTES")
      await new Promise((resolve) => setTimeout(resolve, 150))
    })
    expect(host?.textContent).toContain("Index scan failed")
    expect(host?.textContent).not.toContain("No matching files")
  })

  it("lists active Eidos File tables before any query is typed", async () => {
    await renderQuickOpen({
      activeTableSource: {
        relativePath: "data/crm.eidos",
        tables: [
          { tableId: "tbl-1", name: "backlogs" },
          { tableId: "tbl-2", name: "contacts" },
        ],
      },
    })
    const text = host?.textContent ?? ""
    expect(text).toContain("backlogs")
    expect(text).toContain("contacts")
    expect(text).toContain("data/crm.eidos")
    expect(text.indexOf("backlogs")).toBeLessThan(text.indexOf("readme.md"))
  })

  it("filters tables with a fuzzy query and jumps with Enter", async () => {
    const searchSpacePaths = vi.fn().mockResolvedValue([])
    Object.defineProperty(window, "eidosLite", {
      configurable: true,
      value: { searchSpacePaths } as unknown as EidosLiteApi,
    })
    const onOpenTable = vi.fn()
    const onOpen = vi.fn()
    await renderQuickOpen({
      onOpen,
      onOpenTable,
      activeTableSource: {
        relativePath: "data/crm.eidos",
        tables: [
          { tableId: "tbl-1", name: "backlogs" },
          { tableId: "tbl-2", name: "contacts" },
        ],
      },
    })
    const input = host?.querySelector<HTMLInputElement>(
      'input[aria-label="Search files by name"]'
    )
    await act(async () => {
      setInputValue(input!, "ctc")
      await new Promise((resolve) => setTimeout(resolve, 150))
    })
    expect(host?.textContent).toContain("contacts")
    expect(host?.textContent).not.toContain("backlogs")

    await act(async () => {
      keyDown(input!, "Enter")
    })
    expect(onOpenTable).toHaveBeenCalledWith("tbl-2")
    expect(onOpen).not.toHaveBeenCalled()
  })
})
