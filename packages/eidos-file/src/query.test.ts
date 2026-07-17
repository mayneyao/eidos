import { describe, expect, it } from "vitest"

import type { EidosFileFieldInfo, EidosFileRowQuery } from "./types"
import {
  eidosFileRowQueryAffectedByFieldChanges,
  eidosFileRowQueryPredicateColumns,
  compileEidosFileRowQuery,
  normalizeEidosFileFilter,
  normalizeEidosFileRowQuery,
  removeEidosFileFilterField,
} from "./query"

function field(
  column: string,
  type: EidosFileFieldInfo["type"] = "text",
  storageCodec: EidosFileFieldInfo["storageCodec"] = "scalar"
): EidosFileFieldInfo {
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

describe("Eidos File row query", () => {
  const fields = [
    field("title", "title"),
    field("priority", "number"),
    field("status", "select"),
    field("labels", "multi-select", "json_array"),
  ]

  it("compiles escaped search, nested filters, and stable multi-column sort", () => {
    const query: EidosFileRowQuery = {
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

    const compiled = compileEidosFileRowQuery(fields, query)
    expect(compiled.whereSql).toContain("ESCAPE '\\'")
    expect(compiled.whereSql).toContain('priority" >= ?')
    expect(compiled.whereSql).toContain("json_each")
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
      "%urgent%",
    ])
  })

  it("normalizes untrusted IPC and persisted view input", () => {
    expect(
      normalizeEidosFileRowQuery({
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
    const filter = normalizeEidosFileFilter({
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
    expect(removeEidosFileFilterField(filter, "status")).toEqual({
      type: "group",
      conjunction: "and",
      children: [
        { type: "rule", field: "title", operator: "contains", value: "a" },
      ],
    })
  })

  it("matches multi-select options as exact JSON array values", () => {
    const fields = [field("labels", "multi-select", "json_array")]
    const compiled = compileEidosFileRowQuery(fields, {
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
    expect(compiled.whereSql).toContain("json_each")
    expect(compiled.params).toEqual(["bug", "ux"])
  })

  it("treats an empty JSON array as an empty array-backed value", () => {
    const compiled = compileEidosFileRowQuery(
      [field("labels", "multi-select", "json_array")],
      {
        filter: {
          type: "group",
          conjunction: "and",
          children: [
            {
              type: "rule",
              field: "labels",
              operator: "is-empty",
            },
          ],
        },
      }
    )

    expect(compiled.whereSql).toContain("json_array_length")
    expect(compiled.whereSql).toContain("= 0")
  })

  it("sorts array-backed fields by their first JSON value", () => {
    const compiled = compileEidosFileRowQuery(
      [field("labels", "multi-select", "json_array")],
      {
        sorts: [{ field: "labels", direction: "asc" }],
      }
    )

    expect(compiled.orderSql).toBe(
      `ORDER BY json_extract("labels", '$[0]') COLLATE NOCASE ASC, "__base_rowid" ASC`
    )
  })

  it("matches relation IDs as exact JSON array members", () => {
    const relation = {
      ...field("owners", "link", "relation"),
      valueKind: "relation" as const,
    }
    const compiled = compileEidosFileRowQuery([relation], {
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
    expect(compiled.params).toEqual(["row_ada", "row_grace"])
  })

  it("only invalidates a filtered or sorted query for relevant field changes", () => {
    const query: EidosFileRowQuery = {
      filter: {
        type: "group",
        conjunction: "and",
        children: [
          {
            type: "rule",
            field: "status",
            operator: "equals",
            value: "doing",
          },
        ],
      },
      sorts: [{ field: "priority", direction: "desc" }],
    }

    expect(
      eidosFileRowQueryAffectedByFieldChanges(fields, query, ["title"])
    ).toBe(false)
    expect(
      eidosFileRowQueryAffectedByFieldChanges(fields, query, ["status"])
    ).toBe(true)
    expect(
      eidosFileRowQueryAffectedByFieldChanges(fields, query, ["priority"])
    ).toBe(true)
  })

  it("collects only predicate columns for count-source planning", () => {
    expect([
      ...eidosFileRowQueryPredicateColumns(fields, {
        filter: {
          type: "group",
          conjunction: "and",
          children: [
            {
              type: "rule",
              field: "status",
              operator: "equals",
              value: "doing",
            },
          ],
        },
        sorts: [{ field: "priority", direction: "desc" }],
      }),
    ]).toEqual(["status"])

    const hidden = { ...field("internal_note"), isHidden: true }
    expect(
      eidosFileRowQueryPredicateColumns([...fields, hidden], {
        search: "release",
      })
    ).toEqual(new Set(["title", "priority", "status", "labels"]))
  })

  it("follows transitive derived-field dependencies when invalidating a query", () => {
    const subtotal: EidosFileFieldInfo = {
      ...field("subtotal", "formula"),
      valueKind: "derived",
      isDerived: true,
      dependsOn: ["priority"],
    }
    const score: EidosFileFieldInfo = {
      ...field("score", "formula"),
      valueKind: "derived",
      isDerived: true,
      dependsOn: ["subtotal"],
    }

    expect(
      eidosFileRowQueryAffectedByFieldChanges(
        [...fields, subtotal, score],
        { sorts: [{ field: "score", direction: "desc" }] },
        ["priority"]
      )
    ).toBe(true)
    expect(
      eidosFileRowQueryAffectedByFieldChanges(
        [...fields, subtotal, score],
        { sorts: [{ field: "score", direction: "desc" }] },
        ["status"]
      )
    ).toBe(false)
  })

  it("invalidates search only for searchable fields or their dependencies", () => {
    const hiddenSource: EidosFileFieldInfo = {
      ...field("internal_note"),
      isHidden: true,
    }
    const visibleSummary: EidosFileFieldInfo = {
      ...field("summary", "formula"),
      valueKind: "derived",
      isDerived: true,
      dependsOn: ["internal_note"],
    }
    const systemField: EidosFileFieldInfo = {
      ...field("created_at", "created-time"),
      valueKind: "system",
      isHidden: true,
    }
    const searchFields = [...fields, hiddenSource, visibleSummary, systemField]

    expect(
      eidosFileRowQueryAffectedByFieldChanges(
        searchFields,
        { search: "release" },
        ["title"]
      )
    ).toBe(true)
    expect(
      eidosFileRowQueryAffectedByFieldChanges(
        searchFields,
        { search: "release" },
        ["internal_note"]
      )
    ).toBe(true)
    expect(
      eidosFileRowQueryAffectedByFieldChanges(
        searchFields,
        { search: "release" },
        ["created_at"]
      )
    ).toBe(false)
  })
})
