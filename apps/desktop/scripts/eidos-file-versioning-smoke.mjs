import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import Database from "better-sqlite3"

import {
  createEidosFile,
  openEidosFile,
} from "../../../packages/eidos-file/dist/better-sqlite3.mjs"

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

  const workspaceSessionPath = path.join(root, ".graft")
  const uri = pathToFileURL(workspaceSessionPath)
  uri.searchParams.set("vfs", "graft")
  const control = new Database(uri.href)
  try {
    const raw = control.pragma(
      `graft_json_diff = '--rows "HEAD" -- "tasks.eidos"'`,
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

const root = mkdtempSync(path.join(tmpdir(), "eidos-file-versioning-"))
const relativeEidosFilePath = "tasks.eidos"
const eidosFilePath = path.join(root, relativeEidosFilePath)

try {
  const base = createEidosFile(eidosFilePath, {
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
            options: [{ value: "todo" }, { value: "doing" }],
          },
        },
        {
          name: "Labels",
          columnName: "labels",
          type: "multi-select",
          property: {
            options: [{ value: "bug" }, { value: "ux" }],
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
  base.addField("tasks", {
    name: "Score",
    columnName: "score",
    type: "formula",
    property: { formula: "priority * 10", displayType: "number" },
  })
  base.addField("tasks", {
    name: "Owner count",
    columnName: "owner_count",
    type: "lookup",
    property: {
      relationField: "owners",
      targetField: "title",
      aggregate: "count",
      displayType: "number",
    },
  })
  base.addField("tasks", {
    name: "Capacity",
    columnName: "capacity",
    type: "formula",
    property: {
      formula: "owner_count * priority",
      displayType: "number",
    },
  })
  const first = base.insertRow("tasks", {
    title: "Prove Eidos File diff",
    done: false,
    priority: 2,
    status: "doing",
    labels: JSON.stringify(["bug", "ux"]),
    attachment: JSON.stringify(["assets/spec.pdf"]),
    owners: JSON.stringify([ada._id]),
  })
  assert.equal(first.attachment, '["assets/spec.pdf"]')
  assert.equal(first.owners, JSON.stringify([ada._id]))
  assert.equal(first.score, 20)
  assert.equal(first.owner_count, 1)
  assert.equal(first.capacity, 2)
  assert.equal(
    first.owners__display,
    JSON.stringify([{ id: ada._id, title: "Ada Lovelace" }])
  )
  const queryOnly = base.insertRow("tasks", {
    title: "Query-only row",
    done: false,
    priority: 3,
    status: "doing",
    labels: JSON.stringify(["ux"]),
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
    ["Query-only row", "Prove Eidos File diff"]
  )
  const gridView = base.listViews("tasks")[0]
  assert.ok(gridView, "Eidos File should create a default Grid view")
  base.updateView(gridView.id, {
    filter: query.filter,
    sorts: query.sorts,
  })
  const galleryView = base.createView("tasks", {
    name: "Cards",
    type: "gallery",
    properties: {
      cardSize: "medium",
      coverPreview: "attachment",
      fitContent: true,
      hideEmptyFields: true,
    },
  })
  const kanbanView = base.createView("tasks", {
    name: "Status board",
    type: "kanban",
    properties: {
      cardSize: "medium",
      groupByField: "status",
    },
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

  const persisted = openEidosFile(eidosFilePath)
  const persistedViews = persisted.listViews("tasks")
  const persistedView = persistedViews.find((view) => view.type === "grid")
  assert.ok(persistedView, "Reopened Eidos File should retain its Grid view")
  assert.deepEqual(persistedView?.filter, query.filter)
  assert.deepEqual(persistedView?.sorts, query.sorts)
  assert.deepEqual(
    persistedViews.map((view) => ({
      id: view.id,
      name: view.name,
      type: view.type,
      properties: view.properties,
    })),
    [
      {
        id: persistedView.id,
        name: persistedView.name,
        type: "grid",
        properties: persistedView.properties,
      },
      {
        id: galleryView.id,
        name: "Cards",
        type: "gallery",
        properties: {
          cardSize: "medium",
          coverPreview: "attachment",
          fitContent: true,
          hideEmptyFields: true,
        },
      },
      {
        id: kanbanView.id,
        name: "Status board",
        type: "kanban",
        properties: { cardSize: "medium", groupByField: "status" },
      },
    ]
  )
  const copiedView = persisted.duplicateView(persistedView.id, "QA copy")
  assert.deepEqual(
    persisted
      .reorderViews("tasks", [
        copiedView.id,
        kanbanView.id,
        galleryView.id,
        persistedView.id,
      ])
      .map((view) => view.name),
    ["QA copy", "Status board", "Cards", persistedView.name]
  )
  assert.equal(persisted.deleteView(copiedView.id), true)
  assert.deepEqual(
    persisted.listViews("tasks").map((view) => view.id),
    [kanbanView.id, galleryView.id, persistedView.id]
  )
  persisted.close()

  writeFileSync(path.join(root, ".graftignore"), ".graft/\n.graftignore\n")
  runGraft(root, ["init", "--json"])
  runGraft(root, ["add", relativeEidosFilePath, "--json"])
  const initialCommit = runGraft(root, [
    "commit",
    "--message",
    "Initial Eidos File",
    "--json",
  ])
  const initialRevision = initialCommit?.commit?.id
  assert.equal(typeof initialRevision, "string")

  const updated = openEidosFile(eidosFilePath)
  const linked = updated.updateRow("tasks", String(first._id), {
    done: true,
    priority: 4,
    owners: JSON.stringify([ada._id, grace._id]),
  })
  assert.equal(linked.score, 40)
  assert.equal(linked.owner_count, 2)
  assert.equal(linked.capacity, 8)
  assert.equal(
    linked.owners__display,
    JSON.stringify([
      { id: ada._id, title: "Ada Lovelace" },
      { id: grace._id, title: "Grace Hopper" },
    ])
  )
  updated.insertRow("tasks", { title: "Render row changes", done: false })
  updated.close()

  const rawDiff = runGraft(root, ["diff", "--rows", "--json"])
  const anonymousSessionEntries = rawDiff.paths.filter(
    (entry) => entry.path === ".graft"
  )
  if (anonymousSessionEntries.length > 0) {
    console.warn(
      "Graft v0.6.0 exposes its anonymous .graft workspace session in an " +
        "unscoped CLI row diff; Eidos path-scoped row diffs exclude it"
    )
  }
  const diff = {
    ...rawDiff,
    paths: rawDiff.paths.filter((entry) => entry.path !== ".graft"),
    files: rawDiff.files.filter((entry) => entry.path !== ".graft"),
  }
  assert.deepEqual(diff.paths, [
    {
      path: relativeEidosFilePath,
      change: "modified",
      kind: "sqlite_database",
      storage: "sqlite_snapshot",
    },
  ])

  const file = diff.files.find((entry) => entry.path === relativeEidosFilePath)
  assert.ok(file, "Graft should return row details for tasks.eidos")
  assert.equal(file.row_diff_available, true)
  assert.equal(file.logical_status, "logical_changes")

  const tasks = file.tables.find((table) => table.name === "tb_tasks")
  assert.ok(tasks, "Graft should expand the Eidos File records table")
  assert.deepEqual(tasks.changes.map((change) => change.op).sort(), [
    "insert",
    "update",
  ])
  assert.ok(tasks.columns.includes("title"))
  assert.ok(tasks.columns.includes("done"))

  const restore = runGraft(root, [
    "restore",
    "--json",
    "--expected-head",
    initialRevision,
    "--source",
    initialRevision,
    "--",
    relativeEidosFilePath,
  ])
  assert.deepEqual(
    (restore.paths ?? [restore.path]).map((entry) =>
      typeof entry === "string" ? entry : entry?.path
    ),
    [relativeEidosFilePath]
  )

  const restored = openEidosFile(eidosFilePath)
  const restoredRows = restored.listRows("tasks")
  const restoredFirst = restoredRows.find(
    (row) => String(row._id) === String(first._id)
  )
  assert.equal(restoredFirst?.done, 0)
  assert.equal(restoredFirst?.priority, 2)
  assert.equal(restoredFirst?.owner_count, 1)
  assert.equal(
    restoredRows.some((row) => row.title === "Render row changes"),
    false
  )
  assert.deepEqual(
    restored.listViews("tasks").map((view) => view.type),
    ["kanban", "gallery", "grid"]
  )
  restored.close()

  const cleanStatus = runGraft(root, ["status", "--json"])
  assert.equal(cleanStatus.has_staged_changes, false)
  assert.equal(cleanStatus.has_unstaged_changes, false)

  // Run the in-process pragma check last. Loading the extension into the
  // Electron helper process intentionally keeps its VFS registered for the
  // process lifetime, so no separate Graft CLI process should follow it.
  const scopedUpdated = openEidosFile(eidosFilePath)
  scopedUpdated.updateRow("tasks", String(first._id), {
    done: true,
    priority: 4,
    owners: JSON.stringify([ada._id, grace._id]),
  })
  scopedUpdated.insertRow("tasks", {
    title: "Render row changes",
    done: false,
  })
  scopedUpdated.close()
  const scopedDiff = runPathScopedPragmaDiff(root)
  assert.deepEqual(scopedDiff.paths, diff.paths)
  assert.equal(scopedDiff.files[0]?.path, relativeEidosFilePath)
  assert.equal(scopedDiff.files[0]?.row_diff_available, true)

  console.log(
    JSON.stringify(
      {
        path: file.path,
        logicalStatus: file.logical_status,
        restoredRevision: initialRevision,
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
