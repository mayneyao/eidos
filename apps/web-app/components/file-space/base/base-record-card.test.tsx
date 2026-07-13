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

  beforeEach(() => {
    themeMocks.useTheme.mockClear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("leases a local File field as the card cover and releases it", async () => {
    const release = vi.fn()
    const acquireCover = vi.fn(async () => ({
      source: "blob:base-cover",
      release,
    }))

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
          acquireCover={acquireCover}
          onOpen={vi.fn()}
        />
      )
      await Promise.resolve()
    })

    expect(acquireCover).toHaveBeenCalledWith("assets/cover.png")
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "blob:base-cover"
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
          acquireCover={acquireCover}
          onOpen={vi.fn()}
        />
      )
    })
    expect(release).toHaveBeenCalledTimes(1)
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
    const cardFields = [...fields, statusField]
    const row = {
      _id: "row_1",
      title: "Write RFC",
      cover: null,
      status: "todo",
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
})
