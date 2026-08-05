// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

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

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    host?.remove()
    host = null
    root = null
  })

  async function renderQuickOpen(props: {
    onOpen?: (selection: {
      kind: string
      name: string
      relativePath: string
    }) => void
    onClose?: () => void
  }) {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root?.render(
        createElement(QuickOpen, {
          recentFiles,
          onOpen: props.onOpen ?? (() => undefined),
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
})
