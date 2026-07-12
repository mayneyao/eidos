import { describe, expect, it } from "vitest"

import type { BaseFieldInfo, BaseRowQuery } from "./types"
import {
  compileBaseRowQuery,
  normalizeBaseFilter,
  normalizeBaseRowQuery,
  removeBaseFilterField,
} from "./query"

function field(
  column: string,
  type: BaseFieldInfo["type"] = "text",
  storageCodec: BaseFieldInfo["storageCodec"] = "scalar"
): BaseFieldInfo {
  return {
    name: column,
    type,
    tableName: "tb_tasks",
    tableColumnName: column,
    property: null,
    storageCodec,
    valueKind: "source",
    isHidden: false,
    isDerived: false,
    sourceTableColumnName: null,
    dependsOn: null,
  }
}

describe("Base row query", () => {
  const fields = [
    field("title", "title"),
    field("priority", "number"),
    field("status", "select"),
    field("labels", "multi-select", "csv_ids"),
  ]

  it("compiles escaped search, nested filters, and stable multi-column sort", () => {
    const query: BaseRowQuery = {
      search: "100%_ready",
      filter: {
        type: "group",
        conjunction: "and",
        children: [
          {
            type: "rule",
            field: "priority",
            operator: "greater-than-or-equal",
            value: 2,
          },
          {
            type: "group",
            conjunction: "or",
            children: [
              {
                type: "rule",
                field: "status",
                operator: "equals",
                value: "doing",
              },
              {
                type: "rule",
                field: "labels",
                operator: "contains",
                value: "urgent",
              },
            ],
          },
        ],
      },
      sorts: [
        { field: "priority", direction: "desc" },
        { field: "title", direction: "asc" },
      ],
    }

    const compiled = compileBaseRowQuery(fields, query)
    expect(compiled.whereSql).toContain("ESCAPE '\\'")
    expect(compiled.whereSql).toContain('priority" >= ?')
    expect(compiled.whereSql).toContain("',' || COALESCE")
    expect(compiled.orderSql).toBe(
      'ORDER BY "priority" DESC, "title" COLLATE NOCASE ASC, "__base_rowid" ASC'
    )
    expect(compiled.params).toEqual([
      "%100\\%\\_ready%",
      "%100\\%\\_ready%",
      "%100\\%\\_ready%",
      "%100\\%\\_ready%",
      2,
      "doing",
      "%,urgent,%",
    ])
  })

  it("normalizes untrusted IPC and persisted view input", () => {
    expect(
      normalizeBaseRowQuery({
        search: "needle",
        sorts: [
          { field: "title", direction: "desc" },
          { field: 42, direction: "asc" },
        ],
        filter: {
          type: "group",
          conjunction: "unexpected",
          children: [
            {
              type: "rule",
              field: "status",
              operator: "equals",
              value: "done",
            },
            { type: "rule", field: "status", operator: "DROP TABLE" },
          ],
        },
      })
    ).toEqual({
      search: "needle",
      sorts: [{ field: "title", direction: "desc" }],
      filter: {
        type: "group",
        conjunction: "and",
        children: [
          {
            type: "rule",
            field: "status",
            operator: "equals",
            value: "done",
          },
        ],
      },
    })
  })

  it("removes deleted fields from nested persisted filters", () => {
    const filter = normalizeBaseFilter({
      type: "group",
      conjunction: "and",
      children: [
        { type: "rule", field: "title", operator: "contains", value: "a" },
        {
          type: "group",
          conjunction: "or",
          children: [
            { type: "rule", field: "status", operator: "equals", value: "x" },
          ],
        },
      ],
    })
    expect(removeBaseFilterField(filter, "status")).toEqual({
      type: "group",
      conjunction: "and",
      children: [
        { type: "rule", field: "title", operator: "contains", value: "a" },
      ],
    })
  })

  it("matches multi-select options as exact CSV tokens", () => {
    const fields = [field("labels", "multi-select", "csv_ids")]
    const compiled = compileBaseRowQuery(fields, {
      filter: {
        type: "group",
        conjunction: "and",
        children: [
          {
            type: "rule",
            field: "labels",
            operator: "is-any-of",
            value: ["bug", "ux"],
          },
        ],
      },
    })

    expect(compiled.whereSql).toContain(" OR ")
    expect(compiled.whereSql).toContain("',' || COALESCE")
    expect(compiled.params).toEqual(["%,bug,%", "%,ux,%"])
  })

  it("matches relation IDs as exact JSON array members", () => {
    const relation = {
      ...field("owners", "link", "relation"),
      valueKind: "relation" as const,
    }
    const compiled = compileBaseRowQuery([relation], {
      filter: {
        type: "group",
        conjunction: "and",
        children: [
          {
            type: "rule",
            field: "owners",
            operator: "is-any-of",
            value: ["row_ada", "row_grace"],
          },
        ],
      },
    })

    expect(compiled.whereSql).toContain("json_each")
    expect(compiled.whereSql).toContain("CAST(value AS TEXT)")
    expect(compiled.params).toEqual([
      "row_ada",
      "%,row\\_ada,%",
      "row_grace",
      "%,row\\_grace,%",
    ])
  })
})
