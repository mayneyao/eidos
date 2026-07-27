import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  createEidosFile,
  openEidosFile,
} from "../../../packages/eidos-file/dist/better-sqlite3.mjs"
import { encodeEidosFileAttachmentPaths } from "../../../packages/eidos-file/dist/index.mjs"

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const desktopDirectory = path.dirname(scriptDirectory)
const graft =
  process.env.GRAFT_CLI_PATH ??
  path.join(
    desktopDirectory,
    "dist-cli",
    process.platform === "win32" ? "graft.exe" : "graft"
  )

function runGraft(root, args) {
  const output = execFileSync(graft, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
  return output ? JSON.parse(output) : null
}

if (!existsSync(graft)) {
  throw new Error(
    `Graft CLI is missing at ${graft}. Run pnpm --filter eidos build:cli first.`
  )
}

const root = mkdtempSync(path.join(tmpdir(), "eidos-file-versioning-"))
const relativeEidosFilePath = "tasks.eidos"
const eidosFilePath = path.join(root, relativeEidosFilePath)
const tasksTableId = "019f8a0d-56a0-70f4-a1bc-7ba848af0dbe"
const peopleTableId = "019f8a0d-5720-78fc-ad3c-ad8ae6de5077"

try {
  const base = createEidosFile(eidosFilePath, {
    title: "Versioning smoke",
    defaultTable: {
      id: tasksTableId,
      name: "Tasks",
      fields: [
        { name: "title", type: "text", isRecordLabel: true },
        { name: "Done", columnName: "done", type: "checkbox" },
        { name: "Priority", columnName: "priority", type: "number" },
        {
          name: "Status",
          columnName: "status",
          type: "select",
          property: {
            options: [{ name: "todo" }, { name: "doing" }],
          },
        },
        {
          name: "Labels",
          columnName: "labels",
          type: "multi-select",
          property: {
            options: [{ name: "bug" }, { name: "ux" }],
          },
        },
        { name: "Attachment", columnName: "attachment", type: "file" },
      ],
    },
  })
  base.createTable({
    id: peopleTableId,
    name: "People",
    fields: [{ name: "title", type: "text", isRecordLabel: true }],
  })
  const ada = base.insertRow(peopleTableId, { title: "Ada Lovelace" })
  const grace = base.insertRow(peopleTableId, { title: "Grace Hopper" })
  const peopleTitleField = base
    .listFields(peopleTableId)
    .find((field) => field.name === "title")
  assert.ok(peopleTitleField?.id)
  const ownersField = base.addField(tasksTableId, {
    name: "Owners",
    columnName: "owners",
    type: "relation",
    property: {
      targetTableId: peopleTableId,
      targetField: peopleTitleField.id,
      direction: "forward",
      cardinality: "many",
      onDelete: "restrict",
    },
  })
  const scoreField = base.addField(tasksTableId, {
    name: "Score",
    columnName: "score",
    type: "formula",
    property: { formula: '"Priority" * 10', displayType: "number" },
  })
  const ownerCountField = base.addField(tasksTableId, {
    name: "Owner count",
    columnName: "owner_count",
    type: "lookup",
    property: {
      relationField: ownersField.id,
      targetField: peopleTitleField.id,
      aggregate: "count",
      displayType: "number",
    },
  })
  const capacityField = base.addField(tasksTableId, {
    name: "Capacity",
    columnName: "capacity",
    type: "formula",
    property: {
      formula: '"Owner count" * "Priority"',
      displayType: "number",
    },
  })
  const tasksSchema = base
    .schema()
    .find((table) => table.table.id === tasksTableId)
  const tasksPhysicalName = tasksSchema?.table.physicalName
  assert.ok(tasksPhysicalName)
  const statusField = tasksSchema.fields.find(
    (field) => field.name === "Status"
  )
  const priorityField = tasksSchema.fields.find(
    (field) => field.name === "Priority"
  )
  const labelsField = tasksSchema.fields.find(
    (field) => field.name === "Labels"
  )
  const titleField = tasksSchema.fields.find((field) => field.name === "title")
  const attachmentField = tasksSchema.fields.find(
    (field) => field.name === "Attachment"
  )
  assert.ok(statusField?.id)
  assert.ok(priorityField?.id)
  assert.ok(labelsField?.id)
  assert.ok(titleField?.id)
  assert.ok(attachmentField?.id)
  const attachmentValue = encodeEidosFileAttachmentPaths(["assets/spec.pdf"])
  assert.ok(attachmentValue)
  const first = base.insertRow(tasksTableId, {
    title: "Prove Eidos File diff",
    Done: false,
    Priority: 2,
    Status: "doing",
    Labels: JSON.stringify(["bug", "ux"]),
    Attachment: attachmentValue,
    Owners: JSON.stringify([ada._id]),
  })
  assert.equal(first.Attachment, attachmentValue)
  assert.equal(first.Owners, JSON.stringify([ada._id]))
  assert.equal(first[scoreField.id], 20)
  assert.equal(first[ownerCountField.id], 1)
  assert.equal(first[capacityField.id], 2)
  assert.equal(
    first.Owners__display,
    JSON.stringify([{ id: ada._id, title: "Ada Lovelace" }])
  )
  const queryOnly = base.insertRow(tasksTableId, {
    title: "Query-only row",
    Done: false,
    Priority: 3,
    Status: "doing",
    Labels: JSON.stringify(["ux"]),
  })
  base.insertRow(tasksTableId, {
    title: "Low priority row",
    Done: false,
    Priority: 1,
    Status: "todo",
    Labels: null,
  })
  const query = {
    filter: {
      type: "group",
      conjunction: "and",
      children: [
        {
          type: "rule",
          field: priorityField.id,
          operator: "greater-than-or-equal",
          value: 2,
        },
        {
          type: "rule",
          field: labelsField.id,
          operator: "is-any-of",
          value: ["ux"],
        },
      ],
    },
    sorts: [
      { field: priorityField.id, direction: "desc", nulls: "last" },
      { field: titleField.id, direction: "asc", nulls: "last" },
    ],
  }
  assert.deepEqual(
    base.getRowPage(tasksTableId, 0, 100, query).rows.map((row) => row.title),
    ["Query-only row", "Prove Eidos File diff"]
  )
  const gridView = base.listViews(tasksTableId)[0]
  assert.ok(gridView, "Eidos File should create a default Grid view")
  base.updateView(gridView.id, {
    filter: query.filter,
    sorts: query.sorts,
  })
  const galleryView = base.createView(tasksTableId, {
    name: "Cards",
    type: "gallery",
    properties: {
      cardSize: "medium",
      coverPreview: attachmentField.id,
      fitContent: true,
      hideEmptyFields: true,
    },
  })
  const kanbanView = base.createView(tasksTableId, {
    name: "Status board",
    type: "kanban",
    properties: {
      cardSize: "medium",
      groupByField: statusField.id,
    },
  })
  assert.equal(
    base.deleteRowRanges(tasksTableId, [{ startIndex: 0, endIndex: 0 }], query),
    1
  )
  assert.equal(
    base
      .listRows(tasksTableId)
      .some((row) => String(row._id) === String(queryOnly._id)),
    false
  )
  base.close()

  const persisted = openEidosFile(eidosFilePath)
  const persistedViews = persisted.listViews(tasksTableId)
  const persistedView = persistedViews.find((view) => view.type === "grid")
  assert.ok(persistedView, "Reopened Eidos File should retain its Grid view")
  assert.deepEqual(persistedView?.filter, query.filter)
  assert.deepEqual(persistedView?.sorts, query.sorts)
  const persistedGallery = persistedViews.find(
    (view) => view.id === galleryView.id
  )
  const persistedKanban = persistedViews.find(
    (view) => view.id === kanbanView.id
  )
  assert.ok(persistedGallery)
  assert.ok(persistedKanban)
  assert.deepEqual(
    persistedViews.map((view) => ({
      id: view.id,
      name: view.name,
      type: view.type,
    })),
    [
      {
        id: persistedView.id,
        name: persistedView.name,
        type: "grid",
      },
      {
        id: galleryView.id,
        name: "Cards",
        type: "gallery",
      },
      {
        id: kanbanView.id,
        name: "Status board",
        type: "kanban",
      },
    ]
  )
  assert.deepEqual(
    {
      cardSize: persistedGallery.properties.cardSize,
      coverPreview: persistedGallery.properties.coverPreview,
      fitContent: persistedGallery.properties.fitContent,
      hideEmptyFields: persistedGallery.properties.hideEmptyFields,
    },
    {
      cardSize: "medium",
      coverPreview: attachmentField.id,
      fitContent: true,
      hideEmptyFields: true,
    }
  )
  assert.deepEqual(
    {
      cardSize: persistedKanban.properties.cardSize,
      groupByField: persistedKanban.properties.groupByField,
    },
    { cardSize: "medium", groupByField: statusField.id }
  )
  const copiedView = persisted.duplicateView(persistedView.id, "QA copy")
  assert.deepEqual(
    persisted
      .reorderViews(tasksTableId, [
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
    persisted.listViews(tasksTableId).map((view) => view.id),
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
  const linked = updated.updateRow(tasksTableId, String(first._id), {
    Done: true,
    Priority: 4,
    Owners: JSON.stringify([ada._id, grace._id]),
  })
  assert.equal(linked[scoreField.id], 40)
  assert.equal(linked[ownerCountField.id], 2)
  assert.equal(linked[capacityField.id], 8)
  assert.equal(
    linked.Owners__display,
    JSON.stringify([
      { id: ada._id, title: "Ada Lovelace" },
      { id: grace._id, title: "Grace Hopper" },
    ])
  )
  updated.insertRow(tasksTableId, {
    title: "Render row changes",
    Done: false,
  })
  updated.close()

  const diff = runGraft(root, ["diff", "--rows", "--json"])
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
  assert.equal(
    file.logical_status,
    "logical_changes",
    JSON.stringify(file, null, 2)
  )
  assert.ok(
    !(file.limitations ?? []).some(
      (limitation) =>
        limitation.kind === "without_rowid_table" &&
        limitation.subject === tasksPhysicalName
    ),
    "Graft should support Eidos WITHOUT ROWID tables by declared primary key"
  )
  assert.ok(
    !(file.opaque_changes ?? []).some(
      (change) =>
        change.name === tasksPhysicalName &&
        change.reason === "without_rowid_table"
    ),
    "Graft should not reduce changed Eidos tables to opaque snapshots"
  )
  const tasksDiff = file.tables.find(
    (table) => table.name === tasksPhysicalName
  )
  assert.ok(
    tasksDiff,
    "Graft should expose logical changes for the Eidos table"
  )
  assert.deepEqual(tasksDiff.primary_key_columns, ["_id"])
  const updatedRow = tasksDiff.changes.find(
    (change) => change.op === "update" && change.key?._id === String(first._id)
  )
  assert.ok(updatedRow, "Graft should identify an updated Eidos row by _id")
  assert.equal(updatedRow.old_values[tasksDiff.columns.indexOf("Done")], 0)
  assert.equal(updatedRow.values[tasksDiff.columns.indexOf("Done")], 1)
  assert.ok(
    tasksDiff.changes.some(
      (change) =>
        change.op === "insert" &&
        change.values[tasksDiff.columns.indexOf("title")] ===
          "Render row changes"
    ),
    "Graft should expose inserted Eidos rows"
  )
  const metaDiff = file.tables.find((table) => table.name === "eidos__meta")
  assert.deepEqual(metaDiff?.primary_key_columns, ["singleton"])
  assert.ok(
    metaDiff?.changes.some(
      (change) => change.op === "update" && change.key?.singleton === 1
    ),
    "Graft should expose the Eidos revision update"
  )

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
  const restoredRows = restored.listRows(tasksTableId)
  const restoredFirst = restoredRows.find(
    (row) => String(row._id) === String(first._id)
  )
  assert.equal(restoredFirst?.Done, 0)
  assert.equal(restoredFirst?.Priority, 2)
  assert.equal(restoredFirst?.[ownerCountField.id], 1)
  assert.equal(
    restoredRows.some((row) => row.title === "Render row changes"),
    false
  )
  assert.deepEqual(
    restored.listViews(tasksTableId).map((view) => view.type),
    ["kanban", "gallery", "grid"]
  )
  restored.close()

  const cleanStatus = runGraft(root, ["status", "--json"])
  assert.equal(cleanStatus.has_staged_changes, false)
  assert.equal(cleanStatus.has_unstaged_changes, false)

  console.log(
    JSON.stringify(
      {
        path: file.path,
        logicalStatus: file.logical_status,
        restoredRevision: initialRevision,
        changedTables: file.tables.map((table) => table.name),
      },
      null,
      2
    )
  )
} finally {
  rmSync(root, { recursive: true, force: true })
}
