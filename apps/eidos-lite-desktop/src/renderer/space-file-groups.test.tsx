// @vitest-environment jsdom
import { act, type ComponentProps } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { SpaceFileGroups } from "./space-file-groups"
import {
  selectExplorerFilesPage,
  type ExplorerFilesQuery,
} from "../shared/explorer-file-list"
import { summarizeDocument } from "./explorer-card-summary"

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: {
    count: number
    enabled: boolean
    getItemKey(index: number): string
    estimateSize(index: number): number
  }) => ({
    getVirtualItems: () =>
      options.enabled !== false
        ? Array.from({ length: options.count }, (_, index) => ({
            index,
            key: options.getItemKey(index),
            start: index * 100,
          }))
        : [],
    getTotalSize: () => options.count * 100,
    measureElement: () => {},
    scrollToIndex: () => {},
  }),
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
afterEach(() => {
  vi.unstubAllGlobals()
  window.localStorage.clear()
})
let nextSpace = 0
async function setup(
  content = "# Note\n\nA short **document** with a [link](https://example.com).",
  olderCount = 0
) {
  const preview = vi.fn().mockResolvedValue({
    type: "text",
    content,
  })
  const host = document.createElement("div")
  document.body.append(host)
  const root = createRoot(host)
  const entries = ["one/same.md", "two/same.md", "two/z.md"].map((path) => ({
    name: path.split("/").at(-1)!,
    relativePath: path,
    kind: "file" as const,
    size: 50,
    modifiedAtMs: Date.now(),
  }))
  const props: ComponentProps<typeof SpaceFileGroups> = {
    spaceId: "cards-test-" + nextSpace++,
    entries,
    sort: { by: "name", direction: "ascending" },
    visible: true,
    activePath: null,
    revealToken: 0,
    disabled: false,
    loading: false,
    hasFilter: false,
    renameRequest: null,
    onRetry: vi.fn(),
    onClearFilter: vi.fn(),
    onShowTree: vi.fn(),
    onSelect: vi.fn(),
    onOpen: vi.fn(),
    onRename: vi.fn().mockResolvedValue(undefined),
    onRenameError: vi.fn(),
    onContextMenu: vi.fn(),
  }
  const older = Array.from({ length: olderCount }, (_, index) => ({
    ...entries[0]!,
    name: "old-" + index + ".md",
    relativePath: "old/" + index + ".md",
    modifiedAtMs: Date.now() - 10 * 86400000,
  }))
  const list = vi.fn((query: ExplorerFilesQuery) =>
    Promise.resolve(
      selectExplorerFilesPage([...props.entries, ...older], query)
    )
  )
  vi.stubGlobal("eidosLite", {
    previewTextFile: preview,
    listExplorerFiles: list,
  })
  const render = async () => {
    await act(async () => root.render(<SpaceFileGroups {...props} />))
  }
  await render()
  const card = (path: string) =>
    [...host.querySelectorAll<HTMLElement>("[data-card-path]")].find(
      (node) => node.dataset.cardPath === path
    )!
  const close = async () => {
    await act(async () => root.unmount())
    host.remove()
  }
  return { host, props, entries, preview, list, card, render, close }
}
it("renders flat document excerpts without pin actions or file icons", async () => {
  const ui = await setup()
  try {
    expect(ui.host.querySelector("file-tree-container")).toBeNull()
    expect(ui.host.querySelector(".explorer-card-summary")!.textContent).toBe(
      "A short document with a link."
    )
    expect(ui.host.querySelector(".explorer-card-pin")).toBeNull()
    expect(ui.host.querySelector(".explorer-card-title svg")).toBeNull()
    expect(ui.host.querySelectorAll(".explorer-file-card")).toHaveLength(3)
    expect(ui.preview).toHaveBeenCalledTimes(3)
  } finally {
    await ui.close()
  }
})
it("preserves multi-selection and real file context operations in the card list", async () => {
  const ui = await setup()
  try {
    await act(async () =>
      ui
        .card("one/same.md")
        .querySelector<HTMLButtonElement>(".explorer-card-open")!
        .click()
    )
    vi.mocked(ui.props.onOpen).mockClear()
    await act(async () =>
      ui
        .card("two/z.md")
        .querySelector(".explorer-card-open")!
        .dispatchEvent(
          new MouseEvent("click", { bubbles: true, shiftKey: true })
        )
    )
    expect(ui.props.onOpen).not.toHaveBeenCalled()
    expect(ui.host.querySelectorAll('[data-selected="true"]')).toHaveLength(3)
    await act(async () =>
      ui.card("two/same.md").dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 24,
          clientY: 32,
        })
      )
    )
    expect(ui.props.onContextMenu).toHaveBeenCalledWith(
      ui.entries[1],
      24,
      32,
      ui.entries
    )
    ui.props.renameRequest = { treePath: "two/same.md", nonce: 1 }
    await ui.render()
    const input = ui.host.querySelector<HTMLInputElement>(
      ".explorer-card-rename"
    )!
    expect(input.value).toBe("same.md")
    await act(async () =>
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      )
    )
    expect(ui.props.onRename).not.toHaveBeenCalled()
  } finally {
    await ui.close()
  }
})
it("keeps loaded pages and excerpts when selection receives an equivalent Space snapshot", async () => {
  const ui = await setup("Kept excerpt", 105)
  try {
    await act(async () =>
      ui.host
        .querySelector<HTMLButtonElement>(".explorer-earlier-toggle")!
        .click()
    )
    await act(async () =>
      ui.host.querySelector<HTMLButtonElement>(".explorer-load-more")!.click()
    )
    const first = ui.card("one/same.md")
    const requests = ui.list.mock.calls.length
    ui.props.entries = ui.entries.map((entry) => ({ ...entry }))
    ui.props.activePath = "one/same.md"
    await ui.render()
    expect(ui.list).toHaveBeenCalledTimes(requests)
    expect(ui.host.querySelectorAll(".explorer-file-card")).toHaveLength(103)
    expect(ui.card("one/same.md")).toBe(first)
    expect(
      first.querySelector("time")!.closest(".explorer-card-title")
    ).not.toBeNull()
    expect(first.querySelector(".explorer-card-summary")!.textContent).toBe(
      "Kept excerpt"
    )
    ui.props.entries = ui.props.entries.map((entry, index) =>
      index ? entry : { ...entry, modifiedAtMs: entry.modifiedAtMs + 1 }
    )
    await ui.render()
    expect(ui.list.mock.calls.length).toBeGreaterThan(requests)
  } finally {
    await ui.close()
  }
})
it("keeps file rows visually enabled while preventing duplicate opens", async () => {
  const ui = await setup()
  try {
    const row = ui
      .card("one/same.md")
      .querySelector<HTMLButtonElement>(".explorer-card-open")!
    ui.props.openingPath = "one/same.md"
    await ui.render()
    expect(row.disabled).toBe(false)
    expect(row.getAttribute("aria-disabled")).toBe("true")
    await act(async () => row.click())
    expect(ui.props.onOpen).not.toHaveBeenCalled()
    expect(ui.list).toHaveBeenCalledTimes(1)
    ui.props.openingPath = null
    await ui.render()
    await act(async () => row.click())
    expect(ui.props.onOpen).toHaveBeenCalledOnce()
    expect(ui.host.querySelector(".explorer-card-open")).toBe(row)
  } finally {
    await ui.close()
  }
})
it("keeps Earlier collapsed and requests only one page at a time when expanded", async () => {
  const ui = await setup("Older excerpt", 105)
  try {
    const toggle = ui.host.querySelector<HTMLButtonElement>(
      ".explorer-earlier-toggle"
    )!
    expect(toggle.getAttribute("aria-expanded")).toBe("false")
    expect(ui.list).toHaveBeenCalledTimes(1)
    expect(ui.host.querySelectorAll(".explorer-file-card")).toHaveLength(3)
    expect(ui.preview).toHaveBeenCalledTimes(3)
    await act(async () => toggle.click())
    expect(ui.list.mock.calls.at(-1)![0]).toMatchObject({
      period: "earlier",
      offset: 0,
    })
    expect(ui.host.querySelectorAll(".explorer-file-card")).toHaveLength(53)
    await act(async () =>
      ui.host.querySelector<HTMLButtonElement>(".explorer-load-more")!.click()
    )
    expect(ui.list.mock.calls.at(-1)![0]).toMatchObject({
      period: "earlier",
      offset: 50,
    })
    expect(ui.host.querySelectorAll(".explorer-file-card")).toHaveLength(103)
    await act(async () => toggle.click())
    expect(ui.host.querySelectorAll(".explorer-file-card")).toHaveLength(3)
    const calls = ui.list.mock.calls.length
    await act(async () => toggle.click())
    expect(ui.list).toHaveBeenCalledTimes(calls)
    expect(ui.host.querySelectorAll(".explorer-file-card")).toHaveLength(103)
    await act(async () =>
      ui.host.querySelector<HTMLButtonElement>(".explorer-load-more")!.click()
    )
    expect(ui.list.mock.calls.at(-1)![0]).toMatchObject({
      period: "earlier",
      offset: 100,
    })
    expect(ui.host.querySelectorAll(".explorer-file-card")).toHaveLength(108)
    expect(ui.host.querySelector(".explorer-load-more")).toBeNull()
  } finally {
    await ui.close()
  }
})
it("keeps empty documents compact without an empty excerpt row", async () => {
  const ui = await setup("# Heading only\n\n")
  try {
    expect(ui.host.querySelectorAll(".explorer-card-summary")).toHaveLength(0)
    expect(ui.host.querySelectorAll(".explorer-file-card")).toHaveLength(3)
    expect(ui.card("one/same.md").textContent).toContain("same.md")
    expect(ui.card("one/same.md").textContent).toContain("one")
  } finally {
    await ui.close()
  }
})
it("extracts only a bounded plain-text document beginning", () => {
  expect(
    summarizeDocument(
      "---\ntitle: Private metadata\n---\n# Heading\n\nHello **world** [link](https://example.com).\n\n![image](image.png)"
    )
  ).toBe("Hello world link.")
  expect(summarizeDocument("x".repeat(20000))).toHaveLength(240)
})
