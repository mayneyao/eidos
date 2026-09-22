// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SpaceTreeEntry } from "../shared/contracts"
import {
  SpaceEntryOpenMenuItems,
  SpaceEntryOpenActions,
} from "./space-entry-open-menu"

const markdownEntry: SpaceTreeEntry = {
  name: "README.md",
  relativePath: "docs/README.md",
  kind: "file",
  size: 42,
  modifiedAtMs: 1,
}

describe("SpaceEntryOpenMenuItems", () => {
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    host?.remove()
    host = null
    root = null
  })

  async function render(entry: SpaceTreeEntry, onOpen = vi.fn()) {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    await act(async () => {
      root?.render(createElement(SpaceEntryOpenMenuItems, { entry, onOpen }))
    })
    return onOpen
  }

  function button(label: string): HTMLButtonElement {
    const match = [...(host?.querySelectorAll("button") ?? [])].find(
      (candidate) => candidate.textContent?.trim() === label
    )
    if (!(match instanceof HTMLButtonElement)) {
      throw new Error(`Missing ${label} button`)
    }
    return match
  }

  it("opens Markdown with the configured default from the primary action", async () => {
    const onOpen = await render(markdownEntry)

    await act(async () => button("Open").click())

    expect(onOpen).toHaveBeenCalledWith()
  })

  it("offers Source and Rich text as per-open Markdown choices", async () => {
    const onOpen = await render(markdownEntry)

    await act(async () => button("Open with").click())
    expect(host?.querySelector('[role="menu"]')?.textContent).toContain(
      "Source"
    )
    expect(host?.querySelector('[role="menu"]')?.textContent).toContain(
      "Rich text"
    )

    await act(async () => button("Source").click())
    await act(async () => button("Rich text").click())

    expect(onOpen).toHaveBeenNthCalledWith(1, "source")
    expect(onOpen).toHaveBeenNthCalledWith(2, "wysiwyg")
  })

  it.each(["page.html", "page.HTM"])(
    "offers Preview and Source for %s",
    async (name) => {
      const onOpen = await render({
        ...markdownEntry,
        name,
        relativePath: name,
      })
      await act(async () => button("Open").click())
      expect(onOpen).toHaveBeenLastCalledWith()
      await act(async () => button("Open with").click())
      await act(async () => button("Preview").click())
      expect(onOpen).toHaveBeenLastCalledWith("preview")
      await act(async () => button("Source").click())
      expect(onOpen).toHaveBeenLastCalledWith("source")
      expect(host?.textContent).not.toContain("Rich text")
    }
  )

  it("does not offer editor choices for plain text files", async () => {
    await render({
      ...markdownEntry,
      name: "notes.txt",
      relativePath: "notes.txt",
    })

    expect(host?.textContent).toContain("Open")
    expect(host?.textContent).not.toContain("Open with")
  })
})

describe("SpaceEntryOpenActions", () => {
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  afterEach(async () => {
    if (root) await act(async () => root?.unmount())
    host?.remove()
    host = null
    root = null
  })

  async function renderActions(
    entry: SpaceTreeEntry,
    options: {
      onOpen?: (mode?: any) => void
      onSelectPluginEditor?: (editor: string) => void
      editors?: { key: string; label: string; pluginName: string }[]
    } = {}
  ) {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    Object.assign(window, {
      eidosLite: {
        pluginEditors: vi.fn(async () => options.editors ?? []),
        onPluginEvent: vi.fn(() => () => {}),
      },
    })
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    const onOpen = options.onOpen ?? vi.fn()
    const onSelectPluginEditor = options.onSelectPluginEditor ?? vi.fn()
    await act(async () => {
      root?.render(
        createElement(SpaceEntryOpenActions, {
          entry,
          selectedEditor: "builtin",
          onOpen,
          onSelectPluginEditor,
        })
      )
      await Promise.resolve()
      await Promise.resolve()
    })
    return { onOpen, onSelectPluginEditor }
  }

  it("does not show Open with when file has no plugin editors", async () => {
    await renderActions({
      name: "image.png",
      relativePath: "image.png",
      kind: "file",
      size: 100,
      modifiedAtMs: 1,
    })

    expect(host?.textContent).toContain("Open")
    expect(host?.textContent).not.toContain("Open with")
  })

  it.each(["file", "eidos"] as const)(
    "shows built-in and plugin editors for %s entries",
    async (kind) => {
      const { onSelectPluginEditor } = await renderActions(
        {
          name: kind === "eidos" ? "data.eidos" : "data.csv",
          relativePath: kind === "eidos" ? "data.eidos" : "data.csv",
          kind,
          size: 100,
          modifiedAtMs: 1,
        },
        {
          editors: [
            {
              key: "example.csv/glide",
              label: "Glide Table",
              pluginName: "CSV",
            },
          ],
        }
      )

      expect(host?.textContent).toContain("Open")
      expect(host?.textContent).toContain("Open with")

      const openWithBtn = [...(host?.querySelectorAll("button") ?? [])].find(
        (b) => b.textContent?.trim() === "Open with"
      )
      await act(async () => openWithBtn?.click())

      expect(host?.textContent).toContain("Built-in editor")
      expect(host?.textContent).toContain("Glide Table")
      expect(host?.textContent).not.toContain("Set as default in this Space")
      expect(host?.textContent).not.toContain("Reset default")

      const glideBtn = [...(host?.querySelectorAll("button") ?? [])].find(
        (b) => b.textContent?.trim() === "Glide Table"
      )
      await act(async () => glideBtn?.click())
      expect(onSelectPluginEditor).toHaveBeenCalledWith("example.csv/glide")
    }
  )

  it("omits Built-in editor for markdown files with plugin editors", async () => {
    await renderActions(markdownEntry, {
      editors: [
        { key: "md.plugin/view", label: "Markdown View", pluginName: "MD" },
      ],
    })

    const openWithBtn = [...(host?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent?.trim() === "Open with"
    )
    await act(async () => openWithBtn?.click())

    expect(host?.textContent).toContain("Source")
    expect(host?.textContent).toContain("Rich text")
    expect(host?.textContent).toContain("Markdown View")
    expect(host?.textContent).not.toContain("Built-in editor")
  })
})
