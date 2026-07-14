// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { BaseFieldInfo, BaseViewInfo } from "@eidos.space/base"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BaseRecordCard } from "./base-record-card"

const themeMocks = vi.hoisted(() => ({
  useTheme: vi.fn(() => ({ resolvedTheme: "light" })),
}))

vi.mock("@/components/theme-provider", () => ({
  useTheme: themeMocks.useTheme,
}))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const fields: BaseFieldInfo[] = [
  {
    name: "Title",
    type: "title",
    tableName: "tb_tasks",
    tableColumnName: "title",
    property: null,
    storageCodec: "scalar",
    valueKind: "system",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  },
  {
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

const urlField: BaseFieldInfo = {
  ...fields[1],
  name: "Image URL",
  type: "url",
  tableColumnName: "image_url",
  storageCodec: "scalar",
}

const view: BaseViewInfo = {
  id: "view_gallery",
  name: "Gallery",
  type: "gallery",
  tableId: "tasks",
  query: "SELECT * FROM tb_tasks",
  properties: {
    coverPreview: "cover",
    fitContent: true,
    hideEmptyFields: true,
  },
  filter: null,
  sorts: [],
  orderMap: null,
  hiddenFields: [],
  position: 1,
  createdAt: "2026-07-12 00:00:00",
  updatedAt: "2026-07-12 00:00:00",
}

describe("BaseRecordCard", () => {
  let container: HTMLDivElement
  let root: Root
  let originalEidosDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    themeMocks.useTheme.mockClear()
    originalEidosDescriptor = Object.getOwnPropertyDescriptor(window, "eidos")
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    if (originalEidosDescriptor) {
      Object.defineProperty(window, "eidos", originalEidosDescriptor)
    } else {
      Reflect.deleteProperty(window, "eidos")
    }
  })

  it("streams a local File field through the Space asset route", async () => {
    await act(async () => {
      root.render(
        <BaseRecordCard
          row={{
            _id: "row_1",
            title: "Write RFC",
            cover: JSON.stringify(["assets/cover.png"]),
          }}
          fields={fields}
          view={view}
          onOpen={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "/~/assets/cover.png"
    )
    expect(container.querySelector("img")?.className).toContain(
      "object-contain"
    )

    await act(async () => {
      root.render(
        <BaseRecordCard
          row={{ _id: "row_1", title: "Write RFC", cover: null }}
          fields={fields}
          view={view}
          onOpen={vi.fn()}
        />
      )
    })
    expect(container.querySelector("img")).toBeNull()
  })

  it("uses a URL field as a portable card cover", async () => {
    await act(async () => {
      root.render(
        <BaseRecordCard
          row={{
            _id: "row_1",
            title: "Write RFC",
            image_url: "https://images.example.test/cover.png",
          }}
          fields={[fields[0], urlField]}
          view={{
            ...view,
            properties: { ...view.properties, coverPreview: "image_url" },
          }}
          onOpen={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://images.example.test/cover.png"
    )
  })

  it("encodes nested local cover paths for the Space route", async () => {
    await act(async () => {
      root.render(
        <BaseRecordCard
          row={{
            _id: "row_1",
            title: "Write RFC",
            cover: JSON.stringify(["Media/hello world#1.png"]),
          }}
          fields={fields}
          view={view}
          onOpen={vi.fn()}
        />
      )
    })

    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "/~/Media/hello%20world%231.png"
    )
  })

  it("recovers from a failed cover when the record source changes", async () => {
    const renderCover = (path: string) =>
      root.render(
        <BaseRecordCard
          row={{
            _id: "row_1",
            title: "Write RFC",
            cover: JSON.stringify([path]),
          }}
          fields={fields}
          view={view}
          onOpen={vi.fn()}
        />
      )

    await act(async () => renderCover("assets/missing.png"))
    await act(async () => {
      container
        .querySelector("img")
        ?.dispatchEvent(new Event("error", { bubbles: true }))
    })
    expect(container.querySelector("img")).toBeNull()

    await act(async () => renderCover("assets/replacement.png"))
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "/~/assets/replacement.png"
    )
  })

  it("exposes record actions from the card menu", async () => {
    const onOpen = vi.fn()
    const onDelete = vi.fn()
    const row = { _id: "row_1", title: "Write RFC", cover: null }

    await act(async () => {
      root.render(
        <BaseRecordCard
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
        <BaseRecordCard
          row={row}
          fields={fields}
          view={{ ...view, properties: null }}
          role="listitem"
          onOpen={onOpen}
        />
      )
    })

    const card = container.querySelector<HTMLElement>(
      '[data-base-row-id="row_1"]'
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

  it("does not open a record from card actions or a drag gesture", () => {
    const onOpen = vi.fn()
    const row = { _id: "row_1", title: "Write RFC", cover: null }

    act(() => {
      root.render(
        <BaseRecordCard
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
      '[data-base-row-id="row_1"]'
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
        <BaseRecordCard
          row={{ _id: "row_1", title: "Write RFC", cover: null }}
          fields={fields}
          view={{ ...view, properties: null }}
          focused
          onOpen={vi.fn()}
        />
      )
    })

    const card = container.querySelector<HTMLElement>(
      '[data-base-row-id="row_1"]'
    )
    expect(card?.getAttribute("aria-current")).toBe("true")
    expect(card?.className).toContain("ring-ring")
  })

  it("skips card work when a virtual parent rerenders with stable props", () => {
    const statusField: BaseFieldInfo = {
      name: "Status",
      type: "select",
      tableName: "tb_tasks",
      tableColumnName: "status",
      property: {
        options: [{ id: "todo", name: "Todo", color: "blue" }],
      },
      storageCodec: "scalar",
      valueKind: "source",
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    }
    const notesField: BaseFieldInfo = {
      ...statusField,
      name: "Notes",
      type: "text",
      tableColumnName: "notes",
      property: null,
    }
    const doneField: BaseFieldInfo = {
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
        <BaseRecordCard
          row={row}
          fields={cardFields}
          view={cardView}
          onOpen={onOpen}
        />
      )
    })
    expect(themeMocks.useTheme).toHaveBeenCalledTimes(1)

    act(() => {
      root.render(
        <BaseRecordCard
          row={row}
          fields={cardFields}
          view={cardView}
          onOpen={onOpen}
        />
      )
    })
    expect(themeMocks.useTheme).toHaveBeenCalledTimes(1)

    act(() => {
      root.render(
        <BaseRecordCard
          row={{ ...row, title: "Publish RFC" }}
          fields={cardFields}
          view={cardView}
          onOpen={onOpen}
        />
      )
    })
    expect(themeMocks.useTheme).toHaveBeenCalledTimes(2)
  })

  it("registers a large native move submenu without mounting every item", async () => {
    const showNativeMenu = vi.fn(
      async (_menu: unknown[], _position?: unknown) => undefined
    )
    let nativeClickHandler:
      | ((event: unknown, itemId: string) => void)
      | undefined
    Object.defineProperty(window, "eidos", {
      configurable: true,
      value: {
        showNativeMenu,
        on: vi.fn(
          (
            channel: string,
            handler: (event: unknown, itemId: string) => void
          ) => {
            if (channel === "native-menu-click") nativeClickHandler = handler
          }
        ),
      },
    })
    const row = { _id: "row_1", title: "Write RFC", cover: null }
    const onMove = vi.fn()
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
        <BaseRecordCard
          row={row}
          fields={fields}
          view={{ ...view, properties: null }}
          moveOptions={moveOptions}
          disabledMoveOptionId="status_0"
          onMove={onMove}
          onOpen={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    expect(container.querySelectorAll("*").length).toBeLessThan(100)
    expect(labelReads).toBe(0)
    await act(async () => {
      container
        .querySelector<HTMLElement>('[data-base-row-id="row_1"]')
        ?.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            clientX: 24,
            clientY: 36,
          })
        )
      await Promise.resolve()
    })

    const menu = showNativeMenu.mock.calls[0]?.[0] as Array<{
      type: string
      label?: string
      submenu?: Array<{ enabled?: boolean; id?: string; label: string }>
    }>
    const moveSubmenu = menu.find(
      (item) => item.type === "submenu" && item.label === "Move to"
    )
    expect(moveSubmenu?.submenu).toHaveLength(200)
    expect(labelReads).toBe(200)
    expect(moveSubmenu?.submenu?.[0]?.enabled).toBe(false)
    expect(moveSubmenu?.submenu?.[1]?.enabled).toBe(true)
    const targetItem = moveSubmenu?.submenu?.[143]
    expect(targetItem?.label).toBe("Status 143")

    act(() => nativeClickHandler?.({}, targetItem?.id ?? ""))
    expect(onMove).toHaveBeenCalledWith(row, "status_143")
  })
})
