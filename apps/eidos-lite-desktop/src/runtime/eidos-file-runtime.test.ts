import { mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"
import { DatabaseSync } from "node:sqlite"
import { vi } from "vitest"
import {
  createEidosFileUuid,
  encodeEidosFileValues,
} from "@eidos.space/eidos-file"

import {
  createEidosLiteFileRuntime,
  openEidosLiteFileRuntime,
} from "./eidos-file-runtime"

describe("Eidos Lite Runtime 1.0 editor adapter", () => {
  it("finds persisted File entries by stable ID and rejects unknown IDs", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-lite-files-"))
    const filePath = path.join(root, "files.eidos")
    const opened = await createEidosLiteFileRuntime(filePath, "Files")
    try {
      let snapshot = await opened.source.getSnapshot()
      const tableId = snapshot.tables[0]!.table.id
      snapshot = await opened.source.addField(tableId, {
        name: "Files",
        type: "file",
      })
      const field = snapshot.tables[0]!.fields.find(
        (candidate) => candidate.name === "Files"
      )!
      const entry = {
        id: createEidosFileUuid(),
        uri: "assets/photo.png",
        name: "photo.png",
        mediaType: "image/png",
        size: "9",
      }
      await opened.source.insertRow(tableId, {
        [field.id!]: encodeEidosFileValues([entry]),
      })

      expect(opened.findFileEntry(entry.id)).toEqual(entry)
      expect(opened.findFileEntry(createEidosFileUuid())).toBeNull()
    } finally {
      await opened.close()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("creates scalar record labels and performs canonical field conversions", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-lite-runtime-"))
    const filePath = path.join(root, "regression.eidos")
    let opened = await createEidosLiteFileRuntime(filePath, "Regression")
    try {
      let snapshot = opened.initialSnapshot
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
      expect(
        snapshot.tables[0]!.fields.find((field) => field.id === nameField.id)
          ?.property
      ).toMatchObject({
        options: [expect.objectContaining({ name: "Alpha" })],
      })
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
      expect(
        opened.initialSnapshot.tables.map((table) => table.table.name)
      ).toEqual(["Table 1", "Table 2"])
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

  it("persists and executes an explicit Record ID filter group without flattening it", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-lite-row-id-filter-"))
    const filePath = path.join(root, "row-id-filter.eidos")
    let opened = await createEidosLiteFileRuntime(filePath, "Row ID filter")
    try {
      const snapshot = await opened.source.getSnapshot()
      const table = snapshot.tables[0]!
      const view = table.views[0]!
      const rowIdField = table.fields.find((field) => field.type === "row-id")!

      const updated = await opened.source.updateView(view.id, {
        filter: {
          type: "group",
          conjunction: "and",
          children: [
            {
              type: "group",
              conjunction: "and",
              children: [
                {
                  type: "rule",
                  field: rowIdField.id!,
                  operator: "equals",
                  value: "123",
                },
              ],
            },
          ],
        },
      })

      expect(updated.tables[0]!.views[0]!.filter).toEqual({
        type: "group",
        conjunction: "and",
        children: [
          {
            type: "group",
            conjunction: "and",
            children: [
              {
                type: "rule",
                field: rowIdField.id,
                operator: "equals",
                value: "123",
              },
            ],
          },
        ],
      })
      await expect(
        opened.source.getPage(table.table.id, 0, 50, {
          filter: updated.tables[0]!.views[0]!.filter!,
        })
      ).resolves.toMatchObject({ rows: [], total: 0 })

      await opened.close()
      opened = await openEidosLiteFileRuntime(filePath)
      const reopenedTable = opened.initialSnapshot.tables[0]!
      const reopenedFilter = reopenedTable.views[0]!.filter
      expect(reopenedFilter).toEqual(updated.tables[0]!.views[0]!.filter)
      await expect(
        opened.source.getPage(reopenedTable.table.id, 0, 50, {
          filter: reopenedFilter!,
        })
      ).resolves.toMatchObject({ rows: [], total: 0 })
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
      expect(
        opened.initialSnapshot.tables.find(
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

  it("keeps choice metadata and confirmed lossy conversions on the Runtime path", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-lite-fields-"))
    const filePath = path.join(root, "fields.eidos")
    const opened = await createEidosLiteFileRuntime(filePath, "Fields")
    try {
      let snapshot = await opened.source.getSnapshot()
      const tableId = snapshot.tables[0]!.table.id
      snapshot = await opened.source.addField(tableId, {
        name: "Score",
        type: "text",
      })
      snapshot = await opened.source.addField(tableId, {
        name: "Tags",
        type: "text",
      })
      const score = snapshot.tables[0]!.fields.find(
        (field) => field.name === "Score"
      )!
      const tags = snapshot.tables[0]!.fields.find(
        (field) => field.name === "Tags"
      )!
      const inserted = await opened.source.insertRow(tableId, {
        [score.id!]: "4",
        [tags.id!]: "Alpha",
      })

      snapshot = await opened.source.updateField(tableId, score.id!, {
        type: "rating",
      })
      snapshot = await opened.source.updateField(tableId, tags.id!, {
        type: "multi-select",
      })

      expect(
        snapshot.tables[0]!.fields.find((field) => field.id === score.id)
      ).toMatchObject({
        type: "rating",
        property: { display: { kind: "rating" } },
      })
      expect(
        snapshot.tables[0]!.fields.find((field) => field.id === tags.id)
      ).toMatchObject({
        type: "multi-select",
        property: {
          options: [expect.objectContaining({ name: "Alpha" })],
        },
      })
      await expect(
        opened.source.getRow(tableId, String(inserted.row._id))
      ).resolves.toMatchObject({
        [score.id!]: "4",
        [tags.id!]: '["Alpha"]',
      })

      await opened.source.updateRow(tableId, String(inserted.row._id), {
        [tags.id!]: '["Alpha","Beta"]',
      })
      await expect(
        opened.source.updateField(tableId, tags.id!, { type: "select" })
      ).rejects.toThrow(/discard|explicit confirmation/i)

      snapshot = await opened.source.updateField(tableId, tags.id!, {
        type: "select",
        confirmLossy: true,
      })
      expect(
        snapshot.tables[0]!.fields.find((field) => field.id === tags.id)
          ?.property
      ).toMatchObject({
        options: [
          expect.objectContaining({ name: "Alpha" }),
          expect.objectContaining({ name: "Beta" }),
        ],
      })
      await expect(
        opened.source.getRow(tableId, String(inserted.row._id))
      ).resolves.toMatchObject({ [tags.id!]: "Alpha" })

      snapshot = await opened.source.addField(tableId, {
        name: "Fractional score",
        type: "number",
      })
      const fractionalScore = snapshot.tables[0]!.fields.find(
        (field) => field.name === "Fractional score"
      )!
      await opened.source.updateRow(tableId, String(inserted.row._id), {
        [fractionalScore.id!]: 2.5,
      })
      await expect(
        opened.source.updateField(tableId, fractionalScore.id!, {
          type: "rating",
        })
      ).rejects.toThrow(/explicit confirmation/i)
      snapshot = await opened.source.updateField(tableId, fractionalScore.id!, {
        type: "rating",
        confirmLossy: true,
      })
      expect(
        snapshot.tables[0]!.fields.find(
          (field) => field.id === fractionalScore.id
        )
      ).toMatchObject({
        type: "rating",
        property: { display: { kind: "rating" } },
      })
      await expect(
        opened.source.getRow(tableId, String(inserted.row._id))
      ).resolves.toMatchObject({ [fractionalScore.id!]: "2" })

      snapshot = await opened.source.addField(tableId, {
        name: "Out of range",
        type: "number",
      })
      const outOfRange = snapshot.tables[0]!.fields.find(
        (field) => field.name === "Out of range"
      )!
      await opened.source.updateRow(tableId, String(inserted.row._id), {
        [outOfRange.id!]: 6,
      })
      await expect(
        opened.source.updateField(tableId, outOfRange.id!, {
          type: "rating",
          confirmLossy: true,
        })
      ).rejects.toThrow(/between 0 and 5/i)

      snapshot = await opened.source.addField(tableId, {
        name: "Boolish",
        type: "text",
      })
      const boolish = snapshot.tables[0]!.fields.find(
        (field) => field.name === "Boolish"
      )!
      await opened.source.updateRow(tableId, String(inserted.row._id), {
        [boolish.id!]: "yes",
      })
      await expect(
        opened.source.updateField(tableId, boolish.id!, { type: "checkbox" })
      ).rejects.toThrow(/not “true” or “false”/i)
      await expect(
        opened.source.updateField(tableId, tags.id!, { type: "file" })
      ).rejects.toThrow(/create a new File field/i)
      snapshot = await opened.source.getSnapshot()
      expect(
        snapshot.tables[0]!.fields.find((field) => field.id === boolish.id)
          ?.type
      ).toBe("text")
      expect(
        snapshot.tables[0]!.fields.find((field) => field.id === tags.id)?.type
      ).toBe("select")
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

      const importedTable = imported.snapshot.tables.find(
        (table) => table.table.id === imported.result.table.id
      )!
      const category = importedTable.fields.find(
        (field) => field.name === "category"
      )!
      const converted = await opened.source.updateField(
        importedTable.table.id,
        category.id!,
        { type: "select" }
      )
      expect(
        converted.tables
          .find((table) => table.table.id === importedTable.table.id)!
          .fields.find((field) => field.id === category.id)
      ).toMatchObject({
        type: "select",
        property: {
          options: expect.arrayContaining([
            expect.objectContaining({ name: "Category 0" }),
            expect.objectContaining({ name: "Category 19" }),
          ]),
        },
      })
    } finally {
      await opened.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 15_000)

  it("streams a CSV larger than the legacy 16 MiB renderer limit", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-lite-csv-stream-"))
    const filePath = path.join(root, "stream-regression.eidos")
    const csvPath = path.join(root, "over-16-mib.csv")
    const opened = await createEidosLiteFileRuntime(filePath, "CSV stream")
    try {
      const payload = "x".repeat(900)
      const lines = ["name,note"]
      for (let index = 0; index < 20_000; index += 1) {
        lines.push(`Record ${index},${payload}`)
      }
      await writeFile(csvPath, lines.join("\n"))
      const csvStats = await stat(csvPath)
      expect(csvStats.size).toBeGreaterThan(16 * 1024 * 1024)
      const csvSource = {
        sourcePath: csvPath,
        fileName: path.basename(csvPath),
        size: csvStats.size,
        modifiedAtMs: csvStats.mtimeMs,
      }

      const plan = await opened.previewCsvFile(csvSource, {}, "stream-preview")
      expect(plan.rowCount).toBe(20_000)
      expect(opened.getCsvOperationProgress("stream-preview")).toMatchObject({
        kind: "plan",
        status: "completed",
        processedBytes: csvStats.size,
        processedRows: 20_000,
      })

      const importPromise = opened.importCsvFile(
        csvSource,
        {
          tableName: "Imported stream",
          columns: [
            { sourceIndex: 0, name: "Title" },
            { sourceIndex: 1, name: "Details", type: "text" },
          ],
        },
        "stream-import"
      )
      expect(opened.getCsvOperationProgress("stream-import")).toMatchObject({
        kind: "import",
        status: "running",
        phase: "importing",
        processedRows: 0,
        totalRows: 20_000,
      })
      const imported = await importPromise
      expect(imported.result.importedRowCount).toBe(20_000)
      expect(
        imported.snapshot.tables.find(
          (table) => table.table.id === imported.result.table.id
        )?.rowCount
      ).toBe(20_000)
      expect(imported.result.table.name).toBe("Imported stream")
      expect(
        imported.snapshot.tables
          .find((table) => table.table.id === imported.result.table.id)
          ?.fields.filter((field) => field.valueKind === "source")
          .map((field) => field.name)
      ).toEqual(["Title", "Details"])
      expect(opened.getCsvOperationProgress("stream-import")).toMatchObject({
        kind: "import",
        status: "completed",
        phase: "finalizing",
        processedBytes: csvStats.size,
        processedRows: 20_000,
        totalRows: 20_000,
      })

      const tableCountBeforeCancel = imported.snapshot.tables.length
      const cancelResult = opened
        .importCsvFile(csvSource, {}, "stream-cancel")
        .then(
          () => null,
          (error: unknown) => error
        )
      let canceled = false
      for (let attempt = 0; attempt < 1_000; attempt += 1) {
        const progress = opened.getCsvOperationProgress("stream-cancel")
        if (progress?.phase === "importing" && progress.processedRows > 0) {
          canceled = opened.cancelCsvOperation("stream-cancel")
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 5))
      }
      expect(canceled).toBe(true)
      await expect(cancelResult).resolves.toBeInstanceOf(Error)
      expect((await opened.source.getSnapshot()).tables.length).toBe(
        tableCountBeforeCancel
      )
    } finally {
      await opened.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 30_000)
})

describe.runIf(process.env.EIDOS_LITE_ACTUAL_CSV_PATH)(
  "Eidos Lite actual CSV import smoke",
  () => {
    it(
      "imports the complete selected CSV through the streaming path",
      async () => {
        const csvPath = process.env.EIDOS_LITE_ACTUAL_CSV_PATH!
        const root = await mkdtemp(
          path.join(tmpdir(), "eidos-lite-csv-actual-")
        )
        const filePath = path.join(root, "actual-import.eidos")
        const opened = await createEidosLiteFileRuntime(
          filePath,
          "Actual CSV import"
        )
        try {
          const csvStats = await stat(csvPath)
          const csvSource = {
            sourcePath: csvPath,
            fileName: path.basename(csvPath),
            size: csvStats.size,
            modifiedAtMs: csvStats.mtimeMs,
          }
          const previewStartedAt = performance.now()
          const plan = await opened.previewCsvFile(
            csvSource,
            {},
            "actual-preview"
          )
          console.info("actual CSV preview", {
            durationMs: Math.round(performance.now() - previewStartedAt),
            rowCount: plan.rowCount,
            skippedRowCount: plan.skippedRowCount,
            columns: plan.columns.length,
          })

          const importStartedAt = performance.now()
          const imported = await opened.importCsvFile(
            csvSource,
            {
              tableName: plan.tableName,
              columns: plan.columns.map((column) => ({
                sourceIndex: column.sourceIndex,
                name: column.name,
                ...(column.type === "record-label"
                  ? {}
                  : { type: column.type }),
              })),
            },
            "actual-import"
          )
          const targetStats = await stat(filePath)
          console.info("actual CSV import", {
            durationMs: Math.round(performance.now() - importStartedAt),
            importedRowCount: imported.result.importedRowCount,
            skippedRowCount: imported.result.skippedRowCount,
            targetBytes: targetStats.size,
          })

          expect(imported.result.importedRowCount).toBe(plan.rowCount)
          expect(
            imported.snapshot.tables.find(
              (table) => table.table.id === imported.result.table.id
            )?.rowCount
          ).toBe(plan.rowCount)
        } finally {
          await opened.close()
          await rm(root, { recursive: true, force: true })
        }
      },
      5 * 60_000
    )
  }
)

describe.runIf(process.env.EIDOS_LITE_ACTUAL_EIDOS_PATH)(
  "Eidos Lite actual large-file query smoke",
  () => {
    it(
      "opens and searches the selected Eidos File through the editor data source",
      async () => {
        const filePath = process.env.EIDOS_LITE_ACTUAL_EIDOS_PATH!
        const openStartedAt = performance.now()
        const opened = await openEidosLiteFileRuntime(filePath)
        try {
          const openDurationMs = performance.now() - openStartedAt
          const table = opened.initialSnapshot.tables.find(
            (candidate) => candidate.table.name === "1m-bandcamp-sales"
          )
          expect(table).toBeDefined()

          const searches = []
          for (const search of [
            "Neurogen",
            "United Kingdom",
            "no-such-bandcamp-record-xyz",
          ]) {
            const startedAt = performance.now()
            const page = await opened.source.getPage(table!.table.id, 0, 100, {
              search,
            })
            searches.push({
              search,
              durationMs: Math.round(performance.now() - startedAt),
              total: page.total,
              returned: page.rows.length,
            })
          }

          console.info("actual Eidos query", {
            openDurationMs: Math.round(openDurationMs),
            fileBytes: (await stat(filePath)).size,
            rows: table!.rowCount,
            searches,
          })
          expect(table!.rowCount).toBeGreaterThanOrEqual(1_000_000)
        } finally {
          await opened.close()
        }
      },
      2 * 60_000
    )
  }
)
