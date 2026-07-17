import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  BaseSnapshot,
  BaseTableSnapshot,
  BaseViewInfo,
} from "@eidos.space/base"
import { vi } from "vitest"

import {
  BaseEditorView,
  builtInBaseViewRenderers,
  type BaseViewRendererProps,
} from "./base-editor-view"
import { baseViewGroupFilter, baseViewRowQuery } from "./base-view-query"
import type { BaseEditorDataSource } from "./data-source"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const now = "2026-07-17T00:00:00.000Z"
const view: BaseViewInfo = {
  id: "timeline",
  name: "Timeline",
  type: "timeline",
  tableId: "tasks",
  query: "",
  properties: { dateField: "due" },
  filter: {
    type: "group",
    conjunction: "and",
    children: [
      { type: "rule", field: "done", operator: "equals", value: false },
    ],
  },
  sorts: [{ field: "due", direction: "asc" }],
  orderMap: null,
  hiddenFields: [],
  position: 0,
  createdAt: now,
  updatedAt: now,
}
const table: BaseTableSnapshot = {
  table: {
    id: "tasks",
    name: "Tasks",
    rawTableName: "tb_tasks",
    position: 0,
    icon: null,
    description: null,
    createdAt: now,
    updatedAt: now,
  },
  fields: [],
  views: [view],
  rowCount: 0,
}
const snapshot: BaseSnapshot = {
  path: "tasks.base",
  metadata: {
    format: "eidos-base",
    formatVersion: 1,
    schemaVersion: 1,
    app: "test",
    createdAt: now,
    updatedAt: now,
  },
  tables: [table],
}
const source: BaseEditorDataSource = {
  getSnapshot: vi.fn(async () => snapshot),
  getPage: vi.fn(async (_tableId, offset, limit) => ({
    tableId: "tasks",
    offset,
    limit,
    total: 0,
    rows: [],
  })),
  insertRow: vi.fn(),
  updateRow: vi.fn(),
  updateField: vi.fn(),
  addField: vi.fn(),
  deleteField: vi.fn(),
  updateView: vi.fn(),
}

describe("BaseEditorView registry", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("ships Grid, Gallery, and Kanban from one public registry", () => {
    expect(Object.keys(builtInBaseViewRenderers)).toEqual([
      "grid",
      "gallery",
      "kanban",
    ])
  })

  it("passes persisted metadata and the runtime query to a custom renderer", () => {
    const received: BaseViewRendererProps[] = []
    function TimelineRenderer(props: BaseViewRendererProps) {
      received.push(props)
      return (
        <div data-custom-view>{String(props.view?.properties?.dateField)}</div>
      )
    }

    act(() => {
      root.render(
        <BaseEditorView
          source={source}
          table={table}
          view={view}
          search=" release "
          renderers={{ timeline: TimelineRenderer }}
        />
      )
    })

    expect(container.querySelector("[data-custom-view]")?.textContent).toBe(
      "due"
    )
    expect(received[0]?.query).toEqual({
      search: "release",
      filter: view.filter,
      sorts: view.sorts,
    })
  })
})

describe("Base view query helpers", () => {
  it("combines transient search with saved filter and sort metadata", () => {
    expect(baseViewRowQuery(view, " release ")).toEqual({
      search: "release",
      filter: view.filter,
      sorts: view.sorts,
    })
  })

  it("adds Kanban grouping without mutating the saved filter", () => {
    const combined = baseViewGroupFilter(view.filter, "status", null)
    expect(combined.children).toEqual([
      view.filter,
      { type: "rule", field: "status", operator: "is-empty" },
    ])
    expect(view.filter?.children).toHaveLength(1)
  })
})
