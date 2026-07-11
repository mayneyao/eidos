// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type { BaseTableSnapshot } from "@eidos.space/base"
import { GridCellKind, type DataEditorProps } from "@glideapps/glide-data-grid"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { BaseGrid } from "./base-grid"

const mocks = vi.hoisted(() => ({
  props: null as DataEditorProps | null,
}))

vi.mock("@glideapps/glide-data-grid", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  const React = await import("react")
  return {
    ...actual,
    default: React.forwardRef((_props: DataEditorProps, _ref) => {
      mocks.props = _props
      return <div data-testid="glide-grid" />
    }),
  }
})

vi.mock("@/components/table/views/grid/cells/select-cell", () => ({
  default: {},
}))
vi.mock("@/components/table/views/grid/cells/multi-select-cell", () => ({
  default: {},
}))
vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}))
vi.mock("@/apps/web-app/hooks/use-current-theme", () => ({
  useCurrentTheme: () => ({ css: null }),
}))
vi.mock("@/components/table/views/grid/theme", () => ({
  useDynamicTheme: () => ({}),
}))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const table: BaseTableSnapshot = {
  table: {
    id: "tasks",
    name: "Tasks",
    rawTableName: "tb_tasks",
    position: 1,
    icon: null,
    description: null,
    createdAt: "2026-07-12 00:00:00",
    updatedAt: "2026-07-12 00:00:00",
  },
  fields: [
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
      name: "Done",
      type: "checkbox",
      tableName: "tb_tasks",
      tableColumnName: "done",
      property: null,
      storageCodec: "scalar",
      valueKind: "source",
      isHidden: false,
      isDerived: false,
      sourceTableColumnName: null,
      dependsOn: null,
    },
  ],
  rows: [{ _id: "row_1", title: "Write RFC", done: 0 }],
}

describe("BaseGrid", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    mocks.props = null
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("adapts Base rows to the production grid contract", () => {
    const onCellEdit = vi.fn()
    act(() =>
      root.render(
        <BaseGrid table={table} onAddRow={vi.fn()} onCellEdit={onCellEdit} />
      )
    )

    expect(mocks.props?.columns.map((column) => column.title)).toEqual([
      "Title",
      "Done",
    ])
    expect(mocks.props?.getCellContent([0, 0])).toMatchObject({
      kind: GridCellKind.Text,
      data: "Write RFC",
    })
    expect(mocks.props?.getCellContent([1, 0])).toMatchObject({
      kind: GridCellKind.Boolean,
      data: false,
    })

    act(() => {
      mocks.props?.onCellEdited?.([0, 0], {
        kind: GridCellKind.Text,
        allowOverlay: true,
        data: "Write implementation",
        displayData: "Write implementation",
      })
    })
    expect(onCellEdit).toHaveBeenCalledWith(
      table.rows[0],
      table.fields[0],
      "Write implementation"
    )
  })

  it("forwards the trailing row action", async () => {
    const onAddRow = vi.fn(async () => undefined)
    act(() =>
      root.render(
        <BaseGrid table={table} onAddRow={onAddRow} onCellEdit={vi.fn()} />
      )
    )

    await act(async () => {
      await mocks.props?.onRowAppended?.()
    })
    expect(onAddRow).toHaveBeenCalledOnce()
  })
})
