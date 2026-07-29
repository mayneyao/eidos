import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createEidosFile, openEidosFile } from "./better-sqlite3"
import {
  EIDOS_FILE_APPLICATION_ID,
  EIDOS_FILE_FIELDS_TABLE,
  EIDOS_FILE_FORMAT_VERSION,
  EIDOS_FILE_META_TABLE,
  EIDOS_FILE_SCHEMA_VERSION,
} from "./constants"
import { EidosFileError } from "./errors"

describe("Eidos File 1.0 native Runtime", () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  function filePath(name = "data.eidos") {
    const root = mkdtempSync(path.join(tmpdir(), "eidos-file-1.0-"))
    roots.push(root)
    return path.join(root, name)
  }

  it("creates the canonical Application File schema and UUIDv7 TEXT identity", () => {
    const runtime = createEidosFile(filePath(), {
      title: "Tasks",
      defaultTable: {
        name: "Tasks",
        fields: [{ name: "Name", type: "text" }],
      },
    })
    try {
      expect(
        runtime.connection.get<{ application_id: number }>(
          "PRAGMA application_id"
        )
      ).toEqual({ application_id: EIDOS_FILE_APPLICATION_ID })
      expect(
        runtime.connection.get<{ user_version: number }>("PRAGMA user_version")
      ).toEqual({ user_version: EIDOS_FILE_SCHEMA_VERSION })
      const metadata = runtime.metadata()
      expect(metadata).toMatchObject({
        format: "eidos-file",
        formatVersion: EIDOS_FILE_FORMAT_VERSION,
        revision: 1,
      })
      expect(metadata.fileId).toMatch(/^[0-9a-f-]{36}$/)
      const table = runtime.schema()[0]!
      expect(table.table.physicalName).toBe("Tasks")
      expect(
        table.fields.find((field) => field.name === "Name")?.physicalName
      ).toBe("Name")
      expect(table.fields.filter((field) => field.isRecordLabel)).toHaveLength(
        1
      )
      const orderedViewFieldNames = (viewId: string) => {
        const view = runtime
          .listViews(table.table.id)
          .find((candidate) => candidate.id === viewId)!
        const fieldNames = new Map(
          table.fields.map((field) => [field.id, field.name])
        )
        return Object.entries(view.orderMap ?? {})
          .sort((left, right) => left[1] - right[1])
          .map(([fieldId]) => fieldNames.get(fieldId))
      }
      const defaultView = runtime.listViews(table.table.id)[0]!
      expect(orderedViewFieldNames(defaultView.id)).toEqual([
        "Name",
        "_id",
        "_created_at",
        "_updated_at",
      ])
      const secondaryView = runtime.createView(table.table.id, {
        name: "Secondary",
        type: "grid",
      })
      expect(orderedViewFieldNames(secondaryView.id)).toEqual([
        "Name",
        "_id",
        "_created_at",
        "_updated_at",
      ])
      expect(
        runtime.connection
          .query<{ type: string }>(
            `SELECT typeof(id) AS type FROM ${EIDOS_FILE_FIELDS_TABLE}`
          )
          .every((row) => row.type === "text")
      ).toBe(true)
      expect(runtime.validate({ level: "full" })).toMatchObject({ valid: true })
    } finally {
      runtime.close()
    }
  })

  it("uses Field-ID logical rows and increments revision once per batch", () => {
    const runtime = createEidosFile(filePath(), {
      defaultTable: {
        name: "Tasks",
        fields: [
          { name: "Name", type: "text" },
          {
            name: "Status",
            type: "select",
            property: { options: [{ name: "Todo" }, { name: "Done" }] },
          },
        ],
      },
    })
    try {
      const schema = runtime.schema()[0]!
      const name = schema.fields.find((field) => field.name === "Name")!
      const status = schema.fields.find((field) => field.name === "Status")!
      const revision = runtime.metadata().revision!
      const result = runtime.mutateRows({
        tableId: schema.table.id,
        expectedRevision: revision,
        insert: [
          { fields: { [name.id]: "One", [status.id]: "Todo" } },
          { fields: { [name.id]: "Two", [status.id]: "Done" } },
        ],
      })
      expect(BigInt(result.revision)).toBe(BigInt(revision) + 1n)
      expect(result.rows.map((row) => row.fields[name.id])).toEqual([
        "One",
        "Two",
      ])
      expect(runtime.queryRows(schema.table.id).rows).toHaveLength(2)
      expect(() =>
        runtime.mutateRows({
          tableId: schema.table.id,
          expectedRevision: revision,
          delete: [result.rows[0]!.id],
        })
      ).toThrow(/Expected revision/)
    } finally {
      runtime.close()
    }
  })

  it("uses identical UUIDv7 TEXT for metadata, rows, Relations, and joins", () => {
    const runtime = createEidosFile(filePath(), {
      defaultTable: {
        name: "Teams",
        fields: [{ name: "Name", type: "text" }],
      },
    })
    try {
      const teams = runtime.schema()[0]!
      const team = runtime.insertRow(teams.table.id, { Name: "Runtime" })
      const teamId = String(team._id)
      const projects = runtime.createTable({
        name: "Projects",
        fields: [
          { name: "Name", type: "text", isRecordLabel: true },
          {
            name: "Team",
            type: "relation",
            property: {
              targetTableId: teams.table.id,
              direction: "forward",
              cardinality: "one",
              onDelete: "restrict",
            },
          },
        ],
      })
      runtime.insertRow(projects.id, {
        Name: "Editor",
        Team: JSON.stringify([teamId]),
      })

      expect(
        runtime.connection.get<{
          fileType: string
          fileLength: number
        }>(
          `SELECT typeof(file_id) AS fileType, length(file_id) AS fileLength
             FROM ${EIDOS_FILE_META_TABLE}`
        )
      ).toEqual({ fileType: "text", fileLength: 36 })
      expect(
        runtime.connection.get<{
          rowType: string
          rowId: string
          relationId: string
        }>(
          `SELECT typeof(project."_id") AS rowType,
                  project."_id" AS rowId,
                  json_extract(project."Team", '$[0]') AS relationId
             FROM "Projects" project`
        )
      ).toMatchObject({ rowType: "text", relationId: teamId })
      expect(
        runtime.connection.get<{ count: number }>(
          `SELECT count(*) AS count
             FROM "Projects" project,
                  json_each(project."Team") item
             JOIN "Teams" team ON item.value = team."_id"`
        )
      ).toEqual({ count: 1 })

      const relation = runtime
        .listFields(projects.id)
        .find((field) => field.name === "Team")!
      const trigger = runtime.connection.get<{ sql: string }>(
        `SELECT sql FROM sqlite_schema WHERE name = ?`,
        [`eidos__relation_restrict__${relation.id!.replace(/-/g, "")}`]
      )?.sql
      expect(trigger).toContain('item.value = OLD."_id"')
      expect(trigger).not.toMatch(/hex\s*\(/i)
    } finally {
      runtime.close()
    }
  })

  it("rejects non-canonical UUID text at the canonical DDL boundary", () => {
    const runtime = createEidosFile(filePath())
    try {
      expect(() =>
        runtime.connection.run(
          `UPDATE ${EIDOS_FILE_META_TABLE} SET file_id = upper(file_id)`
        )
      ).toThrow(/CHECK constraint failed/)
      expect(runtime.validate({ level: "identity" })).toMatchObject({
        valid: true,
        errors: [],
      })
    } finally {
      runtime.close()
    }
  })

  it("uses SQLite ASCII-case identifier semantics and maps reserved prefixes", () => {
    const runtime = createEidosFile(filePath(), {
      defaultTable: {
        name: "Tasks",
        fields: [{ name: "Name", type: "text" }],
      },
    })
    try {
      const lowerCaseVariant = runtime.createTable({
        name: "tasks",
        fields: [{ name: "Name", type: "text" }],
      })
      expect(lowerCaseVariant.physicalName).toMatch(/^tasks__[0-9a-f]{8}$/)
      expect(runtime.schema()).toHaveLength(2)

      for (const name of [
        "sqlite_Foo",
        "SQLITE_Foo",
        "eidos__Tasks",
        "EIDOS__Tasks",
        "x__vendor__Tasks",
        "X__vendor__Tasks",
      ]) {
        const table = runtime.createTable({
          name,
          fields: [{ name: "Name", type: "text" }],
        })
        expect(table.physicalName).toMatch(
          /^t__[0-9a-f]{8}(?:[0-9a-f]{4}|[0-9a-f]{24})?__/
        )
      }
      expect(runtime.schema()).toHaveLength(8)
    } finally {
      runtime.close()
    }
  })

  it("evaluates every canonical statistic over the filtered logical source", () => {
    const runtime = createEidosFile(filePath(), {
      defaultTable: {
        name: "Teams",
        fields: [{ name: "Name", type: "text" }],
      },
    })
    try {
      const teams = runtime.schema()[0]!
      const teamId = String(
        runtime.insertRow(teams.table.id, { Name: "A" })._id
      )
      const projects = runtime.createTable({
        name: "Projects",
        fields: [
          { name: "Name", type: "text", isRecordLabel: true },
          { name: "Score", type: "number" },
          { name: "Done", type: "checkbox" },
          { name: "Tags", type: "multi-select" },
          {
            name: "Team",
            type: "relation",
            property: {
              targetTableId: teams.table.id,
              direction: "forward",
              cardinality: "many",
              onDelete: "preserve",
            },
          },
        ],
      })
      runtime.insertImportedRows(projects.id, [
        {
          Name: "One",
          Score: 10,
          Done: 1,
          Tags: '["a","b"]',
          Team: JSON.stringify([teamId]),
        },
        {
          Name: "Two",
          Score: 20,
          Done: 0,
          Tags: '["b"]',
          Team: JSON.stringify([teamId]),
        },
        {
          Name: "Three",
          Score: null,
          Done: null,
          Tags: "[]",
          Team: "[]",
        },
      ])
      const fields = runtime.listFields(projects.id)
      const score = fields.find((field) => field.name === "Score")!
      const done = fields.find((field) => field.name === "Done")!
      const tags = fields.find((field) => field.name === "Tags")!
      const team = fields.find((field) => field.name === "Team")!
      const results = runtime.aggregate(projects.id, [
        { fieldId: score.id!, type: "count-all" },
        { fieldId: score.id!, type: "count-non-null" },
        { fieldId: score.id!, type: "count-empty" },
        { fieldId: score.id!, type: "count-distinct" },
        { fieldId: score.id!, type: "sum" },
        { fieldId: score.id!, type: "average" },
        { fieldId: score.id!, type: "min" },
        { fieldId: score.id!, type: "max" },
        { fieldId: done.id!, type: "percent-checked" },
        { fieldId: done.id!, type: "percent-unchecked" },
        { fieldId: tags.id!, type: "count-distinct" },
        { fieldId: team.id!, type: "relation-value-count" },
        { fieldId: team.id!, type: "relation-row-count" },
        { fieldId: team.id!, type: "relation-distinct-target-count" },
      ])
      const values = Object.fromEntries(
        results.map((result) => [
          `${result.fieldId}:${result.type}`,
          result.value,
        ])
      )

      expect(values).toMatchObject({
        [`${score.id}:count-all`]: 3,
        [`${score.id}:count-non-null`]: 2,
        [`${score.id}:count-empty`]: 1,
        [`${score.id}:count-distinct`]: 2,
        [`${score.id}:sum`]: 30,
        [`${score.id}:average`]: 15,
        [`${score.id}:min`]: 10,
        [`${score.id}:max`]: 20,
        [`${done.id}:percent-checked`]: 33.33,
        [`${done.id}:percent-unchecked`]: 66.67,
        [`${tags.id}:count-distinct`]: 2,
        [`${team.id}:relation-value-count`]: 2,
        [`${team.id}:relation-row-count`]: 2,
        [`${team.id}:relation-distinct-target-count`]: 1,
      })
    } finally {
      runtime.close()
    }
  })

  it("streams imported rows without per-row readback or revision churn", () => {
    const runtime = createEidosFile(filePath(), { title: "Streaming import" })
    try {
      const revisionBefore = Number(runtime.info().revision)
      const getRow = vi.spyOn(runtime, "getRow")
      const getTable = vi.spyOn(runtime, "getTable")
      const listFields = vi.spyOn(runtime, "listFields")
      let tableId = ""
      runtime.connection.transaction(() => {
        const table = runtime.createTable({
          name: "Imported",
          fields: [
            { name: "Name", type: "text", isRecordLabel: true },
            { name: "Value", type: "number" },
          ],
        })
        tableId = table.id
        runtime.appendImportedRows(
          table.id,
          Array.from({ length: 1_200 }, (_, index) => ({
            Name: `Row ${index + 1}`,
            Value: index + 1,
          }))
        )
      })

      expect(getRow).not.toHaveBeenCalled()
      expect(getTable).toHaveBeenCalledTimes(1)
      expect(listFields).toHaveBeenCalledTimes(1)
      expect(runtime.listRows(tableId, { limit: 1_200 })).toHaveLength(1_200)
      expect(Number(runtime.info().revision)).toBe(revisionBefore + 1)
      expect(runtime.inspect()).toMatchObject({ valid: true, errors: [] })
    } finally {
      runtime.close()
    }
  })

  it("stores dates and instants as canonical TEXT with bytewise ordering", () => {
    const runtime = createEidosFile(filePath(), {
      createdAt: "2026-07-20T18:00:00+08:00",
      defaultTable: {
        name: "Events",
        fields: [
          { name: "Name", type: "text" },
          { name: "Day", type: "date" },
          { name: "Starts", type: "datetime" },
          {
            name: "One hour later",
            type: "formula",
            property: {
              formula: `DATETIME_ADD_MILLISECONDS("Starts", 3600000)`,
              displayType: "datetime",
            },
          },
        ],
      },
    })
    try {
      expect(runtime.metadata()).toMatchObject({
        createdAt: "2026-07-20T10:00:00.000Z",
      })
      const schema = runtime.schema()[0]!
      const name = schema.fields.find((field) => field.name === "Name")!
      const day = schema.fields.find((field) => field.name === "Day")!
      const starts = schema.fields.find((field) => field.name === "Starts")!
      const oneHourLater = schema.fields.find(
        (field) => field.name === "One hour later"
      )!
      runtime.mutateRows({
        tableId: schema.table.id,
        insert: [
          {
            fields: {
              [name.id]: "Later",
              [day.id]: "2026-07-21",
              [starts.id]: "2026-07-21T18:00:00+08:00",
            },
          },
          {
            fields: {
              [name.id]: "Earlier",
              [day.id]: "2026-07-20",
              [starts.id]: "2026-07-20T18:00:00+08:00",
            },
          },
        ],
      })

      const rows = runtime.listRows(schema.table.id, {
        query: { sorts: [{ field: starts.id, direction: "asc" }] },
      })
      expect(rows.map((row) => row[name.tableColumnName])).toEqual([
        "Earlier",
        "Later",
      ])
      expect(rows[0]).toMatchObject({
        [day.tableColumnName]: "2026-07-20",
        [starts.tableColumnName]: "2026-07-20T10:00:00.000Z",
        [oneHourLater.tableColumnName]: "2026-07-20T11:00:00.000Z",
      })
      expect(
        runtime.connection.get<{ day: string; starts: string }>(
          `SELECT typeof(${JSON.stringify(day.physicalName)}) AS day,
                  typeof(${JSON.stringify(starts.physicalName)}) AS starts
             FROM ${JSON.stringify(schema.table.physicalName)} LIMIT 1`
        )
      ).toEqual({ day: "text", starts: "text" })
      expect(() =>
        runtime.insertRow(schema.table.id, {
          [name.tableColumnName]: "Too precise",
          [starts.tableColumnName]: "2026-07-20T10:00:00.0001Z",
        })
      ).toThrow(/sub-millisecond/)
      expect(() =>
        runtime.connection.run(
          `UPDATE ${JSON.stringify(schema.table.physicalName)}
              SET ${JSON.stringify(day.physicalName)} = ?`,
          ["2026-02-30"]
        )
      ).toThrow()
    } finally {
      runtime.close()
    }
  })

  it("rewrites quoted Formula references atomically on Field rename", () => {
    const runtime = createEidosFile(filePath(), {
      defaultTable: {
        name: "Orders",
        fields: [
          { name: "Name", type: "text" },
          { name: "Unit price", type: "text" },
          {
            name: "Total",
            type: "formula",
            property: {
              formula: "CONCAT(\"Unit price\", 'Unit price')",
              displayType: "text",
            },
          },
        ],
      },
    })
    try {
      const table = runtime.schema()[0]!
      const price = table.fields.find((field) => field.name === "Unit price")!
      runtime.updateField(table.table.id, price.id, { name: "Price" })
      expect(
        runtime
          .listFields(table.table.id)
          .find((field) => field.name === "Total")?.property
      ).toMatchObject({
        formula: "CONCAT(\"Price\", 'Unit price')",
      })
      expect(runtime.validate({ level: "semantic" }).valid).toBe(true)
    } finally {
      runtime.close()
    }
  })

  it("rejects NOCASE Field-name conflicts and unsupported draft schemas", () => {
    const target = filePath()
    const runtime = createEidosFile(target, {
      defaultTable: {
        name: "Tasks",
        fields: [{ name: "Status", type: "text" }],
      },
    })
    const tableId = runtime.listTables()[0]!.id
    expect(() =>
      runtime.addField(tableId, {
        name: "status",
        type: "text",
      })
    ).toThrow(EidosFileError)
    runtime.connection.exec("PRAGMA user_version = 2")
    runtime.close()
    expect(() => openEidosFile(target)).toThrow(
      /Unsupported Eidos File schema revision/
    )
  })
})
