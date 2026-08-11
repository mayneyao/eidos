import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { createEidosFile } from "./better-sqlite3"
import { EidosFileError } from "./errors"
import {
  eidosFileCsvExportHeader,
  eidosFileCsvRowToEidosFileRow,
  encodeEidosFileCsvRecord,
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
        { name: "Name", columnName: "Name", type: "record-label" },
        { name: "Count", columnName: "Count", type: "number" },
        { name: "Active", columnName: "Active", type: "checkbox" },
        { name: "Published", columnName: "Published", type: "date" },
        { name: "Website", columnName: "Website", type: "url" },
        { name: "Name 2", columnName: "Name 2", type: "text" },
        { name: "Column 7", columnName: "Column 7", type: "text" },
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

  it("keeps dates as text and normalizes datetime offsets to UTC", () => {
    const plan = planEidosFileCsvImport({
      name: "events.csv",
      content: "Name,Day,Starts\nLaunch,2026-07-20,2026-07-20T18:00:00+08:00",
    })

    expect(plan.columns.map((column) => column.type)).toEqual([
      "record-label",
      "date",
      "datetime",
    ])
    expect(
      eidosFileCsvRowToEidosFileRow(
        ["Launch", "2026-07-20", "2026-07-20T18:00:00+08:00"],
        2,
        plan
      )
    ).toMatchObject({
      Day: "2026-07-20",
      Starts: "2026-07-20T10:00:00.000Z",
    })
    expect(() =>
      eidosFileCsvRowToEidosFileRow(
        ["Launch", "2026-07-20", "2026-07-20T10:00:00.0001Z"],
        2,
        plan
      )
    ).toThrow(/RFC 3339 timestamp/)
  })

  it("marks HTTPS image URL columns for lazy image presentation", () => {
    const plan = planEidosFileCsvImport({
      name: "people.csv",
      content:
        "Name,Avatar,Asset,Website\nAda,https://cdn.example.com/ada?id=1,https://cdn.example.com/cover.png,https://eidos.space\nGrace,https://cdn.example.com/grace?id=2,https://cdn.example.com/photo.webp,https://example.com",
    })

    expect(plan.columns[1]).toMatchObject({
      name: "Avatar",
      type: "url",
      settings: { display: { kind: "image" } },
    })
    expect(plan.columns[2]).toMatchObject({
      name: "Asset",
      type: "url",
      settings: { display: { kind: "image" } },
    })
    expect(plan.columns[3]).toMatchObject({ name: "Website", type: "url" })
    expect(plan.columns[3]?.settings).toBeUndefined()
  })

  it("does not opt HTTP or credential-bearing URL columns into image loading", () => {
    const plan = planEidosFileCsvImport({
      name: "unsafe.csv",
      content:
        "Name,Image,Photo\nOne,http://cdn.example.com/one.png,https://user@example.com/one.png",
    })

    expect(plan.columns.slice(1)).toEqual([
      expect.objectContaining({ name: "Image", type: "url" }),
      expect.objectContaining({ name: "Photo", type: "url" }),
    ])
    expect(plan.columns[1]?.settings).toBeUndefined()
    expect(plan.columns[2]?.settings).toBeUndefined()
  })

  it("imports the first record when the Runtime CSV request has no header", () => {
    const plan = planEidosFileCsvImport({
      name: "scores.csv",
      content: "Name,Score\nAda,1",
    })

    expect(
      parseEidosFileCsvRows(
        { name: "scores.csv", content: "Grace,2\nLinus,3" },
        plan,
        { hasHeader: false }
      )
    ).toEqual([
      expect.objectContaining({ Name: "Grace", Score: 2 }),
      expect.objectContaining({ Name: "Linus", Score: 3 }),
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
          tableColumnName: "Item",
          type: "text",
          isRecordLabel: true,
        }),
        expect.objectContaining({
          name: "Quantity",
          tableColumnName: "Quantity",
          type: "number",
        }),
        expect.objectContaining({
          name: "Available",
          tableColumnName: "Available",
          type: "checkbox",
        }),
      ])
    )
    expect(eidosFile.listRows(result.table.id)).toEqual([
      expect.objectContaining({
        Item: "Portable stand",
        Quantity: 3,
        Available: 1,
      }),
      expect.objectContaining({ Item: "Desk", Quantity: 1, Available: 0 }),
    ])
    eidosFile.close()
  })

  it("persists inferred URL image presentation without downloading the URLs", () => {
    const eidosFile = createEidosFile(path.join(root, "images.eidos"), {
      title: "Image URLs",
    })
    const result = importEidosFileCsv(eidosFile, {
      name: "people.csv",
      content: "Name,Avatar\nAda,https://cdn.example.com/ada.png",
    })

    expect(
      eidosFile
        .listFields(result.table.id)
        .find((candidate) => candidate.name === "Avatar")
    ).toMatchObject({
      type: "url",
      property: { display: { kind: "image" } },
    })
    eidosFile.close()
  })

  it("rolls back the new table when batched row insertion fails", () => {
    const eidosFile = createEidosFile(path.join(root, "main.eidos"), {
      title: "CSV target",
    })
    const connection = eidosFile.connection
    const originalRun = connection.run
    const originalRunMany = connection.runMany
    connection.run = (sql, params) => {
      if (/^INSERT INTO "people"/u.test(sql.trim())) {
        throw new EidosFileError("invalid-csv", "simulated write failure")
      }
      return originalRun.call(connection, sql, params)
    }
    connection.runMany = (sql, parameterSets) => {
      if (/^INSERT INTO "people"/u.test(sql.trim())) {
        throw new EidosFileError("invalid-csv", "simulated write failure")
      }
      return originalRunMany!.call(connection, sql, parameterSets)
    }

    expect(() =>
      importEidosFileCsv(eidosFile, {
        name: "people.csv",
        content: "Name\nAda",
      })
    ).toThrow("simulated write failure")
    expect(eidosFile.listTables()).toEqual([])

    connection.run = originalRun
    connection.runMany = originalRunMany
    eidosFile.close()
  })

  it("rolls back a real SQLite disk-full import and remains editable", () => {
    const eidosFile = createEidosFile(path.join(root, "disk-full.eidos"), {
      title: "Disk-full target",
    })
    const connection = eidosFile.connection
    const originalRevision = eidosFile.metadata().revision
    const pageCount = connection.get<{ page_count: number }>(
      "PRAGMA page_count"
    )!.page_count
    connection.exec(`PRAGMA max_page_count = ${pageCount}`)

    try {
      const largeCsv = [
        "Name",
        ...Array.from(
          { length: 512 },
          (_, index) => `${index}-${"x".repeat(8_192)}`
        ),
      ].join("\n")
      let failure: unknown
      try {
        importEidosFileCsv(eidosFile, {
          name: "disk-full.csv",
          content: largeCsv,
        })
      } catch (error) {
        failure = error
      }

      expect(failure).toMatchObject({ code: "SQLITE_FULL" })
      expect(eidosFile.listTables()).toEqual([])
      expect(eidosFile.metadata().revision).toBe(originalRevision)
      expect(eidosFile.validate({ level: "full" })).toMatchObject({
        valid: true,
      })

      connection.exec("PRAGMA max_page_count = 2147483646")
      const imported = importEidosFileCsv(eidosFile, {
        name: "recovered.csv",
        content: "Name\nRecovered",
      })
      expect(imported.importedRowCount).toBe(1)
      expect(eidosFile.listRows(imported.table.id)).toEqual([
        expect.objectContaining({ Name: "Recovered" }),
      ])
    } finally {
      connection.exec("PRAGMA max_page_count = 2147483646")
      eidosFile.close()
    }
  })

  it("serializes visible field names and displayed values as RFC 4180 rows", () => {
    const fields = [
      {
        id: "0198c72d-82b5-7000-8000-000000000001",
        tableId: "0198c72d-82b5-7000-8000-000000000010",
        name: "Task",
        type: "text" as const,
        tableName: "tasks",
        tableColumnName: "title",
        physicalName: "title",
        position: 0,
        settings: {},
        property: null,
        storageCodec: "scalar" as const,
        valueKind: "source" as const,
        isRecordLabel: true,
        isHidden: false,
        isDerived: false,
        sourceTableColumnName: null,
        dependsOn: null,
      },
      {
        id: "0198c72d-82b5-7000-8000-000000000002",
        tableId: "0198c72d-82b5-7000-8000-000000000010",
        name: "Done",
        type: "checkbox" as const,
        tableName: "tasks",
        tableColumnName: "done",
        physicalName: "done",
        isRecordLabel: false,
        position: 1,
        settings: {},
        property: null,
        storageCodec: "scalar" as const,
        valueKind: "source" as const,
        isHidden: false,
        isDerived: false,
        sourceTableColumnName: null,
        dependsOn: null,
      },
      {
        id: "0198c72d-82b5-7000-8000-000000000003",
        tableId: "0198c72d-82b5-7000-8000-000000000010",
        name: "Owners",
        type: "relation" as const,
        tableName: "tasks",
        tableColumnName: "owners",
        physicalName: "owners",
        isRecordLabel: false,
        position: 2,
        settings: {},
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
    const adaId = "0198c72d-82b5-7968-b163-98be4b7477df"
    const graceId = "0198c72d-82b5-7969-8163-98be4b7477df"
    expect(
      encodeRow({
        title: 'Review "Q3", plan',
        done: 1,
        owners: JSON.stringify([adaId, graceId]),
        owners__display: JSON.stringify([
          { id: adaId, title: "Ada" },
          { id: graceId, title: "Grace" },
        ]),
      })
    ).toBe(
      encodeEidosFileCsvRecord([
        'Review "Q3", plan',
        "true",
        JSON.stringify([adaId, graceId]),
      ])
    )
  })
})
