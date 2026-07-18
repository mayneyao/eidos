import type { ColumnSchema, RelationKind } from "../types"

const ROWID_ALIASES = ["rowid", "_rowid_", "oid"] as const

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}

export function chooseRowidAlias(
  columns: readonly Pick<ColumnSchema, "name">[],
  kind: RelationKind,
  withoutRowid: boolean
): (typeof ROWID_ALIASES)[number] | null {
  if (kind !== "table" || withoutRowid) return null
  const names = new Set(columns.map((column) => column.name.toLowerCase()))
  return ROWID_ALIASES.find((alias) => !names.has(alias)) ?? null
}

export interface StableOrder {
  label: string
  sql: string
}

export function stableRelationOrder(
  columns: readonly ColumnSchema[],
  rowidAlias: (typeof ROWID_ALIASES)[number] | null
): StableOrder {
  if (rowidAlias) {
    return { label: rowidAlias, sql: quoteIdentifier(rowidAlias) }
  }

  const primaryKey = columns
    .filter((column) => column.primaryKeyOrder > 0)
    .sort((left, right) => left.primaryKeyOrder - right.primaryKeyOrder)
  if (primaryKey.length > 0) {
    return {
      label: primaryKey.map((column) => column.name).join(", "),
      sql: primaryKey.map((column) => quoteIdentifier(column.name)).join(", "),
    }
  }

  const visible = columns.filter((column) => column.hidden !== 1)
  if (visible.length > 0) {
    return {
      label: "visible columns",
      sql: visible.map((column) => quoteIdentifier(column.name)).join(", "),
    }
  }
  return { label: "SQLite scan order", sql: "1" }
}
