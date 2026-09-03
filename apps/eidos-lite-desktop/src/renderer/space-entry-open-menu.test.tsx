// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { SpaceTreeEntry } from "../shared/contracts"
import { SpaceEntryOpenMenuItems } from "./space-entry-open-menu"

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

  it("does not offer editor choices for non-Markdown files", async () => {
    await render({
      ...markdownEntry,
      name: "notes.txt",
      relativePath: "notes.txt",
    })

    expect(host?.textContent).toContain("Open")
    expect(host?.textContent).not.toContain("Open with")
  })
})
