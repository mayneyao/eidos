import { describe, expect, it } from "vitest"

import type { SpaceVersionDiff } from "../../shared/contracts"
import {
  normalizeEidosTableDiff,
  type EidosPhysicalSchema,
} from "./eidos-schema-diff"

const path = "dev/eidos-project.eidos"

function versionDiff(
  table: SpaceVersionDiff["files"][number]["tables"][number]
): SpaceVersionDiff {
  return {
    currentHead: "a".repeat(64),
    currentBranch: "main",
    from: "index",
    to: null,
    paths: [{ path, change: "modified" }],
    files: [
      {
        path,
        change: "modified",
        rowDiffAvailable: true,
        limitations: [],
        tables: [table],
      },
    ],
  }
}

describe("normalizeEidosTableDiff", () => {
  it.each([true, false])(
    "aligns a rebuilt table by snapshot column order with metadata table present: %s",
    (metadataPresent) => {
      const columns = ["_id", "链接", "摘要", "Name"]
      const schema: EidosPhysicalSchema = {
        tables: [{ id: "table-1", physicalName: "links" }],
        fields: columns.map((physicalName, position) => ({
          id: physicalName,
          tableId: "table-1",
          physicalName,
          position,
        })),
      }
      const diff = versionDiff({
        name: "links",
        columns,
        primaryKeyColumns: ["_id"],
        changes: [
          {
            op: "update",
            key: { _id: "1" },
            oldValues: ["1", "Title", "https://example.com", "Summary"],
            values: ["1", "https://example.com", "Summary edited", "Title"],
          },
          {
            op: "delete",
            key: { _id: "2" },
            values: [
              "2",
              "Deleted title",
              "https://deleted.example",
              "Deleted summary",
            ],
          },
          {
            op: "insert",
            key: { _id: "3" },
            values: [
              "3",
              "https://added.example",
              "Added summary",
              "Added title",
            ],
          },
        ],
      })
      diff.files[0]!.schemaChanges = [
        {
          name: "links",
          entryType: "table",
          operation: "modified",
          oldSql:
            'CREATE TABLE links (_id TEXT PRIMARY KEY, Name TEXT, "链接" TEXT, "摘要" TEXT)',
          sql: 'CREATE TABLE links (_id TEXT PRIMARY KEY, "链接" TEXT, "摘要" TEXT, Name TEXT)',
        },
      ]
      const fieldsDiff = versionDiff({
        name: "eidos__fields",
        columns: [],
        primaryKeyColumns: ["id"],
        changes: [],
      })
      if (!metadataPresent) fieldsDiff.files[0]!.tables = []
      const table = normalizeEidosTableDiff(diff, fieldsDiff, schema, "links")
        .files[0]!.tables[0]!
      expect(table.columns).toEqual(columns)
      expect(table.changes[0]!.oldValues).toEqual([
        "1",
        "https://example.com",
        "Summary",
        "Title",
      ])
      expect(table.changes[0]!.values).toEqual(
        diff.files[0]!.tables[0]!.changes[0]!.values
      )
      expect(table.changes[1]!.values).toEqual([
        "2",
        "https://deleted.example",
        "Deleted summary",
        "Deleted title",
      ])
      expect(table.changes[2]!.values).toEqual(
        diff.files[0]!.tables[0]!.changes[2]!.values
      )
      expect(table.columnChanges).toEqual([null, null, null, null])
    }
  )

  it.each([true, false])(
    "keeps stable field identities across a delete and insert with snapshot schema: %s",
    (withSnapshotSchema) => {
      const schema: EidosPhysicalSchema = {
        tables: [{ id: "table-ux", physicalName: "ux" }],
        fields: [
          {
            id: "field-id",
            tableId: "table-ux",
            physicalName: "_id",
            position: -3,
          },
          {
            id: "field-created",
            tableId: "table-ux",
            physicalName: "_created_at",
            position: -2,
          },
          {
            id: "field-updated",
            tableId: "table-ux",
            physicalName: "_updated_at",
            position: -1,
          },
          {
            id: "field-name",
            tableId: "table-ux",
            physicalName: "Name",
            position: 0,
          },
          {
            id: "field-area",
            tableId: "table-ux",
            physicalName: "区域",
            position: 1,
          },
          {
            id: "field-priority",
            tableId: "table-ux",
            physicalName: "优先级",
            position: 3,
          },
          {
            id: "field-screenshot",
            tableId: "table-ux",
            physicalName: "截图",
            position: 5,
          },
          {
            id: "field-done",
            tableId: "table-ux",
            physicalName: "done",
            position: 6,
          },
        ],
      }
      const tableDiff = versionDiff({
        name: "ux",
        columns: [
          "_id",
          "_created_at",
          "_updated_at",
          "Name",
          "区域",
          "优先级",
          "截图",
          "done",
        ],
        primaryKeyColumns: ["_id"],
        changes: [
          {
            op: "update",
            key: { _id: "row-1" },
            oldValues: [
              "row-1",
              "created",
              "updated-before",
              "task",
              "table",
              "p1",
              "待处理",
              "[]",
            ],
            values: [
              "row-1",
              "created",
              "updated-after",
              "task",
              "table",
              "p1",
              "[]",
              1,
            ],
          },
        ],
      })
      const fieldsDiff = versionDiff({
        name: "eidos__fields",
        columns: [
          "id",
          "table_id",
          "name",
          "physical_name",
          "type",
          "system_role",
          "nullable",
          "position",
          "settings_json",
          "created_at",
          "updated_at",
        ],
        primaryKeyColumns: ["id"],
        changes: [
          {
            op: "delete",
            key: { id: "field-status" },
            values: [
              "field-status",
              "table-ux",
              "状态",
              "状态",
              "select",
              null,
              1,
              4,
              "{}",
              "created",
              "created",
            ],
          },
          {
            op: "insert",
            key: { id: "field-done" },
            values: [
              "field-done",
              "table-ux",
              "done",
              "done",
              "checkbox",
              null,
              1,
              6,
              "{}",
              "created",
              "created",
            ],
          },
        ],
      })

      if (withSnapshotSchema) {
        // Deliberately make the deleted field's display position disagree with
        // its stored position; the snapshot schema must take precedence.
        fieldsDiff.files[0]!.tables[0]!.changes[0]!.values![7] = 0
        tableDiff.files[0]!.schemaChanges = [
          {
            name: "ux",
            entryType: "table",
            operation: "modified",
            oldSql:
              'CREATE TABLE ux (_id TEXT PRIMARY KEY, _created_at TEXT, _updated_at TEXT, Name TEXT, "区域" TEXT, "优先级" TEXT, "状态" TEXT, "截图" TEXT)',
            sql: 'CREATE TABLE ux (_id TEXT PRIMARY KEY, _created_at TEXT, _updated_at TEXT, Name TEXT, "区域" TEXT, "优先级" TEXT, "截图" TEXT, done INTEGER)',
          },
        ]
      }
      const normalized = normalizeEidosTableDiff(
        tableDiff,
        fieldsDiff,
        schema,
        "ux"
      )
      const table = normalized.files[0]!.tables[0]!

      expect(table.columns).toEqual([
        "_id",
        "_created_at",
        "_updated_at",
        "Name",
        "区域",
        "优先级",
        "状态",
        "截图",
        "done",
      ])
      expect(table.primaryKeyColumns).toEqual(["_id"])
      expect(table.columnChanges).toEqual([
        null,
        null,
        null,
        null,
        null,
        null,
        { kind: "deleted", before: "状态" },
        null,
        { kind: "added", after: "done" },
      ])
      expect(table.changes[0]!.oldValues).toEqual([
        "row-1",
        "created",
        "updated-before",
        "task",
        "table",
        "p1",
        "待处理",
        "[]",
        undefined,
      ])
      expect(table.changes[0]!.values).toEqual([
        "row-1",
        "created",
        "updated-after",
        "task",
        "table",
        "p1",
        undefined,
        "[]",
        1,
      ])
    }
  )
})
