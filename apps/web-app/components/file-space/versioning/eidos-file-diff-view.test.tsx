// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { SpaceVersionSqliteFileDiff } from "@/apps/web-app/hooks/use-space-versioning"

import { EidosFileDiffView } from "./eidos-file-diff-view"

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const file: SpaceVersionSqliteFileDiff = {
  path: "tasks.eidos",
  change: "modified",
  kind: "sqlite_database",
  storage: "sqlite_snapshot",
  rowDiffAvailable: true,
  logicalStatus: "logical_changes",
  capabilities: ["rowid_table_rows"],
  limitations: [{ kind: "index_btree", subject: "tasks_index" }],
  message: null,
  tables: [
    {
      name: "tb_tasks",
      columns: ["_id", "title", "done", "_last_edited_time"],
      primaryKeyColumns: [],
      changes: [
        {
          operation: "update",
          rowId: 1,
          values: ["1", "Write tests", 1, "2026-07-12T01:00:00Z"],
          beforeValues: ["1", "Write tests", 0, "2026-07-12T00:00:00Z"],
        },
        {
          operation: "insert",
          rowId: 2,
          values: ["2", "Ship Eidos File diff", 0, "2026-07-12T01:00:00Z"],
          beforeValues: null,
        },
      ],
    },
    {
      name: "eidos__meta",
      columns: ["key", "value"],
      primaryKeyColumns: [],
      changes: [
        {
          operation: "update",
          rowId: 6,
          values: ["updated_at", "2026-07-12T01:00:00Z"],
          beforeValues: ["updated_at", "2026-07-12T00:00:00Z"],
        },
      ],
    },
  ],
  opaqueChanges: [],
}

describe("EidosFileDiffView", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it("shows table summaries and changed cell values", () => {
    act(() => root.render(<EidosFileDiffView file={file} />))

    expect(container.textContent).toContain("1 changed table")
    expect(container.textContent).toContain("tasks")
    expect(container.textContent).toContain("+1")
    expect(container.textContent).toContain("~1")
    expect(container.textContent).toContain("Write tests")
    expect(container.textContent).toContain("Ship Eidos File diff")
    expect(container.textContent).toContain("SQLite indexes")
    expect(container.textContent).not.toContain("Eidos File metadata")
    expect(container.textContent).not.toContain("_last_edited_time")
  })

  it("collapses and reopens one table without losing its summary", () => {
    act(() => root.render(<EidosFileDiffView file={file} />))
    const toggle = container.querySelector<HTMLButtonElement>(
      'button[aria-expanded="true"]'
    )

    act(() => toggle?.click())
    expect(toggle?.getAttribute("aria-expanded")).toBe("false")
    expect(container.textContent).not.toContain("Ship Eidos File diff")
    expect(container.textContent).toContain("+1")
  })
})
