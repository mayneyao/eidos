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
  it("keeps old and new row values bound to stable field identities across a delete and insert", () => {
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
  })
})
