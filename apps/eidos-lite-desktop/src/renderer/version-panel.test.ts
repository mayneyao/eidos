import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import type {
  SpaceSnapshot,
  SpaceVersionDiff,
  SpaceVersionTableDiff,
} from "../shared/contracts"
import {
  buildVersionChangeTreeModel,
  type VersionInspection,
} from "./version-change-tree"
import {
  TableDiff,
  VersionDiffPreview,
  VersionPanel,
  versionRowDiffPage,
} from "./version-panel"

const customersTable: SpaceVersionTableDiff = {
  name: "Customers",
  columns: ["name", "status"],
  primaryKeyColumns: ["name"],
  changes: [
    {
      op: "insert",
      key: { name: "Hao Chen" },
      values: ["Hao Chen", "Lead"],
    },
    {
      op: "update",
      key: { name: "Mei Lin" },
      oldValues: ["Mei Lin", "Lead"],
      values: ["Mei Lin", "Customer"],
    },
  ],
}

const versionDiff: SpaceVersionDiff = {
  currentHead: "head-2",
  currentBranch: null,
  from: "head-1",
  to: "worktree",
  paths: [
    { path: "notes/readme.md", change: "added", kind: "text_file" },
    {
      path: "data/crm.eidos",
      change: "modified",
      kind: "sqlite_database",
    },
  ],
  files: [
    {
      path: "data/crm.eidos",
      change: "modified",
      kind: "sqlite_database",
      rowDiffAvailable: true,
      limitations: [],
      tables: [customersTable],
    },
  ],
}

const unversionedSpace: SpaceSnapshot = {
  id: "space-1",
  name: "Project",
  displayPath: "/Project",
  entries: [],
  eidosFileCount: 0,
  operation: { phase: "ready", recoverable: false },
  graft: {
    available: true,
    backend: "sdk",
    expectedVersion: "0.1.0",
    initialized: false,
  },
  invalidatedSessionIds: [],
}

describe("VersionPanel row diff paging", () => {
  it("keeps version setup inside the panel instead of the titlebar", () => {
    const markup = renderToStaticMarkup(
      createElement(VersionPanel, {
        space: unversionedSpace,
        refreshKey: 0,
        onClose: () => undefined,
        onSpaceChange: () => undefined,
        onRefresh: () => undefined,
        onInspectionChange: () => undefined,
      })
    )

    expect(markup).toContain('data-version-initialized="false"')
    expect(markup).toContain("Start local version history")
    expect(markup).toContain("data-enable-versioning")
    expect(markup).not.toContain('role="tab"')
  })

  it("keeps a 10k-row diff bounded while retaining every page", () => {
    const changes = Array.from({ length: 10_126 }, (_, index) => index)

    expect(versionRowDiffPage(changes, 0)).toMatchObject({
      page: 0,
      pageCount: 102,
      start: 0,
      end: 100,
      total: 10_126,
      items: Array.from({ length: 100 }, (_, index) => index),
    })
    expect(versionRowDiffPage(changes, 101)).toMatchObject({
      page: 101,
      pageCount: 102,
      start: 10_100,
      end: 10_126,
      total: 10_126,
      items: Array.from({ length: 26 }, (_, index) => 10_100 + index),
    })
    expect(versionRowDiffPage(changes, 999)).toMatchObject({
      page: 101,
      start: 10_100,
      end: 10_126,
    })
  })

  it("mounts only the first bounded page for a 10k-row table diff", () => {
    const table: SpaceVersionTableDiff = {
      name: "Elden Ring messages",
      columns: ["msg"],
      primaryKeyColumns: ["_id"],
      changes: Array.from({ length: 10_126 }, (_, index) => ({
        op: "insert",
        key: { _id: String(index + 1) },
        values: [`Message ${index + 1}`],
      })),
    }

    const markup = renderToStaticMarkup(createElement(TableDiff, { table }))

    expect(markup.match(/class="row-diff"/g)).toHaveLength(100)
    expect(markup).toContain("1–100 of 10,126")
    expect(markup).toContain('aria-label="Next row changes"')
  })

  it("models Eidos Files as expandable tree nodes with changed tables", () => {
    const model = buildVersionChangeTreeModel(versionDiff)

    expect(model.paths).toEqual([
      "notes/readme.md",
      "data/crm.eidos/",
      "data/crm.eidos/Customers",
    ])
    expect(model.initialExpandedPaths).toEqual(["notes/", "data/"])
    expect(model.gitStatus).toEqual([
      { path: "notes/readme.md", status: "added" },
      { path: "data/crm.eidos/", status: "modified" },
    ])
    expect(model.decorationByPath.get("data/crm.eidos/")).toBe("1 table")
    expect(model.decorationByPath.get("data/crm.eidos/Customers")).toBe("+1 ~1")
    expect(
      model.targetByTreePath.get("data/crm.eidos/Customers")?.table?.name
    ).toBe("Customers")
  })

  it("renders a selected table diff in the main review surface", () => {
    const file = versionDiff.files[0]!
    const inspection: VersionInspection = {
      type: "table",
      key: "data/crm.eidos/Customers",
      mode: "changes",
      diff: versionDiff,
      change: versionDiff.paths[1]!,
      file,
      table: customersTable,
      commit: null,
    }

    const markup = renderToStaticMarkup(
      createElement(VersionDiffPreview, {
        inspection,
        onClose: () => undefined,
      })
    )

    expect(markup).toContain('data-version-inspector="table"')
    expect(markup).toContain("Customers")
    expect(markup).toContain("+1 rows")
    expect(markup).toContain("~1 rows")
    expect(markup.match(/class="row-diff"/g)).toHaveLength(2)
    expect(markup).toContain("Hao Chen")
    expect(markup).toContain("Customer")
  })
})
