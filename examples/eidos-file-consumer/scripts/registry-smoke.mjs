import { copyFile, mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { openEidosFile } from "@eidos.space/eidos-file/better-sqlite3"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const temporary = await mkdtemp(join(tmpdir(), "eidos-file-consumer-"))
const fixture = join(root, "public", "project-tracker.eidos")
const workingCopy = join(temporary, "project-tracker.eidos")

try {
  await copyFile(fixture, workingCopy)
  const file = openEidosFile(workingCopy)
  const table = file.listTables()[0]
  if (!table)
    throw new Error("Expected the sample Eidos File to contain a table")
  const page = file.getRowPage(table.id, 0, 3, {})
  if (page.rows.length !== 3)
    throw new Error("Registry runtime could not page rows")
  file.createView(table.id, { name: "Timeline", type: "timeline" })
  if (!file.listViews(table.id).some((view) => view.type === "timeline")) {
    throw new Error("Registry runtime did not persist a custom view descriptor")
  }
  file.close()
  console.log(
    `registry smoke passed: ${page.total} rows, custom view persisted`
  )
} finally {
  await rm(temporary, { recursive: true, force: true })
}
