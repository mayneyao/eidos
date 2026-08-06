import { DatabaseSync } from "node:sqlite"

import type {
  SpaceVersionColumnChange,
  SpaceVersionDiff,
  SpaceVersionRowChange,
  SpaceVersionTableDiff,
} from "../../shared/contracts"

export interface EidosPhysicalTable {
  id: string
  physicalName: string
}

export interface EidosPhysicalField {
  id: string
  tableId: string
  physicalName: string
  position: number
}

export interface EidosPhysicalSchema {
  tables: EidosPhysicalTable[]
  fields: EidosPhysicalField[]
}

interface FieldVersion extends EidosPhysicalField {}

function tableFromDiff(
  diff: SpaceVersionDiff,
  tableName: string
): SpaceVersionTableDiff | null {
  for (const file of diff.files) {
    const table = file.tables.find((candidate) => candidate.name === tableName)
    if (table) return table
  }
  return null
}

function changeKind(change: SpaceVersionRowChange) {
  const op = change.op.toLocaleLowerCase()
  if (op === "insert" || op === "add" || op === "added") return "insert"
  if (op === "delete" || op === "remove" || op === "deleted") {
    return "delete"
  }
  return "update"
}

function valueAt(
  columns: readonly string[],
  values: readonly unknown[] | undefined,
  column: string
): unknown {
  if (!values) return undefined
  const index = columns.indexOf(column)
  return index < 0 ? undefined : values[index]
}

function fieldVersion(
  columns: readonly string[],
  values: readonly unknown[] | undefined
): FieldVersion | null {
  const id = valueAt(columns, values, "id")
  const tableId = valueAt(columns, values, "table_id")
  const physicalName = valueAt(columns, values, "physical_name")
  const position = valueAt(columns, values, "position")
  if (
    typeof id !== "string" ||
    typeof tableId !== "string" ||
    typeof physicalName !== "string" ||
    typeof position !== "number" ||
    !Number.isFinite(position)
  ) {
    return null
  }
  return { id, tableId, physicalName, position }
}

function insertDeletedFields(
  afterOrder: readonly string[],
  beforeFields: ReadonlyMap<string, FieldVersion>
): string[] {
  const beforeOrder = afterOrder.filter((id) => beforeFields.has(id))
  const missing = [...beforeFields.values()]
    .filter((field) => !beforeOrder.includes(field.id))
    .sort(
      (left, right) =>
        left.position - right.position || left.id.localeCompare(right.id)
    )
  for (const field of missing) {
    const nextIndex = beforeOrder.findIndex((id) => {
      const candidate = beforeFields.get(id)
      return candidate !== undefined && candidate.position > field.position
    })
    if (nextIndex < 0) beforeOrder.push(field.id)
    else beforeOrder.splice(nextIndex, 0, field.id)
  }
  return beforeOrder
}

function mergeFieldOrders(
  beforeOrder: readonly string[],
  afterOrder: readonly string[]
): string[] {
  const merged = [...afterOrder]
  beforeOrder.forEach((id, index) => {
    if (merged.includes(id)) return
    const next = beforeOrder
      .slice(index + 1)
      .find((candidate) => merged.includes(candidate))
    if (next === undefined) merged.push(id)
    else merged.splice(merged.indexOf(next), 0, id)
  })
  return merged
}

function projectedValues(
  values: readonly unknown[],
  sourceOrder: readonly string[],
  targetOrder: readonly string[]
): unknown[] {
  const byField = new Map(
    sourceOrder.map((fieldId, index) => [fieldId, values[index]] as const)
  )
  return targetOrder.map((fieldId) =>
    byField.has(fieldId) ? byField.get(fieldId) : undefined
  )
}

function uniqueColumnLabels(
  fieldOrder: readonly string[],
  beforeFields: ReadonlyMap<string, FieldVersion>,
  afterFields: ReadonlyMap<string, FieldVersion>
): string[] {
  const labels = fieldOrder.map((id) => {
    const before = beforeFields.get(id)?.physicalName
    const after = afterFields.get(id)?.physicalName
    if (before && after && before !== after) return `${before} → ${after}`
    return after ?? before ?? id
  })
  const totals = new Map<string, number>()
  labels.forEach((label) => totals.set(label, (totals.get(label) ?? 0) + 1))
  return labels.map((label, index) => {
    if ((totals.get(label) ?? 0) < 2) return label
    const id = fieldOrder[index]!
    if (!afterFields.has(id)) return `${label} (removed)`
    if (!beforeFields.has(id)) return `${label} (added)`
    return label
  })
}

function describeColumnChanges(
  fieldOrder: readonly string[],
  beforeFields: ReadonlyMap<string, FieldVersion>,
  afterFields: ReadonlyMap<string, FieldVersion>
): Array<SpaceVersionColumnChange | null> {
  return fieldOrder.map((id) => {
    const before = beforeFields.get(id)?.physicalName
    const after = afterFields.get(id)?.physicalName
    if (before === undefined && after !== undefined) {
      return { kind: "added", after }
    }
    if (before !== undefined && after === undefined) {
      return { kind: "deleted", before }
    }
    if (before !== undefined && after !== undefined && before !== after) {
      return { kind: "renamed", before, after }
    }
    return null
  })
}

function normalizeChanges(
  table: SpaceVersionTableDiff,
  beforeOrder: readonly string[],
  afterOrder: readonly string[],
  mergedOrder: readonly string[]
): SpaceVersionRowChange[] | null {
  for (const change of table.changes) {
    const kind = changeKind(change)
    if (kind === "insert") {
      if (!change.values || change.values.length !== afterOrder.length) {
        return null
      }
    } else if (kind === "delete") {
      if (!change.values || change.values.length !== beforeOrder.length) {
        return null
      }
    } else if (
      !change.values ||
      change.values.length !== afterOrder.length ||
      !change.oldValues ||
      change.oldValues.length !== beforeOrder.length
    ) {
      return null
    }
  }

  return table.changes.map((change) => {
    const kind = changeKind(change)
    if (kind === "insert") {
      return {
        ...change,
        values: projectedValues(change.values!, afterOrder, mergedOrder),
      }
    }
    if (kind === "delete") {
      return {
        ...change,
        values: projectedValues(change.values!, beforeOrder, mergedOrder),
      }
    }
    return {
      ...change,
      oldValues: projectedValues(change.oldValues!, beforeOrder, mergedOrder),
      values: projectedValues(change.values!, afterOrder, mergedOrder),
    }
  })
}

/**
 * Graft 0.3.7 exposes one column list for both sides of a SQLite row diff.
 * When an Eidos Field is added, removed, or renamed, old row values still use
 * the old physical schema. Rebind both sides through stable Field IDs before
 * presenting the diff so values cannot drift into adjacent columns.
 */
export function normalizeEidosTableDiff(
  diff: SpaceVersionDiff,
  fieldsDiff: SpaceVersionDiff,
  currentSchema: EidosPhysicalSchema,
  tableName: string
): SpaceVersionDiff {
  if (tableName.startsWith("eidos__")) return diff
  const table = tableFromDiff(diff, tableName)
  const fieldsTable = tableFromDiff(fieldsDiff, "eidos__fields")
  if (!table || !fieldsTable || fieldsTable.hasMore) return diff

  const currentTable = currentSchema.tables.find(
    (candidate) => candidate.physicalName === tableName
  )
  if (!currentTable) return diff
  const afterFields = new Map(
    currentSchema.fields
      .filter((field) => field.tableId === currentTable.id)
      .map((field) => [field.id, field] as const)
  )
  const beforeFields = new Map(afterFields)
  let schemaChanged = false

  for (const change of fieldsTable.changes) {
    const kind = changeKind(change)
    const after = fieldVersion(fieldsTable.columns, change.values)
    const before =
      kind === "delete"
        ? after
        : fieldVersion(fieldsTable.columns, change.oldValues)
    const affectedTableId = after?.tableId ?? before?.tableId
    if (affectedTableId !== currentTable.id) continue
    if (kind === "insert" && after) {
      afterFields.set(after.id, after)
      beforeFields.delete(after.id)
      schemaChanged = true
    } else if (kind === "delete" && before) {
      afterFields.delete(before.id)
      beforeFields.set(before.id, before)
      schemaChanged = true
    } else if (kind === "update" && before && after) {
      afterFields.set(after.id, after)
      beforeFields.set(before.id, before)
      if (before.physicalName !== after.physicalName) schemaChanged = true
    }
  }
  if (!schemaChanged) return diff

  const afterFieldByName = new Map(
    [...afterFields.values()].map(
      (field) => [field.physicalName, field] as const
    )
  )
  const afterOrder = table.columns.map(
    (column) => afterFieldByName.get(column)?.id ?? `physical:${column}`
  )
  for (const id of afterOrder) {
    if (id.startsWith("physical:") && !beforeFields.has(id)) {
      const physicalName = id.slice("physical:".length)
      const field = {
        id,
        tableId: currentTable.id,
        physicalName,
        position: Number.NEGATIVE_INFINITY,
      }
      afterFields.set(id, field)
      beforeFields.set(id, field)
    }
  }
  const beforeOrder = insertDeletedFields(afterOrder, beforeFields)
  const mergedOrder = mergeFieldOrders(beforeOrder, afterOrder)
  const changes = normalizeChanges(table, beforeOrder, afterOrder, mergedOrder)
  if (!changes) return diff

  const labels = uniqueColumnLabels(mergedOrder, beforeFields, afterFields)
  const labelById = new Map(
    mergedOrder.map((id, index) => [id, labels[index]!] as const)
  )
  const primaryKeyIds = new Set(
    table.primaryKeyColumns.map(
      (column) => afterFieldByName.get(column)?.id ?? `physical:${column}`
    )
  )
  const normalizedTable: SpaceVersionTableDiff = {
    ...table,
    columns: labels,
    columnChanges: describeColumnChanges(
      mergedOrder,
      beforeFields,
      afterFields
    ),
    primaryKeyColumns: mergedOrder
      .filter((id) => primaryKeyIds.has(id))
      .map((id) => labelById.get(id)!),
    changes,
  }

  return {
    ...diff,
    files: diff.files.map((file) => ({
      ...file,
      tables: file.tables.map((candidate) =>
        candidate === table ? normalizedTable : candidate
      ),
    })),
  }
}

export function readEidosPhysicalSchema(filePath: string): EidosPhysicalSchema {
  const database = new DatabaseSync(filePath, {
    allowExtension: false,
    defensive: true,
    enableDoubleQuotedStringLiterals: false,
    readOnly: true,
    timeout: 5_000,
  })
  try {
    const tables = database
      .prepare(
        `SELECT id, physical_name
           FROM eidos__tables
          ORDER BY id COLLATE BINARY`
      )
      .all() as Array<{ id: string; physical_name: string }>
    const fields = database
      .prepare(
        `SELECT id, table_id, physical_name, position
           FROM eidos__fields
          WHERE physical_name IS NOT NULL
          ORDER BY table_id COLLATE BINARY, position, id COLLATE BINARY`
      )
      .all() as Array<{
      id: string
      table_id: string
      physical_name: string
      position: number
    }>
    return {
      tables: tables.map((table) => ({
        id: table.id,
        physicalName: table.physical_name,
      })),
      fields: fields.map((field) => ({
        id: field.id,
        tableId: field.table_id,
        physicalName: field.physical_name,
        position: field.position,
      })),
    }
  } finally {
    database.close()
  }
}
