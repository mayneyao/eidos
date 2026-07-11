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
      fields: [{ name: "Done", columnName: "done", type: "checkbox" }],
    },
  })
  const first = base.insertRow("tasks", {
    title: "Prove Base diff",
    done: false,
  })
  base.close()

  runGraft(root, ["init", "--json"])
  runGraft(root, ["add", relativeBasePath, "--json"])
  runGraft(root, ["commit", "--message", "Initial Base", "--json"])

  const updated = openBaseFile(basePath)
  updated.updateRow("tasks", String(first._id), { done: true })
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
