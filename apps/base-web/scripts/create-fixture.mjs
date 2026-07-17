import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import Database from "better-sqlite3"

import {
  createBaseFile,
  openBaseFile,
} from "../../../packages/base/dist/better-sqlite3.mjs"

const directory = path.dirname(fileURLToPath(import.meta.url))
const defaultOutput = path.resolve(
  directory,
  "../fixtures/project-tracker.base"
)
const output = path.resolve(process.argv[2] ?? defaultOutput)

fs.mkdirSync(path.dirname(output), { recursive: true })
fs.rmSync(output, { force: true })

const base = createBaseFile(output, {
  title: "Project tracker",
  description: "Repeatable browser editor fixture",
  defaultTable: {
    id: "projects",
    name: "Projects",
    fields: [
      {
        name: "Status",
        columnName: "status",
        type: "select",
        property: {
          options: [
            { value: "Backlog", color: "gray" },
            { value: "Active", color: "blue" },
            { value: "Done", color: "green" },
          ],
        },
      },
      {
        name: "Estimate",
        columnName: "estimate",
        type: "number",
      },
      { name: "Due", columnName: "due", type: "date" },
      { name: "Complete", columnName: "complete", type: "checkbox" },
      { name: "Notes", columnName: "notes", type: "text" },
    ],
  },
})

const rows = Array.from({ length: 2_500 }, (_, index) => {
  const sequence = index + 1
  const status =
    sequence % 7 === 0 ? "Done" : sequence % 3 === 0 ? "Active" : "Backlog"
  return {
    _id: `project_${String(sequence).padStart(5, "0")}`,
    title: sequence === 1 ? "Ship Base Web Editor" : `Project ${sequence}`,
    status,
    estimate: (sequence % 13) + 1,
    due: `2026-${String((sequence % 12) + 1).padStart(2, "0")}-${String((sequence % 27) + 1).padStart(2, "0")}`,
    complete: status === "Done",
    notes:
      sequence % 5 === 0 ? "Review with the Base runtime and UI owners." : null,
  }
})

for (let offset = 0; offset < rows.length; offset += 250) {
  base.insertImportedRows("projects", rows.slice(offset, offset + 250))
}
base.createView("projects", {
  name: "By status",
  type: "kanban",
  properties: { groupByField: "status" },
})
base.createView("projects", {
  name: "Project cards",
  type: "gallery",
  properties: { titleField: "title" },
})
base.close()

const reopened = openBaseFile(output, { readonly: true })
try {
  const validation = reopened.info()
  if (validation.format !== "eidos-base") {
    throw new Error("Fixture did not reopen as an Eidos Base")
  }
  if (reopened.countRows("projects") !== rows.length) {
    throw new Error("Fixture row count changed after reopen")
  }
} finally {
  reopened.close()
}

const sqlite = new Database(output, { readonly: true })
try {
  const integrity = sqlite.prepare("PRAGMA integrity_check").pluck().get()
  if (integrity !== "ok")
    throw new Error(`Fixture integrity failed: ${integrity}`)
} finally {
  sqlite.close()
}

console.log(
  JSON.stringify({
    output,
    bytes: fs.statSync(output).size,
    rows: rows.length,
    integrity: "ok",
  })
)
