import { describe, expect, it } from "vitest"

import {
  buildLegacyFieldImportStrategies,
  legacyFieldStrategyKey,
} from "./field-migration"
import type {
  LegacyField,
  LegacySpaceSnapshot,
  LegacyTable,
  PlannedTable,
} from "./types"

function field(
  tableName: string,
  columnName: string,
  type: string,
  property: Record<string, unknown> | null = null
): LegacyField {
  return {
    name: columnName,
    type,
    tableName,
    columnName,
    property,
    createdAt: null,
    updatedAt: null,
    isGenerated: false,
    isReadable: true,
  }
}

function table(id: string, fields: LegacyField[]): LegacyTable {
  return {
    id,
    name: id,
    rawTableName: `tb_${id}`,
    rowCount: 0,
    fields,
    views: [],
    references: [],
    icon: null,
    position: null,
  }
}

function snapshot(tables: LegacyTable[]): LegacySpaceSnapshot {
  return {
    sourceRoot: "/source",
    databasePath: "/source/.eidos/db.sqlite3",
    sourceFingerprint: {
      databaseSize: 0,
      databaseMtimeMs: 0,
      walSize: null,
      walMtimeMs: null,
      assetsDigest: "",
    },
    nodes: [],
    documents: [],
    tables,
    assets: [],
    extensions: [],
    issues: [],
  }
}

function plans(tables: LegacyTable[]): PlannedTable[] {
  return tables.map((source) => ({
    id: source.id,
    sourceName: source.name,
    targetBasePath: "main.base",
    rowCount: 0,
    fieldCount: source.fields.length,
    viewCount: 0,
    referenceCount: 0,
    fields: source.fields.map((sourceField) => ({
      sourceColumnName: sourceField.columnName,
      targetColumnName: sourceField.columnName,
      sourceReadable: true,
    })),
    references: [],
  }))
}

function link(tableName: string, columnName: string, targetTableName: string) {
  return field(tableName, columnName, "link", {
    linkTableName: targetTableName,
    linkColumnName: "title",
  })
}

function lookup(
  tableName: string,
  columnName: string,
  relationField: string,
  targetField: string
) {
  return field(tableName, columnName, "lookup", {
    linkFieldId: relationField,
    lookupTargetFieldId: targetField,
    displayType: "text",
  })
}

describe("legacy nested lookup migration", () => {
  it("promotes nested lookups independently of source table order", () => {
    const portfolio = table("portfolio", [
      field("tb_portfolio", "title", "title"),
      link("tb_portfolio", "projects", "tb_project"),
      lookup("tb_portfolio", "skills", "projects", "owner_skills"),
    ])
    const project = table("project", [
      field("tb_project", "title", "title"),
      link("tb_project", "owners", "tb_person"),
      lookup("tb_project", "owner_skills", "owners", "skills"),
    ])
    const person = table("person", [
      field("tb_person", "title", "title"),
      field("tb_person", "skills", "multi-select"),
    ])
    const tables = [portfolio, project, person]

    const strategies = buildLegacyFieldImportStrategies(
      snapshot(tables),
      plans(tables)
    )

    expect(
      strategies.get(legacyFieldStrategyKey("project", "owner_skills"))
    ).toMatchObject({
      valueKind: "derived",
      storageCodec: "json_array",
      omitSourceValue: true,
      property: {
        relationField: "owners",
        targetField: "skills",
        aggregate: "values",
      },
    })
    expect(
      strategies.get(legacyFieldStrategyKey("portfolio", "skills"))
    ).toMatchObject({
      valueKind: "derived",
      storageCodec: "json_array",
      omitSourceValue: true,
      property: {
        relationField: "projects",
        targetField: "owner_skills",
        aggregate: "values",
      },
    })
  })

  it("keeps circular lookup chains materialized", () => {
    const alpha = table("alpha", [
      field("tb_alpha", "title", "title"),
      link("tb_alpha", "betas", "tb_beta"),
      lookup("tb_alpha", "beta_values", "betas", "alpha_values"),
    ])
    const beta = table("beta", [
      field("tb_beta", "title", "title"),
      link("tb_beta", "alphas", "tb_alpha"),
      lookup("tb_beta", "alpha_values", "alphas", "beta_values"),
    ])
    const tables = [alpha, beta]

    const strategies = buildLegacyFieldImportStrategies(
      snapshot(tables),
      plans(tables)
    )

    for (const [tableId, columnName] of [
      ["alpha", "beta_values"],
      ["beta", "alpha_values"],
    ] as const) {
      expect(
        strategies.get(legacyFieldStrategyKey(tableId, columnName))
      ).toMatchObject({
        valueKind: "materialized",
        omitSourceValue: false,
        fallbackReason: "its lookup dependency is circular",
      })
    }
  })
})
