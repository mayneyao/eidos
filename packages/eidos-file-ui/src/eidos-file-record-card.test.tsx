// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  encodeEidosFileAttachmentPaths,
  type EidosFileFieldInfo,
  type EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { EidosFileRecordCard } from "./eidos-file-record-card"

const eidosFileUiMocks = vi.hoisted(() => {
  const translate = (
    message: string,
    values: Record<string, string | number> = {}
  ) =>
    Object.entries(values).reduce(
      (text, [key, value]) => text.split(`{${key}}`).join(String(value)),
      message
    )
  return {
    translate,
    useEidosFileUI: vi.fn(() => ({
      themeName: "light" as const,
      translate,
    })),
  }
})

vi.mock("./context", () => ({
  useEidosFileUI: eidosFileUiMocks.useEidosFileUI,
}))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const fields: EidosFileFieldInfo[] = [
  {
    id: "0198c72d-82b5-7000-8000-000000000001",
    tableId: "0198c72d-82b5-7000-8000-000000000010",
    name: "Title",
    type: "text",
    isRecordLabel: true,
    tableName: "tb_tasks",
    tableColumnName: "title",
    property: null,
    storageCodec: "scalar",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  },
  {
    id: "0198c72d-82b5-7000-8000-000000000002",
    tableId: "0198c72d-82b5-7000-8000-000000000010",
    name: "Cover",
    type: "file",
    tableName: "tb_tasks",
    tableColumnName: "cover",
    property: null,
    storageCodec: "json_array",
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  },
]

const urlField: EidosFileFieldInfo = {
  ...fields[1],
  name: "Image URL",
  type: "url",
  tableColumnName: "image_url",
  storageCodec: "scalar",
}

const imageUrlField: EidosFileFieldInfo = {
  ...urlField,
  property: { display: { kind: "image" } },
}

const view: EidosFileViewInfo = {
  id: "view_gallery",
  name: "Gallery",
  type: "gallery",
  tableId: "tasks",
  query: "SELECT * FROM tb_tasks",
  properties: {
    coverField: "0198c72d-82b5-7000-8000-000000000002",
    fitContent: true,
    hideEmptyFields: true,
  },
  filter: null,
  sorts: [],
  orderMap: null,
  hiddenFields: [],
  position: 1,
  createdAt: "2026-07-12T00:00:00.000Z",
  updatedAt: "2026-07-12T00:00:00.000Z",
}

describe("EidosFileRecordCard", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    eidosFileUiMocks.useEidosFileUI.mockClear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("does not reinterpret a relative File URI without a Host lease", async () => {
    await act(async () => {
      root.render(
        <EidosFileRecordCard
          row={{
            _id: "row_1",
            title: "Write RFC",
            cover: encodeEidosFileAttachmentPaths(["assets/cover.png"]),
          }}
          fields={fields}
          view={view}
          onOpen={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    expect(container.querySelector("img")).toBeNull()
    expect(container.textContent).toContain("cover.png")
    expect(container.textContent).not.toContain("assets/cover.png")
    expect(container.querySelector("details")).toBeNull()
    expect(container.querySelector("code")).toBeNull()

    await act(async () => {
      root.render(
        <EidosFileRecordCard
          row={{ _id: "row_1", title: "Write RFC", cover: null }}
          fields={fields}
          view={view}
          onOpen={vi.fn()}
        />
      )
    })
    expect(container.querySelector("img")).toBeNull()
  })

  it("keeps a URL field inert instead of using it as a card cover", async () => {
    await act(async () => {
      root.render(
        <EidosFileRecordCard
          row={{
            _id: "row_1",
            title: "Write RFC",
            image_url: "https://images.example.test/cover.png",
          }}
          fields={[fields[0], urlField]}
          view={{
            ...view,
            properties: {
              ...view.properties,
              coverField: "0198c72d-82b5-7000-8000-000000000002",
            },
          }}
          onOpen={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    expect(container.querySelector("img")).toBeNull()
    expect(container.textContent).toContain(
      "https://images.example.test/cover.png"
    )
  })

  it("uses a field-level image URL as a card cover", async () => {
    await act(async () => {
      root.render(
        <EidosFileRecordCard
          row={{
            _id: "row_1",
            title: "Write RFC",
            image_url: "https://images.example.test/cover.png",
          }}
          fields={[fields[0], imageUrlField]}
          view={view}
          onOpen={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    expect(
      container.querySelector('[role="img"][aria-label="Image URL"]')
    ).not.toBeNull()
  })

  it("keeps nested relative URIs out of the quiet cover fallback", async () => {
    await act(async () => {
      root.render(
        <EidosFileRecordCard
          row={{
            _id: "row_1",
            title: "Write RFC",
            cover: encodeEidosFileAttachmentPaths(["Media/hello world#1.png"]),
          }}
          fields={fields}
          view={view}
          onOpen={vi.fn()}
        />
      )
    })

    expect(container.querySelector("img")).toBeNull()
    expect(container.textContent).toContain("hello world#1.png")
    expect(container.textContent).not.toContain("Media/hello%20world%231.png")
  })

  it("updates the inert File fallback when the entry changes", async () => {
    const renderCover = (path: string) =>
      root.render(
        <EidosFileRecordCard
          row={{
            _id: "row_1",
            title: "Write RFC",
            cover: encodeEidosFileAttachmentPaths([path]),
          }}
          fields={fields}
          view={view}
          onOpen={vi.fn()}
        />
      )

    await act(async () => renderCover("assets/missing.png"))
    expect(container.querySelector("img")).toBeNull()
    expect(container.textContent).toContain("missing.png")
    expect(container.textContent).not.toContain("assets/missing.png")

    await act(async () => renderCover("assets/replacement.png"))
    expect(container.querySelector("img")).toBeNull()
    expect(container.textContent).toContain("replacement.png")
    expect(container.textContent).not.toContain("assets/replacement.png")
  })

  it("exposes record actions from the card menu", async () => {
    const onOpen = vi.fn()
    const onDelete = vi.fn()
    const row = { _id: "row_1", title: "Write RFC", cover: null }

    await act(async () => {
      root.render(
        <EidosFileRecordCard
          row={row}
          fields={fields}
          view={{ ...view, properties: null }}
          onOpen={onOpen}
          onDelete={onDelete}
        />
      )
    })
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="More actions for Write RFC"]'
        )
        ?.dispatchEvent(
          new MouseEvent("pointerdown", { bubbles: true, button: 0 })
        )
    })
    await act(async () => {
      Array.from(
        document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')
      )
        .find((item) => item.textContent?.includes("Delete record"))
        ?.click()
    })

    expect(onDelete).toHaveBeenCalledWith(row)
    expect(onOpen).not.toHaveBeenCalled()
  })

  it("uses one semantic primary action without turning the listitem into a button", () => {
    const onOpen = vi.fn()
    const row = { _id: "row_1", title: "Write RFC", cover: null }

    act(() => {
      root.render(
        <EidosFileRecordCard
          row={row}
          fields={fields}
          view={{ ...view, properties: null }}
          role="listitem"
          onOpen={onOpen}
        />
      )
    })

    const card = container.querySelector<HTMLElement>(
      '[data-eidos-file-row-id="row_1"]'
    )
    const open = container.querySelector<HTMLButtonElement>(
      '[aria-label="Open Write RFC"]'
    )
    expect(card?.getAttribute("role")).toBe("listitem")
    expect(card?.hasAttribute("tabindex")).toBe(false)
    expect(open?.tabIndex).toBe(0)
    expect(
      container.querySelectorAll('[aria-label="Open Write RFC"]')
    ).toHaveLength(1)

    act(() => {
      card
        ?.querySelector("h3")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }))
    })
    expect(onOpen).toHaveBeenLastCalledWith(row)

    act(() => {
      open?.focus()
      open?.click()
    })
    expect(document.activeElement).toBe(open)
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it("floats the shared Gallery and Kanban actions above card content", () => {
    act(() => {
      root.render(
        <EidosFileRecordCard
          row={{ _id: "row_1", title: "Write RFC", cover: null }}
          fields={fields}
          view={{ ...view, properties: null }}
          onOpen={vi.fn()}
          onDelete={vi.fn()}
        />
      )
    })

    const actions = container.querySelector<HTMLElement>(
      "[data-eidos-file-card-actions]"
    )
    expect(actions?.classList).toContain("absolute")
    expect(actions?.classList).toContain("border")
    expect(actions?.classList).toContain("opacity-0")
    expect(actions?.classList).toContain("group-hover/card:opacity-100")
    expect(actions?.querySelectorAll("button")).toHaveLength(2)
    expect(actions?.parentElement?.querySelector("h3")?.contains(actions)).toBe(
      false
    )
  })

  it("uses a subtle, icon-free card surface inside Kanban columns", () => {
    act(() => {
      root.render(
        <EidosFileRecordCard
          row={{ _id: "row_1", title: "Write RFC", cover: null }}
          fields={fields}
          view={{ ...view, type: "kanban", properties: null }}
          onOpen={vi.fn()}
        />
      )
    })

    const card = container.querySelector<HTMLElement>(
      '[data-eidos-file-row-id="row_1"]'
    )
    expect(card?.dataset.eidosFileCardSurface).toBe("quiet")
    expect(card?.classList).toContain("border-border/50")
    expect(card?.classList).toContain("shadow-none")
    expect(card?.querySelector(".lucide-file-text")).toBeNull()
  })

  it("uses natural title height up to the three-line card limit", () => {
    const renderTitle = (title: string) =>
      root.render(
        <EidosFileRecordCard
          row={{ _id: "row_1", title, cover: null }}
          fields={fields}
          view={{ ...view, properties: null }}
          cardWidth={220}
          onOpen={vi.fn()}
        />
      )

    act(() => renderTitle("Short title"))
    const heading = container.querySelector<HTMLHeadingElement>("h3")
    expect(heading?.style.height).toBe("20px")
    expect(heading?.getAttribute("title")).toBeNull()

    const longTitle =
      "A long card title that needs several wrapped lines and must stop growing after reaching the configured maximum height"
    act(() => renderTitle(longTitle))
    expect(heading?.style.height).toBe("60px")
    expect(heading?.getAttribute("title")).toBe(longTitle)
  })

  it("uses natural field text height up to the two-line card limit", () => {
    const notesField: EidosFileFieldInfo = {
      ...fields[0],
      id: "0198c72d-82b5-7000-8000-000000000003",
      name: "Notes",
      isRecordLabel: false,
      tableColumnName: "notes",
    }
    const cardView: EidosFileViewInfo = {
      ...view,
      properties: {
        cardFields: [notesField.id],
        hideEmptyFields: false,
      },
    }
    const renderNotes = (notes: string) =>
      root.render(
        <EidosFileRecordCard
          row={{ _id: "row_1", title: "Short title", notes }}
          fields={[fields[0], notesField]}
          view={cardView}
          cardWidth={220}
          onOpen={vi.fn()}
        />
      )

    act(() => renderNotes("Brief note"))
    const shortText = container.querySelector<HTMLElement>(
      "[data-eidos-file-card-text]"
    )
    expect(shortText?.style.height).toBe("16px")

    const longText =
      "A much longer field value that wraps beyond the maximum visible card text height"
    act(() => renderNotes(longText))
    const clampedText = container.querySelector<HTMLElement>(
      "[data-eidos-file-card-text]"
    )
    expect(clampedText?.getAttribute("title")).toBe(longText)
    expect(clampedText?.style.height).toBe("32px")
  })

  it("does not open a record from card actions or a drag gesture", () => {
    const onOpen = vi.fn()
    const row = { _id: "row_1", title: "Write RFC", cover: null }

    act(() => {
      root.render(
        <EidosFileRecordCard
          row={row}
          fields={fields}
          view={{ ...view, properties: null }}
          role="listitem"
          onOpen={onOpen}
          onDelete={vi.fn()}
        />
      )
    })

    const card = container.querySelector<HTMLElement>(
      '[data-eidos-file-row-id="row_1"]'
    )
    const more = container.querySelector<HTMLButtonElement>(
      '[aria-label="More actions for Write RFC"]'
    )
    act(() => {
      more?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }))
      card?.dispatchEvent(
        new MouseEvent("pointerdown", {
          bubbles: true,
          button: 0,
          clientX: 12,
          clientY: 12,
        })
      )
      card?.dispatchEvent(
        new MouseEvent("pointermove", {
          bubbles: true,
          button: 0,
          clientX: 28,
          clientY: 12,
        })
      )
      card?.dispatchEvent(
        new MouseEvent("pointerup", {
          bubbles: true,
          button: 0,
          clientX: 28,
          clientY: 12,
        })
      )
      card?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }))
    })

    expect(onOpen).not.toHaveBeenCalled()
  })

  it("marks the active search result without changing the record action", () => {
    act(() => {
      root.render(
        <EidosFileRecordCard
          row={{ _id: "row_1", title: "Write RFC", cover: null }}
          fields={fields}
          view={{ ...view, properties: null }}
          focused
          onOpen={vi.fn()}
        />
      )
    })

    const card = container.querySelector<HTMLElement>(
      '[data-eidos-file-row-id="row_1"]'
    )
    expect(card?.getAttribute("aria-current")).toBe("true")
    expect(card?.className).toContain("ring-ring")
  })

  it("shows an unconfigured direct Select value from SQLite", () => {
    const statusField: EidosFileFieldInfo = {
      id: "0198c72d-82b5-7000-8000-000000000003",
      tableId: "0198c72d-82b5-7000-8000-000000000010",
      name: "Status",
      type: "select",
      tableName: "tb_tasks",
      tableColumnName: "status",
      property: { options: [{ value: "Todo", color: "blue" }] },
      storageCodec: "scalar",
      valueKind: "source",
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    }

    act(() => {
      root.render(
        <EidosFileRecordCard
          row={{
            _id: "row_1",
            title: "Write RFC",
            cover: null,
            status: "Blocked externally",
          }}
          fields={[...fields, statusField]}
          view={{ ...view, properties: null }}
          onOpen={vi.fn()}
        />
      )
    })

    expect(container.textContent).toContain("Blocked externally")
  })

  it("skips card work when a virtual parent rerenders with stable props", () => {
    const statusField: EidosFileFieldInfo = {
      id: "0198c72d-82b5-7000-8000-000000000003",
      tableId: "0198c72d-82b5-7000-8000-000000000010",
      name: "Status",
      type: "select",
      tableName: "tb_tasks",
      tableColumnName: "status",
      property: {
        options: [{ value: "todo", color: "blue" }],
      },
      storageCodec: "scalar",
      valueKind: "source",
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    }
    const notesField: EidosFileFieldInfo = {
      ...statusField,
      name: "Notes",
      type: "text",
      tableColumnName: "notes",
      property: null,
    }
    const doneField: EidosFileFieldInfo = {
      ...statusField,
      name: "Done",
      type: "checkbox",
      tableColumnName: "done",
      property: null,
    }
    const cardFields = [...fields, statusField, notesField, doneField]
    const row = {
      _id: "row_1",
      title: "Write RFC",
      cover: null,
      status: "todo",
      notes: "Performance baseline",
      done: 1,
    }
    const cardView = { ...view, properties: null }
    const onOpen = vi.fn()

    act(() => {
      root.render(
        <EidosFileRecordCard
          row={row}
          fields={cardFields}
          view={cardView}
          onOpen={onOpen}
        />
      )
    })
    expect(eidosFileUiMocks.useEidosFileUI).toHaveBeenCalledTimes(1)

    act(() => {
      root.render(
        <EidosFileRecordCard
          row={row}
          fields={cardFields}
          view={cardView}
          onOpen={onOpen}
        />
      )
    })
    expect(eidosFileUiMocks.useEidosFileUI).toHaveBeenCalledTimes(1)

    act(() => {
      root.render(
        <EidosFileRecordCard
          row={{ ...row, title: "Publish RFC" }}
          fields={cardFields}
          view={cardView}
          onOpen={onOpen}
        />
      )
    })
    expect(eidosFileUiMocks.useEidosFileUI).toHaveBeenCalledTimes(2)
  })

  it("keeps a large portable move menu unmounted until requested", async () => {
    const row = { _id: "row_1", title: "Write RFC", cover: null }
    let labelReads = 0
    const moveOptions = Array.from({ length: 200 }, (_, index) => {
      const option = { id: `status_${index}`, label: "" }
      Object.defineProperty(option, "label", {
        enumerable: true,
        get: () => {
          labelReads += 1
          return `Status ${index}`
        },
      })
      return option
    })

    await act(async () => {
      root.render(
        <EidosFileRecordCard
          row={row}
          fields={fields}
          view={{ ...view, properties: null }}
          moveOptions={moveOptions}
          disabledMoveOptionId="status_0"
          onMove={vi.fn()}
          onOpen={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    expect(container.querySelectorAll("*").length).toBeLessThan(100)
    expect(labelReads).toBe(0)
    await act(async () => {
      container
        .querySelector<HTMLElement>('[aria-label="More actions for Write RFC"]')
        ?.dispatchEvent(
          new MouseEvent("pointerdown", { bubbles: true, button: 0 })
        )
      await Promise.resolve()
    })

    expect(document.body.textContent).toContain("Move to")
    expect(labelReads).toBe(0)
  })
})
