import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { createBaseFile } from "./better-sqlite3"
import { BaseError } from "./errors"
import { importBaseCsv, parseBaseCsvRows, planBaseCsvImport } from "./csv"

describe("Base CSV import", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "eidos-base-csv-"))
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
    const plan = planBaseCsvImport(file)

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
    const plan = planBaseCsvImport({
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

  it("rejects empty and structurally invalid files with Base errors", () => {
    expect(() =>
      planBaseCsvImport({ name: "empty.csv", content: "  " })
    ).toThrowError(expect.objectContaining({ code: "invalid-csv" }))
    expect(() =>
      planBaseCsvImport({ name: "bad.csv", content: '"Name,Age\nAda,37' })
    ).toThrowError(expect.objectContaining({ code: "invalid-csv" }))
  })

  it("applies explicit field mapping without silently coercing bad values", () => {
    const file = { name: "people.csv", content: "Name,Score\nAda,n/a" }
    expect(() =>
      planBaseCsvImport(file, {
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
    const base = createBaseFile(path.join(root, "main.base"), {
      title: "CSV target",
    })
    const result = importBaseCsv(base, {
      name: "inventory.csv",
      content: "Item,Quantity,Available\nPortable stand,3,true\nDesk,1,false",
    })

    expect(result).toMatchObject({ importedRowCount: 2, skippedRowCount: 0 })
    expect(base.getTable(result.table.id).name).toBe("inventory")
    expect(base.listFields(result.table.id)).toEqual(
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
    expect(base.listRows(result.table.id)).toEqual([
      expect.objectContaining({
        title: "Portable stand",
        quantity: 3,
        available: 1,
      }),
      expect.objectContaining({ title: "Desk", quantity: 1, available: 0 }),
    ])
    base.close()
  })

  it("rolls back the new table when batched row insertion fails", () => {
    const base = createBaseFile(path.join(root, "main.base"), {
      title: "CSV target",
    })
    const connection = base.connection
    const originalRunMany = connection.runMany
    connection.runMany = () => {
      throw new BaseError("invalid-csv", "simulated write failure")
    }

    expect(() =>
      importBaseCsv(base, { name: "people.csv", content: "Name\nAda" })
    ).toThrow("simulated write failure")
    expect(base.listTables()).toEqual([])

    connection.runMany = originalRunMany
    base.close()
  })
})
