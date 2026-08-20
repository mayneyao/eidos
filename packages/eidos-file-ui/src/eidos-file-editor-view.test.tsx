import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import type {
  EidosFileColumnStatConfig,
  EidosFileSnapshot,
  EidosFileTableSnapshot,
  EidosFileViewInfo,
} from "@eidos.space/eidos-file"
import { vi } from "vitest"

import type { EidosFileGridProps } from "./eidos-file-grid"

const gridMock = vi.hoisted(() => ({
  props: undefined as EidosFileGridProps | undefined,
}))

vi.mock("./eidos-file-grid", () => ({
  EidosFileGrid: (props: EidosFileGridProps) => {
    gridMock.props = props
    return null
  },
}))

import {
  EidosFileEditorView,
  builtInEidosFileViewRenderers,
  type EidosFileViewRendererProps,
} from "./eidos-file-editor-view"
import { EidosFileQueryToolbar } from "./eidos-file-query-toolbar"
import { EidosFileSearchNavigationProvider } from "./eidos-file-search-navigation"
import {
  eidosFileViewGroupFilter,
  eidosFileViewRowQuery,
} from "./eidos-file-view-query"
import { EidosFileUIProvider } from "./context"
import type { EidosFileEditorDataSource } from "./data-source"
import { createEidosFilePluginRegistry, defineEidosFilePlugin } from "./plugin"
import { eidosFileGalleryPlugin } from "./plugins/gallery"
import { eidosFileKanbanPlugin } from "./plugins/kanban"
import { eidosFileCalendarPlugin } from "./plugins/calendar"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const now = "2026-07-17T00:00:00.000Z"
const view: EidosFileViewInfo = {
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
const table: EidosFileTableSnapshot = {
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
const snapshot: EidosFileSnapshot = {
  path: "tasks.eidos",
  metadata: {
    format: "eidos-file",
    fileId: "0198c72d-82b5-7968-b163-98be4b7477df",
    formatVersion: "1.0",
    schemaVersion: 1,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  },
  tables: [table],
}
const source: EidosFileEditorDataSource = {
  getSnapshot: vi.fn(async () => snapshot),
  getPage: vi.fn(async (_tableId, offset, limit) => ({
    tableId: "tasks",
    offset,
    limit,
    total: 0,
    rows: [],
  })),
  calculateColumnStats: vi.fn(async () => []),
  insertRow: vi.fn(),
  updateRow: vi.fn(),
  deleteRowRanges: vi.fn(),
  deleteRows: vi.fn(),
  updateField: vi.fn(),
  addField: vi.fn(),
  deleteField: vi.fn(),
  createTable: vi.fn(),
  updateTable: vi.fn(),
  deleteTable: vi.fn(),
  createView: vi.fn(),
  duplicateView: vi.fn(),
  deleteView: vi.fn(),
  reorderViews: vi.fn(),
  updateView: vi.fn(),
}

describe("EidosFileEditorView registry", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    gridMock.props = undefined
    vi.mocked(source.calculateColumnStats).mockClear()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("keeps Grid in core and exposes alternate layouts through plugins", () => {
    expect(Object.keys(builtInEidosFileViewRenderers)).toEqual(["grid"])
    const registry = createEidosFilePluginRegistry([
      eidosFileGalleryPlugin,
      eidosFileKanbanPlugin,
      eidosFileCalendarPlugin,
    ])
    expect(Object.keys(registry.viewRenderers)).toEqual([
      "gallery",
      "kanban",
      "calendar",
    ])
  })

  it("rejects duplicate plugin and persisted view identifiers", () => {
    expect(() =>
      createEidosFilePluginRegistry([
        eidosFileGalleryPlugin,
        eidosFileGalleryPlugin,
      ])
    ).toThrow("Duplicate Eidos File plugin")
    expect(() =>
      createEidosFilePluginRegistry([
        eidosFileGalleryPlugin,
        defineEidosFilePlugin({
          id: "example.gallery",
          views: [
            {
              ...eidosFileGalleryPlugin.views[0],
              label: "Another gallery",
            },
          ],
        }),
      ])
    ).toThrow("Duplicate Eidos File view type: gallery")
    expect(() =>
      createEidosFilePluginRegistry([
        defineEidosFilePlugin({
          id: "example.import-a",
          actions: [
            { id: "example.import", slot: "workbar", render: () => null },
          ],
        }),
        defineEidosFilePlugin({
          id: "example.import-b",
          actions: [
            { id: "example.import", slot: "workbar", render: () => null },
          ],
        }),
      ])
    ).toThrow("Duplicate Eidos File action: example.import")
  })

  it("passes persisted metadata and the runtime query to a plugin renderer", () => {
    const received: EidosFileViewRendererProps[] = []
    function TimelineRenderer(props: EidosFileViewRendererProps) {
      received.push(props)
      return (
        <div data-custom-view>{String(props.view?.properties?.dateField)}</div>
      )
    }
    const timelinePlugin = defineEidosFilePlugin({
      id: "example.timeline",
      views: [
        {
          type: "timeline",
          label: "Timeline",
          description: "Records on a date axis",
          renderer: TimelineRenderer,
        },
      ],
    })

    act(() => {
      root.render(
        <EidosFileEditorView
          source={source}
          table={table}
          view={view}
          search=" release "
          plugins={[timelinePlugin]}
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

  it("coordinates toolbar navigation and active-view highlighting inside the shared UI package", () => {
    const gridView: EidosFileViewInfo = { ...view, type: "grid" }
    const onSearchChange = vi.fn()

    act(() => {
      root.render(
        <EidosFileUIProvider>
          <EidosFileSearchNavigationProvider
            search="roadmap"
            scopeKey="tasks:grid"
          >
            <EidosFileQueryToolbar
              fields={table.fields}
              filter={null}
              sorts={[]}
              search="roadmap"
              onSearchChange={onSearchChange}
              onFilterChange={vi.fn()}
              onSortsChange={vi.fn()}
            />
            <EidosFileEditorView
              source={source}
              table={table}
              view={gridView}
              search="roadmap"
            />
          </EidosFileSearchNavigationProvider>
        </EidosFileUIProvider>
      )
    })

    act(() => gridMock.props?.onRowCountChange?.(3))
    expect(document.body.textContent).toContain("1 of 3")
    expect(gridMock.props?.searchResultIndex).toBe(0)

    const input = document.body.querySelector<HTMLInputElement>(
      'input[placeholder="Search rows"]'
    )
    act(() => {
      input?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
      )
    })
    expect(document.body.textContent).toContain("2 of 3")
    expect(gridMock.props?.searchResultIndex).toBe(1)

    act(() => {
      input?.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          shiftKey: true,
          bubbles: true,
        })
      )
    })
    expect(document.body.textContent).toContain("1 of 3")
    expect(gridMock.props?.searchResultIndex).toBe(0)
  })

  it("routes Grid column stats through the public data source", async () => {
    const gridView: EidosFileViewInfo = {
      ...view,
      type: "grid",
      properties: {
        columnStats: { estimate: { type: "sum" } },
      },
    }
    const configs: EidosFileColumnStatConfig[] = [
      { fieldId: "estimate", type: "sum" },
    ]

    act(() => {
      root.render(
        <EidosFileEditorView
          source={source}
          table={table}
          view={gridView}
          search=" release "
        />
      )
    })
    await gridMock.props?.loadColumnStats?.(configs)

    expect(source.calculateColumnStats).toHaveBeenCalledWith("tasks", configs, {
      search: "release",
      filter: view.filter,
      sorts: view.sorts,
    })
  })

  it("routes host attachment imports through the built-in Grid renderer", () => {
    const onImportFiles = vi.fn(async () => [])
    const onImportDroppedFiles = vi.fn(async () => [])
    act(() => {
      root.render(
        <EidosFileEditorView
          source={source}
          table={table}
          view={{ ...view, type: "grid" }}
          onImportFiles={onImportFiles}
          onImportDroppedFiles={onImportDroppedFiles}
        />
      )
    })

    expect(gridMock.props?.onImportFiles).toBe(onImportFiles)
    expect(gridMock.props?.onImportDroppedFiles).toBe(onImportDroppedFiles)
  })

  it("does not execute a saved query from a newer client as an empty query", () => {
    act(() => {
      root.render(
        <EidosFileEditorView
          source={source}
          table={table}
          view={{ ...view, type: "grid", queryStatus: "unsupported" }}
        />
      )
    })

    expect(gridMock.props).toBeUndefined()
    expect(
      container.querySelector("[data-eidos-file-unsupported-query]")
    ).not.toBeNull()
    expect(container.textContent).toContain("newer Eidos version")
    expect(container.textContent).toContain("preserved")
  })
})

describe("Eidos File view query helpers", () => {
  it("combines transient search with saved filter and sort metadata", () => {
    expect(eidosFileViewRowQuery(view, " release ")).toEqual({
      search: "release",
      filter: view.filter,
      sorts: view.sorts,
    })
  })

  it("adds Kanban grouping without mutating the saved filter", () => {
    const combined = eidosFileViewGroupFilter(view.filter, "status", null)
    expect(combined.children).toEqual([
      view.filter,
      { type: "rule", field: "status", operator: "is-empty" },
    ])
    expect(view.filter?.children).toHaveLength(1)
  })
})
