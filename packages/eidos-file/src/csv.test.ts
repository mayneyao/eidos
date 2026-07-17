import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { createEidosFile } from "./better-sqlite3"
import { EidosFileError } from "./errors"
import {
  eidosFileCsvExportHeader,
  createEidosFileCsvRowEncoder,
  importEidosFileCsv,
  parseEidosFileCsvRows,
  planEidosFileCsvImport,
} from "./csv"

describe("Eidos File CSV import", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "eidos-file-csv-"))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("plans fields, types, quoted rows, and stable unique names", () => {
    const file = {
      name: "inventory.csv",
      content:
        '\ufeffName,Count,Active,Published,Website,Name,\n"Portable, stand",3,true,2026-07-12,https://eidos.space,Office,"two\nlines"',
    }
    const plan = planEidosFileCsvImport(file)

    expect(plan).toMatchObject({
      tableName: "inventory",
      rowCount: 1,
      skippedRowCount: 0,
      columns: [
        { name: "Name", columnName: "title", type: "title" },
        { name: "Count", columnName: "count", type: "number" },
        { name: "Active", columnName: "active", type: "checkbox" },
        { name: "Published", columnName: "published", type: "date" },
        { name: "Website", columnName: "website", type: "url" },
        { name: "Name 2", columnName: "name_2", type: "text" },
        { name: "Column 7", columnName: "column_7", type: "text" },
      ],
    })
    expect(plan.sampleRows[0][0]).toBe("Portable, stand")
    expect(plan.sampleRows[0][6]).toBe("two\nlines")
  })

  it("reports and skips records with the wrong number of columns", () => {
    const plan = planEidosFileCsvImport({
      name: "people.csv",
      content: "Name,Age\nAda,37\nGrace\nLinus,55,extra\n",
    })

    expect(plan.rowCount).toBe(1)
    expect(plan.skippedRowCount).toBe(2)
    expect(plan.issues).toEqual([
      expect.objectContaining({
        code: "inconsistent-column-count",
        count: 2,
      }),
    ])
  })

  it("rejects empty and structurally invalid files with Eidos File errors", () => {
    expect(() =>
      planEidosFileCsvImport({ name: "empty.csv", content: "  " })
    ).toThrowError(expect.objectContaining({ code: "invalid-csv" }))
    expect(() =>
      planEidosFileCsvImport({ name: "bad.csv", content: '"Name,Age\nAda,37' })
    ).toThrowError(expect.objectContaining({ code: "invalid-csv" }))
  })

  it("applies explicit field mapping without silently coercing bad values", () => {
    const file = { name: "people.csv", content: "Name,Score\nAda,n/a" }
    expect(() =>
      planEidosFileCsvImport(file, {
        tableName: "People",
        columns: [{ sourceIndex: 1, name: "Points", type: "number" }],
      })
    ).toThrowError(
      expect.objectContaining({
        code: "invalid-csv",
        message: "CSV row 2, field “Points” is not a number",
      })
    )
  })

  it("creates a table and imports typed rows in one runtime operation", () => {
    const eidosFile = createEidosFile(path.join(root, "main.eidos"), {
      title: "CSV target",
    })
    const result = importEidosFileCsv(eidosFile, {
      name: "inventory.csv",
      content: "Item,Quantity,Available\nPortable stand,3,true\nDesk,1,false",
    })

    expect(result).toMatchObject({ importedRowCount: 2, skippedRowCount: 0 })
    expect(eidosFile.getTable(result.table.id).name).toBe("inventory")
    expect(eidosFile.listFields(result.table.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Item",
          tableColumnName: "title",
          type: "title",
        }),
        expect.objectContaining({
          name: "Quantity",
          tableColumnName: "quantity",
          type: "number",
        }),
        expect.objectContaining({
          name: "Available",
          tableColumnName: "available",
          type: "checkbox",
        }),
      ])
    )
    expect(eidosFile.listRows(result.table.id)).toEqual([
      expect.objectContaining({
        title: "Portable stand",
        quantity: 3,
        available: 1,
      }),
      expect.objectContaining({ title: "Desk", quantity: 1, available: 0 }),
    ])
    eidosFile.close()
  })

  it("rolls back the new table when batched row insertion fails", () => {
    const eidosFile = createEidosFile(path.join(root, "main.eidos"), {
      title: "CSV target",
    })
    const connection = eidosFile.connection
    const originalRunMany = connection.runMany
    connection.runMany = () => {
      throw new EidosFileError("invalid-csv", "simulated write failure")
    }

    expect(() =>
      importEidosFileCsv(eidosFile, {
        name: "people.csv",
        content: "Name\nAda",
      })
    ).toThrow("simulated write failure")
    expect(eidosFile.listTables()).toEqual([])

    connection.runMany = originalRunMany
    eidosFile.close()
  })

  it("serializes visible field names and displayed values as RFC 4180 rows", () => {
    const fields = [
      {
        name: "Task",
        type: "title" as const,
        tableName: "tasks",
        tableColumnName: "title",
        property: null,
        storageCodec: "scalar" as const,
        valueKind: "source" as const,
        isHidden: false,
        isDerived: false,
        sourceTableColumnName: null,
        dependsOn: null,
      },
      {
        name: "Done",
        type: "checkbox" as const,
        tableName: "tasks",
        tableColumnName: "done",
        property: null,
        storageCodec: "scalar" as const,
        valueKind: "source" as const,
        isHidden: false,
        isDerived: false,
        sourceTableColumnName: null,
        dependsOn: null,
      },
      {
        name: "Owners",
        type: "link" as const,
        tableName: "tasks",
        tableColumnName: "owners",
        property: null,
        storageCodec: "relation" as const,
        valueKind: "relation" as const,
        isHidden: false,
        isDerived: false,
        sourceTableColumnName: null,
        dependsOn: null,
      },
    ]
    const columns = [
      { columnName: "title", name: "Task name" },
      { columnName: "done", name: "Done" },
      { columnName: "owners", name: "Owners" },
    ]

    expect(eidosFileCsvExportHeader(columns)).toBe("Task name,Done,Owners\r\n")
    const encodeRow = createEidosFileCsvRowEncoder(fields, columns)
    expect(
      encodeRow({
        title: 'Review "Q3", plan',
        done: 1,
        owners: '["ada","grace"]',
        owners__display:
          '[{"id":"ada","title":"Ada"},{"id":"grace","title":"Grace"}]',
      })
    ).toBe('"Review ""Q3"", plan",true,"Ada, Grace"\r\n')
  })
})
