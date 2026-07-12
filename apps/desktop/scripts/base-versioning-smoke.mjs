import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import Database from "better-sqlite3"

import {
  createBaseFile,
  openBaseFile,
} from "../../../packages/base/dist/better-sqlite3.mjs"

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const desktopDirectory = path.dirname(scriptDirectory)
const graft = path.join(
  desktopDirectory,
  "dist-cli",
  process.platform === "win32" ? "graft.exe" : "graft"
)
const libraryExtension = { darwin: "dylib", linux: "so", win32: "dll" }[
  process.platform
]
const graftLibrary = libraryExtension
  ? path.join(
      desktopDirectory,
      "dist-sqlite-ext",
      `libgraft.${libraryExtension}`
    )
  : null

function runGraft(root, args) {
  const output = execFileSync(graft, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
  return output ? JSON.parse(output) : null
}

function runPathScopedPragmaDiff(root) {
  assert.ok(
    graftLibrary && existsSync(graftLibrary),
    "Graft extension is missing"
  )
  const registration = new Database(":memory:")
  try {
    registration.loadExtension(graftLibrary)
  } finally {
    registration.close()
  }

  const controlPath = path.join(root, ".graft", "control.sqlite")
  const uri = pathToFileURL(controlPath)
  uri.searchParams.set("vfs", "graft")
  const control = new Database(uri.href)
  try {
    const raw = control.pragma(
      `graft_json_diff = '--rows "HEAD" -- "tasks.base"'`,
      { simple: true }
    )
    assert.equal(typeof raw, "string")
    return JSON.parse(raw)
  } finally {
    control.close()
  }
}

if (!existsSync(graft)) {
  throw new Error(
    `Graft CLI is missing at ${graft}. Run pnpm --filter eidos build:cli first.`
  )
}

const root = mkdtempSync(path.join(tmpdir(), "eidos-base-versioning-"))
const relativeBasePath = "tasks.base"
const basePath = path.join(root, relativeBasePath)

try {
  const base = createBaseFile(basePath, {
    title: "Versioning smoke",
    defaultTable: {
      id: "tasks",
      name: "Tasks",
      fields: [
        { name: "Done", columnName: "done", type: "checkbox" },
        { name: "Priority", columnName: "priority", type: "number" },
        {
          name: "Status",
          columnName: "status",
          type: "select",
          property: {
            options: [
              { id: "todo", name: "Todo" },
              { id: "doing", name: "Doing" },
            ],
          },
        },
        {
          name: "Labels",
          columnName: "labels",
          type: "multi-select",
          property: {
            options: [
              { id: "bug", name: "Bug" },
              { id: "ux", name: "UX" },
            ],
          },
        },
        { name: "Attachment", columnName: "attachment", type: "file" },
      ],
    },
  })
  base.createTable({ id: "people", name: "People" })
  const ada = base.insertRow("people", { title: "Ada Lovelace" })
  const grace = base.insertRow("people", { title: "Grace Hopper" })
  base.addField("tasks", {
    name: "Owners",
    columnName: "owners",
    type: "link",
    property: {
      targetTableId: "people",
      targetField: "title",
      multiple: true,
    },
  })
  const first = base.insertRow("tasks", {
    title: "Prove Base diff",
    done: false,
    priority: 2,
    status: "doing",
    labels: "bug,ux",
    attachment: "assets/spec.pdf",
    owners: String(ada._id),
  })
  assert.equal(first.attachment, '["assets/spec.pdf"]')
  assert.equal(first.owners, JSON.stringify([ada._id]))
  assert.equal(
    first.owners__display,
    JSON.stringify([{ id: ada._id, title: "Ada Lovelace" }])
  )
  const queryOnly = base.insertRow("tasks", {
    title: "Query-only row",
    done: false,
    priority: 3,
    status: "doing",
    labels: "ux",
  })
  base.insertRow("tasks", {
    title: "Low priority row",
    done: false,
    priority: 1,
    status: "todo",
    labels: null,
  })
  const query = {
    filter: {
      type: "group",
      conjunction: "and",
      children: [
        {
          type: "rule",
          field: "priority",
          operator: "greater-than-or-equal",
          value: 2,
        },
        {
          type: "rule",
          field: "labels",
          operator: "is-any-of",
          value: ["ux"],
        },
      ],
    },
    sorts: [
      { field: "priority", direction: "desc" },
      { field: "title", direction: "asc" },
    ],
  }
  assert.deepEqual(
    base.getRowPage("tasks", 0, 100, query).rows.map((row) => row.title),
    ["Query-only row", "Prove Base diff"]
  )
  const gridView = base.listViews("tasks")[0]
  assert.ok(gridView, "Base should create a default Grid view")
  base.updateView(gridView.id, {
    filter: query.filter,
    sorts: query.sorts,
  })
  assert.equal(
    base.deleteRowRanges("tasks", [{ startIndex: 0, endIndex: 1 }], query),
    1
  )
  assert.equal(
    base
      .listRows("tasks")
      .some((row) => String(row._id) === String(queryOnly._id)),
    false
  )
  base.close()

  const persisted = openBaseFile(basePath)
  const persistedView = persisted.listViews("tasks")[0]
  assert.deepEqual(persistedView?.filter, query.filter)
  assert.deepEqual(persistedView?.sorts, query.sorts)
  const copiedView = persisted.duplicateView(persistedView.id, "QA copy")
  assert.deepEqual(
    persisted
      .reorderViews("tasks", [copiedView.id, persistedView.id])
      .map((view) => view.name),
    ["QA copy", persistedView.name]
  )
  assert.equal(persisted.deleteView(copiedView.id), true)
  assert.deepEqual(
    persisted.listViews("tasks").map((view) => view.id),
    [persistedView.id]
  )
  persisted.close()

  runGraft(root, ["init", "--json"])
  runGraft(root, ["add", relativeBasePath, "--json"])
  runGraft(root, ["commit", "--message", "Initial Base", "--json"])

  const updated = openBaseFile(basePath)
  const linked = updated.updateRow("tasks", String(first._id), {
    done: true,
    owners: JSON.stringify([ada._id, grace._id]),
  })
  assert.equal(
    linked.owners__display,
    JSON.stringify([
      { id: ada._id, title: "Ada Lovelace" },
      { id: grace._id, title: "Grace Hopper" },
    ])
  )
  updated.insertRow("tasks", { title: "Render row changes", done: false })
  updated.close()

  const diff = runGraft(root, ["diff", "--rows", "--json"])
  assert.deepEqual(diff.paths, [
    {
      path: relativeBasePath,
      change: "modified",
      kind: "sqlite_database",
      storage: "sqlite_snapshot",
    },
  ])

  const file = diff.files.find((entry) => entry.path === relativeBasePath)
  assert.ok(file, "Graft should return row details for tasks.base")
  assert.equal(file.row_diff_available, true)
  assert.equal(file.logical_status, "logical_changes")

  const tasks = file.tables.find((table) => table.name === "tb_tasks")
  assert.ok(tasks, "Graft should expand the Base records table")
  assert.deepEqual(tasks.changes.map((change) => change.op).sort(), [
    "insert",
    "update",
  ])
  assert.ok(tasks.columns.includes("title"))
  assert.ok(tasks.columns.includes("done"))

  const scopedDiff = runPathScopedPragmaDiff(root)
  assert.deepEqual(scopedDiff.paths, diff.paths)
  assert.equal(scopedDiff.files[0]?.path, relativeBasePath)
  assert.equal(scopedDiff.files[0]?.row_diff_available, true)

  console.log(
    JSON.stringify(
      {
        path: file.path,
        logicalStatus: file.logical_status,
        tables: file.tables.map((table) => ({
          name: table.name,
          operations: table.changes.map((change) => change.op),
        })),
      },
      null,
      2
    )
  )
} finally {
  rmSync(root, { recursive: true, force: true })
}
