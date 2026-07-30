import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

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
})
