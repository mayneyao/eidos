import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"
import { DatabaseSync } from "node:sqlite"
import { vi } from "vitest"

import {
  createEidosLiteFileRuntime,
  openEidosLiteFileRuntime,
} from "./eidos-file-runtime"

describe("Eidos Lite Runtime 1.0 editor adapter", () => {
  it("creates scalar record labels and performs canonical field conversions", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-lite-runtime-"))
    const filePath = path.join(root, "regression.eidos")
    let opened = await createEidosLiteFileRuntime(filePath, "Regression")
    try {
      let snapshot = await opened.source.getSnapshot()
      const firstTable = snapshot.tables[0]!
      const nameField = firstTable.fields.find(
        (field) => field.name === "Name"
      )!

      const inserted = await opened.source.insertRow(firstTable.table.id, {
        [nameField.id!]: "Alpha",
      })
      snapshot = await opened.source.updateField(
        firstTable.table.id,
        nameField.id!,
        { type: "select" }
      )

      expect(
        snapshot.tables[0]!.fields.find((field) => field.id === nameField.id)
          ?.type
      ).toBe("select")
      await expect(
        opened.source.getRow(firstTable.table.id, String(inserted.row._id))
      ).resolves.toMatchObject({ [nameField.id!]: "Alpha" })

      snapshot = await opened.source.createTable({ name: "Table 2" })
      const secondTable = snapshot.tables.find(
        (table) => table.table.name === "Table 2"
      )!
      expect(
        secondTable.fields.find((field) => field.isRecordLabel)
      ).toMatchObject({ name: "Name", type: "text" })

      await opened.close()
      opened = await openEidosLiteFileRuntime(filePath)
      await expect(opened.source.getSnapshot()).resolves.toMatchObject({
        tables: [
          { table: { name: "Table 1" } },
          { table: { name: "Table 2" } },
        ],
      })
    } finally {
      await opened.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("keeps Table display and physical names identical", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-lite-names-"))
    const filePath = path.join(root, "names.eidos")
    let opened = await createEidosLiteFileRuntime(filePath, "Names")
    try {
      await expect(
        opened.source.createTable({ name: "table 1" })
      ).rejects.toThrow(/Duplicate Table name/)
      for (const name of ["sqlite_archive", "EIDOS__Internal"]) {
        await expect(opened.source.createTable({ name })).rejects.toThrow(
          /must not begin with sqlite_ or eidos__/
        )
      }

      let snapshot = await opened.source.createTable({
        name: "x__vendor__Notes",
      })
      const created = snapshot.tables.find(
        (table) => table.table.name === "x__vendor__Notes"
      )!
      expect(created.table.name).toBe("x__vendor__Notes")

      snapshot = await opened.source.updateTable(created.table.id, {
        name: "Research Notes",
      })
      expect(
        snapshot.tables.find((table) => table.table.id === created.table.id)
          ?.table
      ).toMatchObject({
        name: "Research Notes",
      })

      snapshot = await opened.source.updateTable(created.table.id, {
        name: "research notes",
      })
      expect(
        snapshot.tables.find((table) => table.table.id === created.table.id)
          ?.table
      ).toMatchObject({
        name: "research notes",
      })

      await opened.close()
      opened = await openEidosLiteFileRuntime(filePath)
      const reopenedSnapshot = await opened.source.getSnapshot()
      expect(
        reopenedSnapshot.tables.find(
          (table) => table.table.id === created.table.id
        )?.table
      ).toMatchObject({
        name: "research notes",
      })
      await opened.close()
      const database = new DatabaseSync(filePath, { readOnly: true })
      try {
        expect(
          database
            .prepare("SELECT name,physical_name FROM eidos__tables WHERE id=?")
            .get(created.table.id)
        ).toEqual({
          name: "research notes",
          physical_name: "research notes",
        })
      } finally {
        database.close()
      }
    } finally {
      await opened.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("imports a large CSV through one canonical bulk mutation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-lite-csv-runtime-"))
    const filePath = path.join(root, "csv-regression.eidos")
    const opened = await createEidosLiteFileRuntime(filePath, "CSV regression")
    try {
      const before = await opened.source.getSnapshot()
      const importCsv = vi.spyOn(opened.source.runtime, "importCsv")
      const mutateRows = vi.spyOn(opened.source.runtime, "mutateRows")
      const columns = [
        "name",
        "category",
        "level",
        "score",
        "enabled",
        "owner",
        "status",
        "note",
        "tag",
      ]
      const lines = [columns.join(",")]
      for (let index = 0; index < 10_111; index += 1) {
        lines.push(
          [
            `Record ${index}`,
            `Category ${index % 20}`,
            String(index % 100),
            String(index * 1.25),
            index % 2 === 0 ? "true" : "false",
            `Owner ${index % 50}`,
            index % 3 === 0 ? "open" : "closed",
            `Note ${index}`,
            `Tag ${index % 10}`,
          ].join(",")
        )
      }
      const bytes = new TextEncoder().encode(lines.join("\n"))
      const csv = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength
      ) as ArrayBuffer

      const startedAt = performance.now()
      const imported = await opened.source.importCsv("benchmark.csv", csv)
      const durationMs = performance.now() - startedAt

      expect(imported.result.importedRowCount).toBe(10_111)
      expect(
        imported.snapshot.tables.find(
          (table) => table.table.id === imported.result.table.id
        )?.rowCount
      ).toBe(10_111)
      expect(importCsv).toHaveBeenCalledTimes(1)
      expect(mutateRows).not.toHaveBeenCalled()
      expect(
        BigInt(imported.snapshot.metadata.revision) -
          BigInt(before.metadata.revision)
      ).toBe(3n)
      expect(durationMs).toBeLessThan(5_000)
    } finally {
      await opened.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 15_000)
})
