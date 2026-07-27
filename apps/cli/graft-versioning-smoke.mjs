#!/usr/bin/env node

import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const cliDirectory = path.dirname(fileURLToPath(import.meta.url))
const eidos =
  process.env.EIDOS_CLI_PATH ??
  path.join(
    cliDirectory,
    "target",
    "debug",
    process.platform === "win32" ? "eidos.exe" : "eidos"
  )
const graft = process.env.GRAFT_CLI_PATH ?? "graft"

function runJson(command, args, cwd) {
  const output = execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
  return output ? JSON.parse(output) : null
}

function runEidos(root, args) {
  return runJson(eidos, args, root)
}

function runGraft(root, args) {
  return runJson(graft, args, root)
}

const root = mkdtempSync(path.join(tmpdir(), "eidos-cli-graft-"))
const relativeFile = "tracker.eidos"

try {
  const created = runEidos(root, [
    "create",
    relativeFile,
    "--title",
    "Graft smoke",
    "--table",
    "Tasks",
    "--label-field",
    "Title",
    "--fields",
    JSON.stringify([
      { name: "Title", type: "text", nullable: false },
      { name: "Status", type: "text" },
    ]),
  ])
  assert.equal(created.file.revision, "1")

  const added = runEidos(root, [
    relativeFile,
    "rows",
    "add",
    "Tasks",
    "--expected-revision",
    "1",
    "--values",
    JSON.stringify([
      { Title: "Ship diff", Status: "doing" },
      { Title: "Keep restore", Status: "todo" },
    ]),
  ])
  assert.equal(added.revision, "2")
  const updatedRowId = added.created[0].rowId

  runGraft(root, ["init", "--json"])
  runGraft(root, ["add", relativeFile, "--json"])
  const committed = runGraft(root, [
    "commit",
    "--message",
    "Initial Eidos File",
    "--json",
  ])
  const initialCommit = committed.commit.id
  assert.equal(typeof initialCommit, "string")

  const updated = runEidos(root, [
    relativeFile,
    "rows",
    "update",
    "Tasks",
    updatedRowId,
    "--expected-revision",
    "2",
    "--values",
    JSON.stringify({ Status: "done" }),
  ])
  assert.equal(updated.revision, "3")

  const inserted = runEidos(root, [
    relativeFile,
    "rows",
    "add",
    "Tasks",
    "--expected-revision",
    "3",
    "--values",
    JSON.stringify({ Title: "Render primary keys", Status: "todo" }),
  ])
  assert.equal(inserted.revision, "4")

  const diff = runGraft(root, ["diff", "--rows", "--json"])
  assert.deepEqual(diff.paths, [
    {
      path: relativeFile,
      change: "modified",
      kind: "sqlite_database",
      storage: "sqlite_snapshot",
    },
  ])
  const file = diff.files.find((entry) => entry.path === relativeFile)
  assert.equal(file?.logical_status, "logical_changes")
  const tasks = file.tables.find(
    (table) =>
      table.primary_key_columns?.length === 1 &&
      table.primary_key_columns[0] === "_id"
  )
  assert.ok(tasks, "Graft should expose the Eidos user table by _id")
  assert.ok(
    tasks.changes.some(
      (change) => change.op === "update" && change.key?._id === updatedRowId
    ),
    "Graft should expose the Eidos CLI row update"
  )
  assert.ok(
    tasks.changes.some(
      (change) =>
        change.op === "insert" && change.key?._id === inserted.created[0].rowId
    ),
    "Graft should expose the Eidos CLI row insert"
  )
  const meta = file.tables.find((table) => table.name === "eidos__meta")
  assert.ok(
    meta?.changes.some(
      (change) =>
        change.op === "update" &&
        change.key?.singleton === 1 &&
        change.values[meta.columns.indexOf("revision")] === 4
    ),
    "Graft should expose the Eidos revision change"
  )
  assert.equal(
    runEidos(root, [relativeFile, "validate", "--level", "full"]).valid,
    true
  )

  runGraft(root, [
    "restore",
    "--json",
    "--expected-head",
    initialCommit,
    "--source",
    initialCommit,
    "--",
    relativeFile,
  ])
  const restored = runEidos(root, [relativeFile, "query", "Tasks"])
  assert.equal(restored.revision, "2")
  assert.equal(restored.rows.length, 2)
  assert.equal(
    restored.rows.find((row) => row._id === updatedRowId)?.Status,
    "doing"
  )
  assert.equal(
    runEidos(root, [relativeFile, "validate", "--level", "full"]).valid,
    true
  )

  const status = runGraft(root, ["status", "--json"])
  assert.equal(status.has_staged_changes, false)
  assert.equal(status.has_unstaged_changes, false)

  console.log(
    JSON.stringify(
      {
        path: relativeFile,
        logicalStatus: file.logical_status,
        changedTables: file.tables.map((table) => table.name),
        restoredRevision: restored.revision,
      },
      null,
      2
    )
  )
} finally {
  rmSync(root, { recursive: true, force: true })
}
