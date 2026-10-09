import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { DatabaseSync } from "node:sqlite"
import {
  createEidosFile,
  openEidosFile,
} from "@eidos.space/eidos-file/node-sqlite"
import { inspectEidosMergeTables } from "./merge-table-inspection"
import { createFsMetaEidosFile } from "./fs-meta-file"

it("discovers custom physical names and observes new and renamed tables without modifying files", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lite-merge-tables-"))
  const file = path.join(root, "data.eidos")
  try {
    const runtime = createEidosFile(file)
    const table = runtime.createTable({
      name: "项目 Tasks",
      fields: [{ name: "Title", type: "text" }],
    })
    runtime.close()
    const before = await readFile(file)
    expect(inspectEidosMergeTables([file])).toEqual(["项目 Tasks"])
    expect(inspectEidosMergeTables([file, file])).toEqual(["项目 Tasks"])
    expect(await readFile(file)).toEqual(before)
    const changed = openEidosFile(file)
    changed.updateTable(table.id, { name: "Renamed Tasks" })
    changed.createTable({
      name: "收件箱",
      fields: [{ name: "Title", type: "text" }],
    })
    changed.close()
    expect(inspectEidosMergeTables([file]).sort()).toEqual(
      ["Renamed Tasks", "收件箱"].sort()
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it("rejects the entire validation batch when a file has missing registered tables", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lite-merge-validate-batch-"))
  const valid = path.join(root, "valid.eidos")
  const invalid = path.join(root, "invalid.eidos")
  try {
    createEidosFile(valid).close()
    const runtime = createEidosFile(invalid)
    runtime.createTable({
      name: "User chosen name",
      fields: [{ name: "Title", type: "text" }],
    })
    runtime.close()
    const database = new DatabaseSync(invalid)
    try {
      database.exec('DROP TABLE "User chosen name"')
    } finally {
      database.close()
    }
    const before = await Promise.all([readFile(valid), readFile(invalid)])
    expect(() => inspectEidosMergeTables([valid, invalid])).toThrow(
      "Invalid Eidos File"
    )
    expect(await Promise.all([readFile(valid), readFile(invalid)])).toEqual(
      before
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it("rejects invalid files rather than omitting their policy rules", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lite-merge-tables-invalid-"))
  const file = path.join(root, "invalid.eidos")
  try {
    await writeFile(file, "invalid")
    expect(() => inspectEidosMergeTables([file])).toThrow("Invalid Eidos File")
    expect(() => inspectEidosMergeTables(["relative.eidos"])).toThrow(
      "absolute"
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it("discovers declared virtual tables with the host's extension support", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "lite-merge-tables-vtab-"))
  const file = path.join(root, "files.eidos")
  try {
    createFsMetaEidosFile(file, { tableName: "索引文件" })
    const before = await readFile(file)
    expect(inspectEidosMergeTables([file])).toEqual(["索引文件"])
    expect(await readFile(file)).toEqual(before)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
