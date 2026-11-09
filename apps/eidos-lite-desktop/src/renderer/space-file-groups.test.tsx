// @vitest-environment jsdom
import { act, type ComponentProps } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, expect, it, vi } from "vitest"
import { SpaceFileGroups } from "./space-file-groups"
import {
  selectExplorerFilesPage,
  type ExplorerFilesQuery,
} from "../shared/explorer-file-list"
import {
  markdownDocumentTitle,
  summarizeDocument,
  summarizeFileContent,
} from "./explorer-card-summary"

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

it("renders media metadata, text excerpts and Eidos structure through their own preview paths", async () => {
  const ui = await setup()
  const thumbnail = vi.fn(async () => "data:image/png;base64,fixture")
  Object.assign(window.eidosLite, { getExplorerFileThumbnail: thumbnail })
  const eidos = vi.fn(async () => ({
    tableNames: ["Tasks", "Projects"],
    tableCount: 2,
    recordCount: 128,
  }))
  Object.assign(window.eidosLite, { getExplorerEidosSummary: eidos })
  try {
    ui.props.entries = [
      "assets/travel/photo.jpg",
      "assets/travel/clip.mp4",
      "business/mail/list.txt",
      "business/mail/data.json",
      "notes/project/note.md",
      "project.eidos",
    ].map((relativePath) => ({
      name: relativePath.split("/").at(-1)!,
      relativePath,
      kind: "file" as const,
      size: 20,
      modifiedAtMs: Date.now(),
    }))
    ui.preview.mockClear()
    await ui.render()
    expect(thumbnail).toHaveBeenCalledTimes(2)
    const photo = ui.card("assets/travel/photo.jpg")
    const video = ui.card("assets/travel/clip.mp4")
    expect(photo.querySelector(".explorer-card-thumbnail img")).not.toBeNull()
    expect(video.querySelector(".explorer-card-video")).not.toBeNull()
    expect(photo.querySelector(".explorer-card-location")).toBeNull()
    expect(
      photo.querySelector<HTMLButtonElement>(".explorer-card-open")!.title
    ).toBe("assets/travel/photo.jpg")
    expect(
      photo.querySelector(".explorer-card-summary")!.textContent
    ).toContain("JPG")
    expect(
      ui.card("business/mail/list.txt").querySelector(".explorer-card-summary")!
        .textContent
    ).toContain("# Note")
    expect(
      ui
        .card("business/mail/data.json")
        .querySelector(".explorer-card-summary")!.textContent
    ).toContain("# Note")
    expect(ui.preview).toHaveBeenCalledTimes(3)
    expect(eidos).toHaveBeenCalledOnce()
    expect(
      ui.card("project.eidos").querySelector(".explorer-card-summary")!
        .textContent
    ).toBe("Tasks · Projects\n2 tables · 128 records")
    expect(
      ui.card("notes/project/note.md").querySelector(".explorer-card-summary")
    ).not.toBeNull()
    await act(async () =>
      photo.querySelector("img")!.dispatchEvent(new Event("error"))
    )
    expect(photo.querySelector(".explorer-card-thumbnail img")).toBeNull()
    expect(photo.querySelector(".explorer-card-thumbnail svg")).not.toBeNull()
    await act(async () =>
      video.querySelector<HTMLButtonElement>(".explorer-card-open")!.click()
    )
    expect(ui.props.onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ relativePath: "assets/travel/clip.mp4" })
    )
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
it.each(["", " \n\t", "# Heading only\n\n", "---\n", "\u200b\n"])(
  "shows a consistent placeholder for documents without prose: %j",
  async (content) => {
    const ui = await setup(content)
    try {
      expect(
        ui.host.querySelectorAll('.explorer-card-summary[data-empty="true"]')
      ).toHaveLength(3)
      expect(
        ui.card("one/same.md").querySelector(".explorer-card-summary")!
          .textContent
      ).toBe("No content yet")
      expect(ui.host.querySelectorAll(".explorer-file-card")).toHaveLength(3)
      expect(
        ui
          .card("one/same.md")
          .querySelector(".explorer-card-open")!
          .getAttribute("title")
      ).toBe("one/same.md")
      expect(ui.card("one/same.md").textContent).toContain("one")
    } finally {
      await ui.close()
    }
  }
)
it("does not label pending or failed previews as empty, and recognizes zero-byte Markdown directly", async () => {
  const ui = await setup()
  const completions: ((value: { type: "text"; content: string }) => void)[] = []
  try {
    ui.props.spaceId += "-pending"
    ui.preview.mockImplementation(
      () => new Promise((resolve) => completions.push(resolve))
    )
    await ui.render()
    expect(ui.host.querySelectorAll('[data-empty="true"]')).toHaveLength(0)
    expect(ui.host.querySelector(".explorer-card-summary")!.textContent).toBe(
      ""
    )
    await act(async () => {
      for (const complete of completions)
        complete({ type: "text", content: "" })
    })
    expect(ui.host.querySelectorAll('[data-empty="true"]')).toHaveLength(3)
    ui.props.spaceId += "-failed"
    ui.preview.mockRejectedValue(new Error("File unavailable"))
    await ui.render()
    expect(ui.host.querySelectorAll('[data-empty="true"]')).toHaveLength(0)
    expect(ui.host.querySelector(".explorer-card-summary")!.textContent).toBe(
      "Preview unavailable"
    )
    ui.preview.mockClear()
    ui.props.entries = ui.entries.map((entry) => ({ ...entry, size: 0 }))
    await ui.render()
    expect(ui.host.querySelectorAll('[data-empty="true"]')).toHaveLength(3)
    expect(ui.preview).not.toHaveBeenCalled()
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
it("keeps text literal and extracts JSON values without treating punctuation as Markdown", () => {
  expect(
    summarizeFileContent(
      "notes.txt",
      "# My notes\nuser_name@example.com\n2 * 3 = 6"
    )
  ).toBe("# My notes user_name@example.com 2 * 3 = 6")
  expect(
    summarizeFileContent("data.json", '{"name":"A_B","count":3,"active":false}')
  ).toBe("name: A_B · count: 3 · active: false")
  expect(
    summarizeFileContent("data.json", '[{"title":"First"},{"title":"Second"}]')
  ).toBe("title: First")
  expect(summarizeFileContent("data.json", "[]")).toBe("")
  expect(summarizeFileContent("data.json", '{"unfinished":')).toBe(
    '{"unfinished":'
  )
})
it("uses a Markdown title while keeping file operations and the original path", async () => {
  const ui = await setup(
    "# **Writing** [plan](https://example.com)\n\nNext steps."
  )
  try {
    const card = ui.card("one/same.md")
    expect(card.querySelector("strong")!.textContent).toBe("Writing plan")
    expect(card.querySelector(".explorer-card-summary")!.textContent).toBe(
      "Next steps."
    )
    const button = card.querySelector<HTMLButtonElement>(".explorer-card-open")!
    expect(button.title).toBe("one/same.md")
    await act(async () => button.click())
    expect(ui.props.onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ name: "same.md", relativePath: "one/same.md" })
    )
    ui.props.entries = ui.entries.map((entry) => ({
      ...entry,
      modifiedAtMs: entry.modifiedAtMs + 1,
    }))
    ui.preview.mockResolvedValue({
      type: "text",
      content: "Body without a document title.",
    })
    await ui.render()
    expect(ui.card("one/same.md").querySelector("strong")!.textContent).toBe(
      "same.md"
    )
  } finally {
    await ui.close()
  }
})
it("shows location labels only for duplicate display titles without extra file reads", async () => {
  const ui = await setup()
  try {
    ui.props.spaceId += "-location-labels"
    ui.props.entries = [
      "one/a.md",
      "two/b.md",
      "one/d.md",
      "one/unique.md",
      "two/other.md",
    ].map((relativePath) => ({
      ...ui.entries[0]!,
      relativePath,
      name: relativePath.split("/").at(-1)!,
    }))
    ui.preview.mockClear()
    ui.preview.mockImplementation(async (path: string) => ({
      type: "text",
      content: `# ${path.endsWith("unique.md") ? "Unique" : path.endsWith("other.md") ? "Other" : "Shared"}\nBody.`,
    }))
    await ui.render()
    expect(
      ui.card("one/a.md").querySelector(".explorer-card-location")!.textContent
    ).toBe("a.md")
    expect(
      ui.card("two/b.md").querySelector(".explorer-card-location")!.textContent
    ).toBe("two")
    expect(
      ui.card("one/d.md").querySelector(".explorer-card-location")!.textContent
    ).toBe("d.md")
    expect(
      ui.card("one/unique.md").querySelector(".explorer-card-location")
    ).toBeNull()
    expect(
      ui.card("two/other.md").querySelector(".explorer-card-location")
    ).toBeNull()
    expect(
      ui
        .card("one/unique.md")
        .querySelector<HTMLButtonElement>(".explorer-card-open")!.title
    ).toBe("one/unique.md")
    await ui.render()
    expect(ui.preview).toHaveBeenCalledTimes(5)
  } finally {
    await ui.close()
  }
})
it("extracts frontmatter and top-level H1 titles without using code, comments or subsections", () => {
  expect(
    markdownDocumentTitle('---\ntitle: "Frontmatter title"\n---\n# Body title')
  ).toBe("Frontmatter title")
  expect(
    markdownDocumentTitle("---\ntitle: [not, a, title]\n---\n# Body title")
  ).toBe("Body title")
  expect(
    markdownDocumentTitle(
      "---\ntitle: first\ntitle: duplicate\n---\n# Body title"
    )
  ).toBe("Body title")
  expect(
    markdownDocumentTitle(
      "```md\n# Example\n```\n<!--\n# Hidden\n-->\n> # Quoted\n\n## Section\n\n# Actual title ###"
    )
  ).toBe("Actual title")
  expect(markdownDocumentTitle("Setext title\n============\nBody")).toBe(
    "Setext title"
  )
  expect(summarizeDocument("Setext title\n============\nBody")).toBe("Body")
  expect(
    summarizeDocument("---\ntitle: Metadata title\n...\n# Body title\nBody")
  ).toBe("Body")
  expect(markdownDocumentTitle("## Only a subsection\nBody")).toBeUndefined()
  expect(markdownDocumentTitle("#\n")).toBeUndefined()
  expect(
    markdownDocumentTitle("a".repeat(16_384) + "\n# Beyond prefix")
  ).toBeUndefined()
})
it("collapses daily groups independently and expands cached content without refetching", async () => {
  const ui = await setup()
  try {
    ui.props.entries = [
      ...ui.entries,
      {
        ...ui.entries[0]!,
        relativePath: "yesterday.md",
        name: "yesterday.md",
        modifiedAtMs: Date.now() - 86400000,
      },
    ]
    await ui.render()
    const button = Array.from(
      ui.host.querySelectorAll<HTMLButtonElement>(".explorer-group-toggle")
    ).find((button) => button.textContent === "Today")!
    const listCalls = ui.list.mock.calls.length
    const previewCalls = ui.preview.mock.calls.length
    await act(async () => button.click())
    expect(button.getAttribute("aria-expanded")).toBe("false")
    expect(ui.host.querySelectorAll(".explorer-file-card")).toHaveLength(1)
    expect(ui.card("yesterday.md")).toBeDefined()
    await act(async () => button.click())
    expect(button.getAttribute("aria-expanded")).toBe("true")
    expect(ui.host.querySelectorAll(".explorer-file-card")).toHaveLength(4)
    expect(ui.list).toHaveBeenCalledTimes(listCalls)
    expect(ui.preview).toHaveBeenCalledTimes(previewCalls)
  } finally {
    await ui.close()
  }
})
