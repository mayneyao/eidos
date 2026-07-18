import React, { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import {
  EidosFileSession,
  type EidosFileDataSource,
  type EidosFileDescriptor,
  type EidosFileHandle,
  type EidosFileSnapshot,
} from "@eidos.space/eidos-file"
import { vi } from "vitest"

import type { EidosFileViewRendererProps } from "./eidos-file-editor-view"
import { EidosFileProvider, EidosFileViewHost } from "./platform"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const now = "2026-07-18T00:00:00.000Z"
const snapshot: EidosFileSnapshot = {
  path: "tasks.eidos",
  metadata: {
    format: "eidos-file",
    formatVersion: 1,
    schemaVersion: 1,
    app: "test",
    createdAt: now,
    updatedAt: now,
    defaultTableId: "tasks",
  },
  tables: [
    {
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
      views: [
        {
          id: "timeline",
          name: "Timeline",
          type: "timeline",
          tableId: "tasks",
          query: "",
          properties: null,
          filter: null,
          sorts: [],
          orderMap: null,
          hiddenFields: [],
          position: 0,
          createdAt: now,
          updatedAt: now,
        },
      ],
      rowCount: 0,
    },
  ],
}

const source = {
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
} satisfies EidosFileDataSource

const descriptor: EidosFileDescriptor = {
  id: "tasks",
  name: "tasks.eidos",
  format: "eidos-file",
  mimeType: "application/vnd.eidos+sqlite3",
  size: 3,
  revision: "one",
}

const handle: EidosFileHandle = {
  capabilities: {
    read: true,
    write: false,
    saveAs: true,
    recovery: true,
    persistentFileAccess: false,
  },
  descriptor: vi.fn(async () => descriptor),
  permission: vi.fn(async () => "denied" as const),
  read: vi.fn(async () => ({
    descriptor,
    bytes: new Uint8Array([1, 2, 3]).buffer,
  })),
}

describe("Eidos File React platform", () => {
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

  it("gives a custom view typed data context without raw host capabilities", async () => {
    const session = new EidosFileSession({
      open: vi.fn(async () => ({
        source,
        exportBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
        close: vi.fn(),
      })),
    })
    await session.open(handle)

    function Timeline(props: EidosFileViewRendererProps) {
      return (
        <output data-testid="timeline">
          {props.table.table.name}:{String(props.capabilities.rawFile)}:
          {String(props.capabilities.nativeFileSystem)}
        </output>
      )
    }

    act(() => {
      root.render(
        <EidosFileProvider session={session} themeName="dark">
          <EidosFileViewHost renderers={{ timeline: Timeline }} />
        </EidosFileProvider>
      )
    })

    expect(container.querySelector("[data-theme='dark']")).not.toBeNull()
    expect(container.textContent).toContain("Tasks:false:false")
  })
})
