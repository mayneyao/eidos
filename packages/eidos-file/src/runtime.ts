import { canonicalizeEidosFileJson, parseEidosFileJson } from "./canonical-json"
import { normalizeEidosFileColumnStatConfigs } from "./column-stats"
import type { EidosFileConnection, EidosFileSqlPrimitive } from "./connection"
import {
  EIDOS_FILE_FIELDS_TABLE,
  EIDOS_FILE_FORMULA_FIELDS_TABLE,
  EIDOS_FILE_LOOKUP_FIELDS_TABLE,
  EIDOS_FILE_META_TABLE,
  EIDOS_FILE_RELATION_FIELDS_TABLE,
  EIDOS_FILE_TABLES_TABLE,
  EIDOS_FILE_VIEWS_TABLE,
} from "./constants"
import { EidosFileError } from "./errors"
import { assertEidosFileValues, decodeEidosFileValues } from "./file-values"
import { registerEidosFormulaFunctions } from "./formula-functions"
import {
  compileEidosFileFormula,
  compileEidosFileFormulaSource,
  rewriteEidosFileFormulaFieldReferences,
} from "./formula"
import {
  assertEidosFileDisplayName,
  assertEidosFileUuid,
  createEidosFileUuid,
  eidosFilePhysicalName,
  quoteIdentifier,
} from "./identifiers"
import {
  eidosFileLookupDisplayType,
  eidosFileLookupElementType,
  eidosFileLookupStorageCodec,
  eidosFileLookupTargetDisplayType,
  eidosFileLookupValueType,
} from "./lookup"
import { registerEidosLookupFunctions } from "./lookup-functions"
import {
  assertEidosFileRowQuery,
  compileEidosFileRowQuery,
  eidosFileSortExpression,
  normalizeEidosFileFilter,
  normalizeEidosFileRowQuery,
  normalizeEidosFileSorts,
} from "./query"
import {
  decodeEidosFileRelationIds,
  encodeEidosFileRelationIds,
} from "./relation-values"
import { incrementEidosFileRevision } from "./schema"
import { assertEidosFileSelectOptions } from "./select-options"
import {
  currentEidosFileInstant,
  eidosFileDateSqlCheck,
  eidosFileInstantSqlCheck,
  normalizeEidosFileDate,
  normalizeEidosFileInstant,
} from "./temporal"
import type {
  CreateEidosFileFieldInput,
  CreateEidosFileTableInput,
  CreateEidosFileViewInput,
  EidosFileColumnStatConfig,
  EidosFileColumnStatResult,
  EidosFileFieldInfo,
  EidosFileFieldPlacement,
  EidosFileFieldType,
  EidosFileFilterGroup,
  EidosFileFilterRule,
  EidosFileFormulaPreview,
  EidosFileFormulaPreviewInput,
  EidosFileLogicalRow,
  EidosFileLogicalValue,
  EidosFileLookupAggregate,
  EidosFileMetadata,
  EidosFileRow,
  EidosFileRowGroupCount,
  EidosFileRowPage,
  EidosFileRowPageProjection,
  EidosFileRowQuery,
  EidosFileRowRange,
  EidosFileRowUpdate,
  EidosFileRowsMutation,
  EidosFileSchemaMutation,
  EidosFileSourceFieldType,
  EidosFileSort,
  EidosFileTableInfo,
  EidosFileViewInfo,
  ImportEidosFileFieldInput,
  UpdateEidosFileFieldInput,
  UpdateEidosFileTableInput,
  UpdateEidosFileViewInput,
} from "./types"
import { validateEidosFile } from "./validation"

interface TableRow {
  id: string
  name: string
  physical_name: string
  label_field_id: string
  position: number
  settings_json: string
  created_at: string
  updated_at: string
}

interface FieldRow {
  id: string
  table_id: string
  name: string
  physical_name: string | null
  type: EidosFileFieldType
  system_role: "row-id" | "created-time" | "updated-time" | null
  nullable: number
  position: number
  settings_json: string
  created_at: string
  updated_at: string
}

interface RelationRow {
  field_id: string
  direction: "forward" | "inverse"
  inverse_of_field_id: string | null
  target_table_id: string
  cardinality: "one" | "many"
  on_delete: "restrict" | "detach" | "preserve" | null
}

interface FormulaRow {
  field_id: string
  source_text: string
  result_type: string
}

interface LookupRow {
  field_id: string
  relation_field_id: string
  target_field_id: string
  aggregate: EidosFileLookupAggregate
  distinct_values: number
}

function sameSqlValue(
  left: EidosFileSqlPrimitive | undefined,
  right: EidosFileSqlPrimitive
): boolean {
  if (left instanceof Uint8Array && right instanceof Uint8Array) {
    return (
      left.byteLength === right.byteLength &&
      left.every((value, index) => value === right[index])
    )
  }
  if (
    (typeof left === "number" || typeof left === "bigint") &&
    (typeof right === "number" || typeof right === "bigint") &&
    (typeof left === "bigint" || Number.isInteger(left)) &&
    (typeof right === "bigint" || Number.isInteger(right))
  ) {
    return BigInt(left) === BigInt(right)
  }
  return Object.is(left, right)
}

interface ViewRow {
  id: string
  table_id: string
  name: string
  type: string
  query_json: string
  layout_json: string
  position: number
  created_at: string
  updated_at: string
}

interface RuntimeSchema {
  tables: Map<string, TableRow>
  fields: Map<string, EidosFileFieldInfo>
  fieldsByTable: Map<string, EidosFileFieldInfo[]>
  relations: Map<string, RelationRow>
  formulas: Map<string, FormulaRow>
  lookups: Map<string, LookupRow>
}

interface PreparedField {
  id: string
  name: string
  type: EidosFileFieldType
  physicalName: string | null
  settings: Record<string, unknown>
  input?: CreateEidosFileFieldInput
  isRecordLabel: boolean
  systemRole: "row-id" | "created-time" | "updated-time" | null
  nullable: boolean
}

function systemFieldsLast<T extends { systemRole?: string | null }>(
  fields: readonly T[]
): T[] {
  return [
    ...fields.filter(
      (field) => field.systemRole === null || field.systemRole === undefined
    ),
    ...fields.filter(
      (field) => field.systemRole !== null && field.systemRole !== undefined
    ),
  ]
}

const SYSTEM_FIELD_NAMES = {
  "row-id": "_id",
  "created-time": "_created_at",
  "last-edited-time": "_updated_at",
} as const

const SYSTEM_FIELD_PHYSICAL_NAMES = {
  "row-id": "_id",
  "created-time": "_created_at",
  "last-edited-time": "_updated_at",
} as const

const LABEL_TYPES = new Set<EidosFileFieldType>([
  "row-id",
  "created-time",
  "last-edited-time",
  "text",
  "number",
  "integer",
  "checkbox",
  "date",
  "datetime",
  "url",
  "rating",
  "select",
  "formula",
  "lookup",
])

function uuid(value: string): string {
  return assertEidosFileUuid(value)
}

function jsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = parseEidosFileJson(value)
    return parsed && !Array.isArray(parsed) && typeof parsed === "object"
      ? parsed
      : {}
  } catch {
    return {}
  }
}

function canonicalFieldType(input: {
  type: EidosFileFieldType
}): EidosFileFieldType {
  return input.type === "rating" ? "integer" : input.type
}

function persistedFieldType(type: EidosFileFieldType): EidosFileFieldType {
  if (type === "row-id") return "text"
  if (type === "created-time" || type === "last-edited-time") return "datetime"
  if (type === "rating") return "integer"
  return type
}

function canonicalTemporalProjection(expression: string, type: string): string {
  if (type === "date") {
    return `CASE WHEN (${expression}) IS NULL THEN NULL
      ELSE strftime('%Y-%m-%d', (${expression}), '+0 days') END`
  }
  if (type === "datetime") {
    return `CASE WHEN (${expression}) IS NULL THEN NULL
      ELSE strftime('%Y-%m-%dT%H:%M:%fZ', (${expression})) END`
  }
  return expression
}

function isVirtualField(
  type: EidosFileFieldType,
  input?: CreateEidosFileFieldInput
): boolean {
  if (type === "formula" || type === "lookup") return true
  return (
    type === "relation" &&
    input !== undefined &&
    input.type === "relation" &&
    input.property.direction === "inverse"
  )
}

function fieldColumnSql(field: PreparedField): string | null {
  if (!field.physicalName) return null
  const column = quoteIdentifier(field.physicalName)
  switch (field.type) {
    case "row-id":
      return `${column} TEXT PRIMARY KEY COLLATE BINARY
        CHECK(length(CAST(${column} AS BLOB))=36 AND instr(${column},char(0))=0
          AND substr(${column},9,1)='-' AND substr(${column},14,1)='-'
          AND substr(${column},15,1)='7' AND substr(${column},19,1)='-'
          AND substr(${column},20,1) IN ('8','9','a','b') AND substr(${column},24,1)='-'
          AND lower(${column})=${column}
          AND length(CAST(replace(${column},'-','') AS BLOB))=32
          AND replace(${column},'-','') NOT GLOB '*[^0-9a-f]*')`
    case "created-time":
    case "last-edited-time":
      return `${column} TEXT NOT NULL CHECK(${eidosFileInstantSqlCheck(column)})`
    case "text":
    case "url":
    case "select":
      return `${column} TEXT${field.nullable ? "" : " NOT NULL"}`
    case "number":
      return `${column} REAL${field.nullable ? "" : " NOT NULL"}`
    case "integer":
      return `${column} INTEGER${field.nullable ? "" : " NOT NULL"}`
    case "date":
      return `${column} TEXT${field.nullable ? "" : " NOT NULL"} CHECK(${eidosFileDateSqlCheck(column)})`
    case "datetime":
      return `${column} TEXT${field.nullable ? "" : " NOT NULL"} CHECK(${eidosFileInstantSqlCheck(column)})`
    case "rating":
      return `${column} INTEGER`
    case "checkbox":
      return `${column} INTEGER${field.nullable ? "" : " NOT NULL"} CHECK(${column} IS NULL OR ${column} IN (0, 1))`
    case "json":
      return `${column} TEXT${field.nullable ? "" : " NOT NULL"} CHECK(${column} IS NULL OR json_valid(${column}))`
    case "file":
    case "multi-select":
    case "relation":
      return `${column} TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(${column}) AND json_type(${column}) = 'array')`
    default:
      return null
  }
}

function stablePosition(
  value: number | null | undefined,
  fallback: number
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : fallback
}

function presentationSettingsObject(
  source: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const property = source ? { ...source } : {}
  for (const key of [
    "formula",
    "displayType",
    "targetTableId",
    "targetField",
    "multiple",
    "direction",
    "sourceFieldId",
    "cardinality",
    "onDelete",
    "relationField",
    "aggregate",
    "distinct",
  ]) {
    delete property[key]
  }
  return property
}

function presentationSettings(
  input: CreateEidosFileFieldInput
): Record<string, unknown> {
  const property = presentationSettingsObject(
    "property" in input ? input.property : undefined
  )
  if (input.type === "select" || input.type === "multi-select") {
    const options = assertEidosFileSelectOptions(
      "property" in input ? input.property : undefined
    )
    property.options = options.map((option) => ({
      color: option.color,
      name: option.name,
    }))
  }
  return property
}

function transformOptionValue(
  value: unknown,
  fieldId: string,
  changes: Map<string, string>
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => transformOptionValue(entry, fieldId, changes))
  }
  if (!value || typeof value !== "object") return value
  const object = value as Record<string, unknown>
  const next: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(object)) {
    if (object.field === fieldId && key === "value") {
      next[key] = Array.isArray(entry)
        ? entry.map((item) =>
            typeof item === "string" ? (changes.get(item) ?? item) : item
          )
        : typeof entry === "string"
          ? (changes.get(entry) ?? entry)
          : entry
    } else {
      next[key] = transformOptionValue(entry, fieldId, changes)
    }
  }
  return next
}

function rowValue(value: EidosFileSqlPrimitive): EidosFileRow[string] {
  return value
}

function cursorSortValue(
  row: Record<string, EidosFileSqlPrimitive>,
  field: EidosFileFieldInfo
): EidosFileSqlPrimitive {
  const value = row[field.tableColumnName] ?? null
  if (
    typeof value === "string" &&
    (field.storageCodec === "json_array" || field.storageCodec === "relation")
  ) {
    try {
      const parsed = parseEidosFileJson(value)
      if (Array.isArray(parsed)) {
        const first = parsed.find((entry) => entry !== null)
        return typeof first === "string" ||
          typeof first === "number" ||
          typeof first === "boolean" ||
          first === null ||
          first === undefined
          ? first === true
            ? 1
            : first === false
              ? 0
              : (first ?? null)
          : canonicalizeEidosFileJson(first)
      }
    } catch {
      return null
    }
  }
  return value
}

function encodeCursorSqlValue(value: EidosFileSqlPrimitive): unknown {
  if (typeof value === "bigint") return { integer: value.toString() }
  if (
    value === null ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value
  }
  throw new EidosFileError(
    "invalid-query",
    "Sort boundary is not a scalar JSON cursor value"
  )
}

function decodeCursorSqlValue(value: unknown): EidosFileSqlPrimitive {
  if (
    value === null ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value
  }
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    "integer" in value &&
    typeof value.integer === "string" &&
    /^-?(?:0|[1-9][0-9]*)$/.test(value.integer)
  ) {
    const integer = BigInt(value.integer)
    if (
      integer >= -9_223_372_036_854_775_808n &&
      integer <= 9_223_372_036_854_775_807n
    ) {
      return integer
    }
  }
  throw new EidosFileError("invalid-query", "Cursor sort value is invalid")
}

function uniqueSortFields(
  fields: EidosFileFieldInfo[],
  sorts: EidosFileSort[] | undefined
): Array<{ field: EidosFileFieldInfo; sort: EidosFileSort }> {
  const byColumn = new Map(
    fields.map((field) => [field.tableColumnName, field])
  )
  const seen = new Set<string>()
  return (sorts ?? []).flatMap((sort) => {
    if (seen.has(sort.field)) return []
    const field = byColumn.get(sort.field)
    if (!field) return []
    seen.add(sort.field)
    return [{ field, sort }]
  })
}

function compileKeysetAfter(
  sorts: Array<{ field: EidosFileFieldInfo; sort: EidosFileSort }>,
  values: EidosFileSqlPrimitive[],
  lastId: string
): { sql: string; params: EidosFileSqlPrimitive[] } {
  if (values.length !== sorts.length) {
    throw new EidosFileError("invalid-query", "Cursor sort tuple is invalid")
  }
  const params: EidosFileSqlPrimitive[] = []
  const branches: string[] = []
  // Equality placeholders occur in every later branch, so construct the
  // parameter list in the same branch order instead of sharing SQL prefixes.
  sorts.forEach(({ field, sort }, index) => {
    const expression = eidosFileSortExpression(field)
    const value = values[index] ?? null
    let after: string
    if (value === null) {
      after = sort.nulls === "first" ? `${expression} IS NOT NULL` : "0"
    } else {
      const comparison = sort.direction === "desc" ? "<" : ">"
      after =
        sort.nulls === "last"
          ? `(${expression} ${comparison} ? OR ${expression} IS NULL)`
          : `${expression} ${comparison} ?`
    }
    if (after !== "0") {
      const parts: string[] = []
      for (let prefixIndex = 0; prefixIndex < index; prefixIndex += 1) {
        const prefixExpression = eidosFileSortExpression(
          sorts[prefixIndex]!.field
        )
        const prefixValue = values[prefixIndex] ?? null
        if (prefixValue === null) parts.push(`${prefixExpression} IS NULL`)
        else {
          parts.push(`${prefixExpression} IS ?`)
          params.push(prefixValue)
        }
      }
      parts.push(after)
      if (value !== null) params.push(value)
      branches.push(`(${parts.join(" AND ")})`)
    }
  })
  const finalParts: string[] = []
  sorts.forEach(({ field }, index) => {
    const expression = eidosFileSortExpression(field)
    const value = values[index] ?? null
    if (value === null) finalParts.push(`${expression} IS NULL`)
    else {
      finalParts.push(`${expression} IS ?`)
      params.push(value)
    }
  })
  finalParts.push('"__base_rowid" > ?')
  params.push(assertEidosFileUuid(lastId, "Cursor Row ID"))
  branches.push(`(${finalParts.join(" AND ")})`)
  return { sql: `(${branches.join(" OR ")})`, params }
}

function filterToStorage(
  filter: EidosFileFilterGroup | null | undefined,
  fields: EidosFileFieldInfo[]
): Record<string, unknown> | null {
  const normalized = normalizeEidosFileFilter(filter)
  if (!normalized) return null
  const byKey = new Map<string, string>()
  for (const field of fields) {
    if (field.id) {
      byKey.set(field.id, field.id)
      byKey.set(field.tableColumnName, field.id)
      byKey.set(field.name, field.id)
    }
  }
  const convert = (group: EidosFileFilterGroup): Record<string, unknown> => {
    const args: Record<string, unknown>[] = []
    for (const child of group.children) {
      if (child.type === "group") args.push(convert(child))
      else {
        const field = byKey.get(child.field)
        if (field) {
          args.push({
            field,
            op: child.operator,
            ...("value" in child ? { value: child.value } : {}),
          })
        }
      }
    }
    return { args, op: group.conjunction }
  }
  return convert(normalized)
}

function filterFromStorage(
  value: unknown,
  fields: EidosFileFieldInfo[]
): EidosFileFilterGroup | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const ids = new Set(fields.flatMap((field) => (field.id ? [field.id] : [])))
  const convert = (input: unknown): EidosFileFilterGroup | null => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return null
    const group = input as Record<string, unknown>
    if (!Array.isArray(group.args)) return null
    const children: EidosFileFilterGroup["children"] = []
    for (const child of group.args) {
      if (!child || typeof child !== "object" || Array.isArray(child)) continue
      const object = child as Record<string, unknown>
      if (Array.isArray(object.args)) {
        const nested = convert(object)
        if (nested) children.push(nested)
      } else if (
        typeof object.field === "string" &&
        typeof object.op === "string"
      ) {
        if (ids.has(object.field)) {
          children.push({
            type: "rule",
            field: object.field,
            operator: object.op as EidosFileFilterRule["operator"],
            ...("value" in object ? { value: object.value as never } : {}),
          } as EidosFileFilterGroup["children"][number])
        }
      }
    }
    return {
      type: "group",
      conjunction: group.op === "or" ? "or" : "and",
      children,
    }
  }
  return normalizeEidosFileFilter(convert(value))
}

export class EidosFileRuntime {
  private mutationDepth = 0
  private mutationInstant: string | null = null
  private schemaCache:
    | { dataVersion: number; schema: RuntimeSchema }
    | undefined
  private readonly nowInstant: () => string
  private readonly allocateId: () => string

  constructor(
    readonly connection: EidosFileConnection,
    private readonly ownsConnection = false,
    environment: {
      nowInstant?: () => string
      allocateId?: () => string
    } = {}
  ) {
    this.nowInstant = environment.nowInstant ?? currentEidosFileInstant
    this.allocateId = environment.allocateId ?? (() => createEidosFileUuid())
    connection.exec("PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF;")
    connection.registerFunction("eidos_casefold", (value) =>
      value === null ? null : String(value).toUpperCase().toLowerCase()
    )
    registerEidosFormulaFunctions(connection)
    registerEidosLookupFunctions(connection)
  }

  close(): void {
    if (this.ownsConnection) this.connection.close?.()
  }

  inspect() {
    return validateEidosFile(this.connection)
  }

  validate(
    options: {
      level?: "identity" | "structural" | "content" | "semantic" | "full"
    } = {}
  ) {
    return validateEidosFile(this.connection, options)
  }

  info(): EidosFileMetadata {
    const result = validateEidosFile(this.connection, { level: "identity" })
    if (!result.metadata || !result.valid) {
      throw new EidosFileError(
        "not-eidos-file",
        result.errors.map((issue) => issue.message).join("; ")
      )
    }
    return result.metadata
  }

  metadata(): EidosFileMetadata {
    return this.info()
  }

  private tableRow(tableId: string): TableRow {
    const row = this.allSchema().tables.get(
      assertEidosFileUuid(tableId, "Table ID")
    )
    if (!row) {
      throw new EidosFileError(
        "table-not-found",
        `Eidos File Table not found: ${tableId}`
      )
    }
    return row
  }

  private fieldRows(tableId: string): FieldRow[] {
    return this.connection.query<FieldRow>(
      `SELECT * FROM ${EIDOS_FILE_FIELDS_TABLE}
        WHERE table_id = ? ORDER BY position, id`,
      [assertEidosFileUuid(tableId, "Table ID")]
    )
  }

  private allSchema(): RuntimeSchema {
    const dataVersion = this.connection.dataVersion()
    if (
      this.mutationDepth === 0 &&
      this.schemaCache?.dataVersion === dataVersion
    ) {
      return this.schemaCache.schema
    }
    const tableRows = this.connection.query<TableRow>(
      `SELECT * FROM ${EIDOS_FILE_TABLES_TABLE}`
    )
    const tables = new Map(tableRows.map((table) => [uuid(table.id), table]))
    const relationRows = this.connection.query<RelationRow>(
      `SELECT * FROM ${EIDOS_FILE_RELATION_FIELDS_TABLE}`
    )
    const formulaRows = this.connection.query<FormulaRow>(
      `SELECT * FROM ${EIDOS_FILE_FORMULA_FIELDS_TABLE}`
    )
    const lookupRows = this.connection.query<LookupRow>(
      `SELECT * FROM ${EIDOS_FILE_LOOKUP_FIELDS_TABLE}`
    )
    const relations = new Map(
      relationRows.map((row) => [uuid(row.field_id), row])
    )
    const formulas = new Map(
      formulaRows.map((row) => [uuid(row.field_id), row])
    )
    const lookups = new Map(lookupRows.map((row) => [uuid(row.field_id), row]))
    const fields = new Map<string, EidosFileFieldInfo>()
    const fieldsByTable = new Map<string, EidosFileFieldInfo[]>()
    for (const row of this.connection.query<FieldRow>(
      `SELECT * FROM ${EIDOS_FILE_FIELDS_TABLE} ORDER BY table_id, position, id`
    )) {
      const id = uuid(row.id)
      const tableId = uuid(row.table_id)
      const table = tables.get(tableId)
      if (!table) continue
      const relation = relations.get(id)
      const formula = formulas.get(id)
      const lookup = lookups.get(id)
      const settings = jsonObject(row.settings_json)
      const type: EidosFileFieldType =
        row.system_role === "row-id"
          ? "row-id"
          : row.system_role === "created-time"
            ? "created-time"
            : row.system_role === "updated-time"
              ? "last-edited-time"
              : row.type
      const virtual =
        type === "formula" ||
        type === "lookup" ||
        (type === "relation" && relation?.direction === "inverse")
      let property: Record<string, unknown> | null = settings
      if (relation) {
        property = {
          ...settings,
          targetTableId: uuid(relation.target_table_id),
          targetField: "",
          multiple: relation.cardinality === "many",
          direction: relation.direction,
          sourceFieldId: relation.inverse_of_field_id
            ? uuid(relation.inverse_of_field_id)
            : undefined,
          cardinality: relation.cardinality,
          onDelete: relation.on_delete,
        }
      } else if (formula) {
        property = {
          ...settings,
          formula: formula.source_text,
          displayType: formula.result_type,
        }
      } else if (lookup) {
        const target = fields.get(uuid(lookup.target_field_id))
        property = {
          ...settings,
          relationField: uuid(lookup.relation_field_id),
          targetField: uuid(lookup.target_field_id),
          aggregate: lookup.aggregate,
          displayType: target
            ? eidosFileLookupDisplayType(lookup.aggregate, target)
            : lookup.aggregate === "count"
              ? "number"
              : "text",
          distinct: lookup.distinct_values === 1,
        }
      }
      const field: EidosFileFieldInfo = {
        id,
        tableId,
        name: row.name,
        type,
        tableName: table.physical_name,
        tableColumnName: row.physical_name ?? id,
        physicalName: row.physical_name,
        systemRole: row.system_role,
        nullable: row.nullable === 1,
        isRecordLabel: table.label_field_id === id,
        position: row.position,
        settings,
        property,
        storageCodec:
          type === "relation" && relation?.direction === "forward"
            ? "relation"
            : type === "file" ||
                type === "multi-select" ||
                (type === "lookup" && lookup?.aggregate === "values")
              ? "json_array"
              : "scalar",
        valueKind: ["row-id", "created-time", "last-edited-time"].includes(type)
          ? "system"
          : virtual
            ? "derived"
            : type === "relation"
              ? "relation"
              : "source",
        isHidden: ["row-id", "created-time", "last-edited-time"].includes(type),
        isDerived: virtual,
        sourceTableColumnName:
          relation?.direction === "inverse" && relation.inverse_of_field_id
            ? uuid(relation.inverse_of_field_id)
            : null,
        dependsOn: formula
          ? []
          : lookup
            ? [uuid(lookup.relation_field_id), uuid(lookup.target_field_id)]
            : null,
      }
      fields.set(id, field)
      const ownerFields = fieldsByTable.get(tableId) ?? []
      ownerFields.push(field)
      fieldsByTable.set(tableId, ownerFields)
    }
    // Resolve nested Lookup result TypeRefs after every Field is known.
    for (let pass = 0; pass < fields.size; pass += 1) {
      let changed = false
      for (const [id, lookup] of lookups) {
        const field = fields.get(id)
        const target = fields.get(uuid(lookup.target_field_id))
        if (field?.property && target) {
          const valueType = eidosFileLookupValueType(lookup.aggregate, target)
          const displayType = eidosFileLookupDisplayType(
            lookup.aggregate,
            target
          )
          if (
            JSON.stringify(field.property.valueType) !==
              JSON.stringify(valueType) ||
            field.property.displayType !== displayType
          ) {
            field.property.valueType = valueType
            field.property.displayType = displayType
            changed = true
          }
        }
      }
      if (!changed) break
    }
    const schema = {
      tables,
      fields,
      fieldsByTable,
      relations,
      formulas,
      lookups,
    }
    if (this.mutationDepth === 0) this.schemaCache = { dataVersion, schema }
    return schema
  }

  listTables(): EidosFileTableInfo[] {
    return Array.from(this.allSchema().tables.values())
      .sort(
        (left, right) =>
          left.position - right.position ||
          uuid(left.id).localeCompare(uuid(right.id))
      )
      .map((row) => ({
        ...(() => {
          const settings = jsonObject(row.settings_json)
          return {
            icon: typeof settings.icon === "string" ? settings.icon : null,
            description:
              typeof settings.description === "string"
                ? settings.description
                : null,
          }
        })(),
        id: uuid(row.id),
        name: row.name,
        physicalName: row.physical_name,
        rawTableName: row.physical_name,
        position: row.position,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }))
  }

  getTable(tableId: string): EidosFileTableInfo {
    const row = this.tableRow(tableId)
    const settings = jsonObject(row.settings_json)
    return {
      id: uuid(row.id),
      name: row.name,
      physicalName: row.physical_name,
      rawTableName: row.physical_name,
      position: row.position,
      icon: typeof settings.icon === "string" ? settings.icon : null,
      description:
        typeof settings.description === "string" ? settings.description : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  listFields(tableId: string): EidosFileFieldInfo[] {
    this.tableRow(tableId)
    return this.allSchema().fieldsByTable.get(tableId) ?? []
  }

  private fieldByKey(tableId: string, key: string): EidosFileFieldInfo {
    const fields = this.listFields(tableId)
    const field = fields.find(
      (candidate) =>
        candidate.id === key ||
        candidate.tableColumnName === key ||
        candidate.physicalName === key ||
        candidate.name === key
    )
    if (!field) {
      throw new EidosFileError(
        "field-not-found",
        `Eidos File Field not found: ${key}`
      )
    }
    return field
  }

  /** @internal Exact Runtime service transaction composition hook. */
  applyCanonicalMutation<T>(
    operation: (instant: string) => T,
    expectedRevision?: number | bigint
  ): T {
    return this.mutate(
      () => operation(this.operationInstant()),
      expectedRevision
    )
  }

  private mutate<T>(operation: () => T, expectedRevision?: number | bigint): T {
    if (this.mutationDepth > 0) return operation()
    return this.connection.transaction(() => {
      this.schemaCache = undefined
      const revision = this.info().revision ?? 0
      if (
        expectedRevision !== undefined &&
        BigInt(revision) !== BigInt(expectedRevision)
      ) {
        throw new EidosFileError(
          "stale-revision",
          `Expected revision ${expectedRevision}, found ${revision}`
        )
      }
      const totalChangesBefore =
        this.connection.get<{ total: number | bigint }>(
          "SELECT total_changes() AS total"
        )?.total ?? 0
      this.mutationInstant = this.nowInstant()
      this.mutationDepth += 1
      try {
        const result = operation()
        const totalChangesAfter =
          this.connection.get<{ total: number | bigint }>(
            "SELECT total_changes() AS total"
          )?.total ?? totalChangesBefore
        if (BigInt(totalChangesAfter) === BigInt(totalChangesBefore)) {
          return result
        }
        const validation = validateEidosFile(this.connection, {
          level: "semantic",
        })
        if (!validation.valid) {
          throw new EidosFileError(
            "invalid-schema",
            validation.errors.map((issue) => issue.message).join("; ")
          )
        }
        incrementEidosFileRevision(this.connection, this.operationInstant())
        return result
      } finally {
        this.mutationDepth -= 1
        this.mutationInstant = null
        this.schemaCache = undefined
      }
    })
  }

  private operationInstant(): string {
    return this.mutationInstant ?? this.nowInstant()
  }

  private prepareFields(input: CreateEidosFileTableInput): PreparedField[] {
    const systemIds = [this.allocateId(), this.allocateId(), this.allocateId()]
    const userFields: PreparedField[] = (input.fields ?? []).map((field) => {
      const id = field.id ?? this.allocateId()
      assertEidosFileUuid(id, "Field ID")
      assertEidosFileDisplayName(field.name, "Field name")
      return {
        id,
        name: field.name,
        type: canonicalFieldType(field),
        physicalName: null,
        settings: {
          ...presentationSettings(field),
          ...(field.type === "rating" ? { display: { kind: "rating" } } : {}),
        },
        input: field,
        isRecordLabel: "isRecordLabel" in field && field.isRecordLabel === true,
        systemRole: null,
        nullable:
          field.type === "formula" || field.type === "lookup"
            ? true
            : field.type === "file" ||
                field.type === "multi-select" ||
                field.type === "relation"
              ? false
              : "nullable" in field
                ? field.nullable !== false
                : true,
      } satisfies PreparedField
    })
    const names = new Set<string>(
      Object.values(SYSTEM_FIELD_NAMES).map((name) =>
        name.replace(/[A-Z]/g, (character) => character.toLowerCase())
      )
    )
    if (userFields.filter((field) => field.isRecordLabel).length > 1) {
      throw new EidosFileError(
        "constraint-conflict",
        "A Table can declare only one Record Label Field"
      )
    }
    for (const field of userFields) {
      const folded = field.name.replace(/[A-Z]/g, (character) =>
        character.toLowerCase()
      )
      if (names.has(folded)) {
        throw new EidosFileError(
          "constraint-conflict",
          `Field names must be unique under SQLite NOCASE: ${field.name}`
        )
      }
      names.add(folded)
    }
    const systemTypes = ["row-id", "created-time", "last-edited-time"] as const
    const system = systemTypes.map(
      (type, index) =>
        ({
          id: systemIds[index]!,
          name: SYSTEM_FIELD_NAMES[type],
          type,
          physicalName: SYSTEM_FIELD_PHYSICAL_NAMES[type],
          settings: {},
          isRecordLabel: false,
          systemRole: type === "last-edited-time" ? "updated-time" : type,
          nullable: false,
        }) satisfies PreparedField
    )
    if (!userFields.some((field) => field.isRecordLabel)) {
      const firstScalar = userFields.find(
        (field) =>
          LABEL_TYPES.has(field.type) &&
          !isVirtualField(field.type, field.input)
      )
      ;(firstScalar ?? system[0]!).isRecordLabel = true
    }
    const existing = new Set<string>(system.map((field) => field.physicalName!))
    for (const field of userFields) {
      if (isVirtualField(field.type, field.input)) continue
      field.physicalName = eidosFilePhysicalName(
        "field",
        field.name,
        field.id,
        existing
      )
      existing.add(field.physicalName)
    }
    return [...system, ...userFields]
  }

  createTable(input: CreateEidosFileTableInput): EidosFileTableInfo {
    assertEidosFileDisplayName(input.name, "Table name")
    const tableId = input.id ?? this.allocateId()
    assertEidosFileUuid(tableId, "Table ID")
    const existing = this.listTables().map(
      (table) => table.physicalName ?? table.rawTableName
    )
    const physicalName = eidosFilePhysicalName(
      "table",
      input.name,
      tableId,
      existing
    )
    const fields = this.prepareFields(input)
    const position = this.listTables().length
    return this.mutate(() => {
      const now = this.operationInstant()
      const definitions = fields.flatMap((field) => {
        const definition = fieldColumnSql(field)
        return definition ? [definition] : []
      })
      this.connection.exec(
        `CREATE TABLE ${quoteIdentifier(physicalName)} (${definitions.join(", ")}) STRICT, WITHOUT ROWID`
      )
      const labelField = fields.find((field) => field.isRecordLabel)
      if (!labelField) {
        throw new EidosFileError(
          "invalid-schema",
          "A Table requires exactly one Record Label Field"
        )
      }
      const tableSettings = canonicalizeEidosFileJson({
        ...(input.icon === undefined ? {} : { icon: input.icon }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
      })
      this.connection.run(
        `INSERT INTO ${EIDOS_FILE_TABLES_TABLE}
          (id, name, physical_name, label_field_id, position, settings_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tableId,
          input.name,
          physicalName,
          labelField.id,
          position,
          tableSettings,
          now,
          now,
        ]
      )
      // Insert every base Field first. Lookup and inverse definitions may
      // reference siblings whose position is later in the input list.
      fields.forEach((field, fieldPosition) => {
        const position =
          field.systemRole === "row-id"
            ? -3
            : field.systemRole === "created-time"
              ? -2
              : field.systemRole === "updated-time"
                ? -1
                : fieldPosition - 3
        this.insertFieldMetadata(tableId, field, position, now)
      })
      fields.forEach((field) => {
        this.insertFieldSubtypeMetadata(tableId, field)
      })
      this.installRowIdTrigger(tableId, physicalName)
      for (const field of fields) {
        if (field.type === "relation" && field.input) {
          this.installRelationTriggers(field.id)
        }
      }
      if (input.createDefaultView !== false) {
        const viewId = this.allocateId()
        const fieldOrder = systemFieldsLast(fields).map((field) => field.id)
        this.connection.run(
          `INSERT INTO ${EIDOS_FILE_VIEWS_TABLE}
            (id, table_id, name, type, query_json, layout_json, position, created_at, updated_at)
           VALUES (?, ?, ?, 'grid', '{}', ?, 0, ?, ?)`,
          [
            viewId,
            tableId,
            "Grid",
            canonicalizeEidosFileJson({
              cardFields: [],
              coverField: null,
              fieldOrder,
              fieldWidths: {},
              groupField: null,
              hiddenFields: fields
                .filter(
                  (field) =>
                    !field.isRecordLabel &&
                    ["row-id", "created-time", "last-edited-time"].includes(
                      field.type
                    )
                )
                .map((field) => field.id),
            }),
            now,
            now,
          ]
        )
      }
      return {
        id: tableId,
        name: input.name,
        physicalName,
        rawTableName: physicalName,
        position,
        icon: input.icon ?? null,
        description: input.description ?? null,
        createdAt: now,
        updatedAt: now,
      }
    })
  }

  private insertFieldMetadata(
    tableId: string,
    field: PreparedField,
    position: number,
    now: string
  ): void {
    this.connection.run(
      `INSERT INTO ${EIDOS_FILE_FIELDS_TABLE}
        (id, table_id, name, physical_name, type, system_role, nullable, position,
         settings_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        field.id,
        tableId,
        field.name,
        field.physicalName,
        persistedFieldType(field.type),
        field.systemRole,
        field.nullable ? 1 : 0,
        position,
        canonicalizeEidosFileJson(field.settings),
        now,
        now,
      ]
    )
  }

  private insertFieldSubtypeMetadata(
    tableId: string,
    field: PreparedField
  ): void {
    const input = field.input
    if (!input) return
    if (field.type === "formula" && input.type === "formula") {
      this.connection.run(
        `INSERT INTO ${EIDOS_FILE_FORMULA_FIELDS_TABLE}
          (field_id, source_text, result_type) VALUES (?, ?, ?)`,
        [field.id, input.property.formula, input.property.displayType]
      )
    }
    if (field.type === "relation" && input.type === "relation") {
      const direction = input.property.direction ?? "forward"
      const sourceFieldId = input.property.sourceFieldId ?? null
      const cardinality =
        direction === "inverse"
          ? "many"
          : (input.property.cardinality ??
            (input.property.multiple ? "many" : "one"))
      this.connection.run(
        `INSERT INTO ${EIDOS_FILE_RELATION_FIELDS_TABLE}
          (field_id, direction, inverse_of_field_id, target_table_id, cardinality, on_delete)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          field.id,
          direction,
          sourceFieldId
            ? assertEidosFileUuid(sourceFieldId, "Source Field ID")
            : null,
          assertEidosFileUuid(input.property.targetTableId, "Target Table ID"),
          cardinality,
          direction === "forward"
            ? (input.property.onDelete ?? "restrict")
            : null,
        ]
      )
    }
    if (field.type === "lookup" && input.type === "lookup") {
      const relation = this.fieldByKey(tableId, input.property.relationField)
      const schema = this.allSchema()
      const relationDefinition = schema.relations.get(relation.id!)
      if (!relationDefinition) {
        throw new EidosFileError(
          "invalid-schema",
          "Lookup requires a Relation Field"
        )
      }
      const targetTableId = uuid(relationDefinition.target_table_id)
      const target = this.fieldByKey(targetTableId, input.property.targetField)
      this.connection.run(
        `INSERT INTO ${EIDOS_FILE_LOOKUP_FIELDS_TABLE}
          (field_id, relation_field_id, target_field_id, aggregate, distinct_values)
         VALUES (?, ?, ?, ?, ?)`,
        [
          field.id,
          relation.id!,
          target.id!,
          input.property.aggregate,
          input.property.distinct === true ? 1 : 0,
        ]
      )
    }
  }

  private installRowIdTrigger(tableId: string, physicalName: string): void {
    const trigger = `eidos__row_id_immutable__${tableId.replace(/-/g, "")}`
    this.connection.exec(`
      CREATE TRIGGER ${quoteIdentifier(trigger)}
      BEFORE UPDATE OF "_id" ON ${quoteIdentifier(physicalName)}
      WHEN NEW."_id" IS NOT OLD."_id"
      BEGIN SELECT RAISE(ABORT, 'EIDOS_ROW_ID_IMMUTABLE'); END;
    `)
  }

  private installRelationTriggers(fieldId: string): void {
    const schema = this.allSchema()
    const field = schema.fields.get(fieldId)
    const relation = schema.relations.get(fieldId)
    if (
      !field ||
      !relation ||
      relation.direction !== "forward" ||
      !field.physicalName
    )
      return
    const sourceTable = schema.tables.get(field.tableId!)!
    const targetTable = schema.tables.get(uuid(relation.target_table_id))!
    const hex = fieldId.replace(/-/g, "")
    const column = quoteIdentifier(field.physicalName)
    const invalidUuid = `(typeof(item.value) <> 'text' OR length(item.value) <> 36
      OR substr(item.value, 9, 1) <> '-' OR substr(item.value, 14, 1) <> '-'
      OR substr(item.value, 19, 1) <> '-' OR substr(item.value, 24, 1) <> '-'
      OR substr(item.value, 15, 1) <> '7'
      OR substr(item.value, 20, 1) NOT IN ('8','9','a','b')
      OR replace(item.value, '-', '') GLOB '*[^0-9a-f]*')`
    for (const event of ["INSERT", "UPDATE"] as const) {
      const triggerName = `eidos__relation_validate_${event.toLowerCase()}__${hex}`
      const newValue = `NEW.${column}`
      const safeArray = `CASE WHEN json_valid(${newValue}) AND json_type(${newValue}) = 'array' THEN ${newValue} ELSE '[]' END`
      const updateOf = event === "UPDATE" ? ` OF ${column}` : ""
      this.connection.exec(`
        CREATE TRIGGER ${quoteIdentifier(triggerName)}
        BEFORE ${event}${updateOf} ON ${quoteIdentifier(sourceTable.physical_name)}
        WHEN NOT json_valid(${newValue})
          OR json_type(${newValue}) <> 'array'
          OR EXISTS (SELECT 1 FROM json_each(${safeArray}) item WHERE ${invalidUuid})
          OR (SELECT count(*) FROM json_each(${safeArray})) <>
             (SELECT count(DISTINCT value) FROM json_each(${safeArray}))
          ${relation.cardinality === "one" ? `OR json_array_length(${safeArray}) > 1` : ""}
        BEGIN SELECT RAISE(ABORT, 'EIDOS_INVALID_RELATION_VALUE'); END;
      `)
    }
    if (relation.on_delete === "preserve") return
    const targetUuid = `OLD."_id"`
    const triggerName = `eidos__relation_${relation.on_delete}__${hex}`
    if (relation.on_delete === "restrict") {
      this.connection.exec(`
        CREATE TRIGGER ${quoteIdentifier(triggerName)}
        BEFORE DELETE ON ${quoteIdentifier(targetTable.physical_name)}
        WHEN EXISTS (
          SELECT 1 FROM ${quoteIdentifier(sourceTable.physical_name)} source,
          json_each(source.${column}) item WHERE item.value = ${targetUuid}
        )
        BEGIN SELECT RAISE(ABORT, 'EIDOS_RELATION_RESTRICT'); END;
      `)
    } else {
      this.connection.exec(`
        CREATE TRIGGER ${quoteIdentifier(triggerName)}
        BEFORE DELETE ON ${quoteIdentifier(targetTable.physical_name)}
        WHEN EXISTS (
          SELECT 1 FROM ${quoteIdentifier(sourceTable.physical_name)} source,
          json_each(source.${column}) item WHERE item.value = ${targetUuid}
        )
        BEGIN
          UPDATE ${quoteIdentifier(sourceTable.physical_name)}
          SET ${column} = (
            SELECT coalesce(json_group_array(value), '[]') FROM (
              SELECT item.value AS value FROM json_each(${column}) item
              WHERE item.value <> ${targetUuid} ORDER BY CAST(item.key AS INTEGER)
            )
          ), "_updated_at" = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE EXISTS (SELECT 1 FROM json_each(${column}) item WHERE item.value = ${targetUuid});
        END;
      `)
    }
  }

  private dropRelationTriggers(fieldId: string): void {
    const hex = fieldId.replace(/-/g, "")
    for (const name of [
      `eidos__relation_validate_insert__${hex}`,
      `eidos__relation_validate_update__${hex}`,
      `eidos__relation_restrict__${hex}`,
      `eidos__relation_detach__${hex}`,
      `eidos__relation_preserve__${hex}`,
    ]) {
      this.connection.exec(`DROP TRIGGER IF EXISTS ${quoteIdentifier(name)}`)
    }
  }

  updateTable(
    tableId: string,
    changes: UpdateEidosFileTableInput
  ): EidosFileTableInfo {
    const table = this.getTable(tableId)
    return this.mutate(() => {
      let name = table.name
      let physicalName = table.physicalName ?? table.rawTableName
      if (changes.name !== undefined && changes.name !== table.name) {
        name = assertEidosFileDisplayName(changes.name, "Table name")
        physicalName = eidosFilePhysicalName(
          "table",
          name,
          tableId,
          this.listTables()
            .filter((candidate) => candidate.id !== tableId)
            .map(
              (candidate) => candidate.physicalName ?? candidate.rawTableName
            )
        )
        if (physicalName !== (table.physicalName ?? table.rawTableName)) {
          const previousPhysicalName = table.physicalName ?? table.rawTableName
          if (
            previousPhysicalName !== physicalName &&
            previousPhysicalName.replace(/[A-Z]/g, (character) =>
              character.toLowerCase()
            ) ===
              physicalName.replace(/[A-Z]/g, (character) =>
                character.toLowerCase()
              )
          ) {
            const baseTemporary = `t__rename__${tableId.replace(/-/g, "")}`
            let temporary = baseTemporary
            let suffix = 0
            const occupied = new Set(
              this.listTables().map((candidate) =>
                (candidate.physicalName ?? candidate.rawTableName).replace(
                  /[A-Z]/g,
                  (character) => character.toLowerCase()
                )
              )
            )
            while (occupied.has(temporary.toLowerCase())) {
              suffix += 1
              temporary = `${baseTemporary}__${suffix}`
            }
            this.connection.exec(
              `ALTER TABLE ${quoteIdentifier(previousPhysicalName)} RENAME TO ${quoteIdentifier(temporary)}`
            )
            this.connection.exec(
              `ALTER TABLE ${quoteIdentifier(temporary)} RENAME TO ${quoteIdentifier(physicalName)}`
            )
          } else {
            this.connection.exec(
              `ALTER TABLE ${quoteIdentifier(previousPhysicalName)} RENAME TO ${quoteIdentifier(physicalName)}`
            )
          }
        }
      }
      const now = this.operationInstant()
      const settings = canonicalizeEidosFileJson({
        ...(changes.icon === undefined
          ? table.icon === null
            ? {}
            : { icon: table.icon }
          : changes.icon === null
            ? {}
            : { icon: changes.icon }),
        ...(changes.description === undefined
          ? table.description === null
            ? {}
            : { description: table.description }
          : changes.description === null
            ? {}
            : { description: changes.description }),
      })
      this.connection.run(
        `UPDATE ${EIDOS_FILE_TABLES_TABLE}
            SET name = ?, physical_name = ?, settings_json = ?, updated_at = ?
          WHERE id = ?`,
        [name, physicalName, settings, now, tableId]
      )
      return this.getTable(tableId)
    })
  }

  deleteTable(tableId: string): boolean {
    const table = this.getTable(tableId)
    return this.mutate(() => {
      this.connection.exec(
        `DROP TABLE ${quoteIdentifier(table.physicalName ?? table.rawTableName)}`
      )
      const result = this.connection.run(
        `DELETE FROM ${EIDOS_FILE_TABLES_TABLE} WHERE id = ?`,
        [tableId]
      )
      return result.changes > 0
    })
  }

  addField(
    tableId: string,
    input: CreateEidosFileFieldInput,
    placement?: EidosFileFieldPlacement
  ): EidosFileFieldInfo {
    const table = this.getTable(tableId)
    assertEidosFileDisplayName(input.name, "Field name")
    const id = input.id ?? this.allocateId()
    assertEidosFileUuid(id, "Field ID")
    const type = canonicalFieldType(input)
    const fields = this.listFields(tableId)
    if (
      fields.some(
        (field) =>
          field.name.replace(/[A-Z]/g, (character) =>
            character.toLowerCase()
          ) ===
          input.name.replace(/[A-Z]/g, (character) => character.toLowerCase())
      )
    ) {
      throw new EidosFileError(
        "constraint-conflict",
        `Duplicate Field name: ${input.name}`
      )
    }
    const physicalName = isVirtualField(type, input)
      ? null
      : eidosFilePhysicalName(
          "field",
          input.name,
          id,
          fields.flatMap((field) =>
            field.physicalName ? [field.physicalName] : []
          )
        )
    const prepared: PreparedField = {
      id,
      name: input.name,
      type,
      physicalName,
      settings: {
        ...presentationSettings(input),
        ...(input.type === "rating" ? { display: { kind: "rating" } } : {}),
      },
      input,
      isRecordLabel: "isRecordLabel" in input && input.isRecordLabel === true,
      systemRole: null,
      nullable:
        input.type === "formula" || input.type === "lookup"
          ? true
          : input.type === "file" ||
              input.type === "multi-select" ||
              input.type === "relation"
            ? false
            : "nullable" in input
              ? input.nullable !== false
              : true,
    }
    if (
      prepared.physicalName &&
      !prepared.nullable &&
      !["file", "multi-select", "relation"].includes(prepared.type) &&
      this.countRows(tableId) > 0
    ) {
      throw new EidosFileError(
        "constraint-conflict",
        "A populated Table cannot add a non-null scalar Field without a default"
      )
    }
    return this.mutate(() => {
      if (prepared.isRecordLabel && prepared.type === "lookup") {
        throw new EidosFileError(
          "invalid-schema",
          "A Lookup cannot be the Record Label Field in Eidos File 1.0"
        )
      }
      const definition = fieldColumnSql(prepared)
      if (definition) {
        this.connection.exec(
          `ALTER TABLE ${quoteIdentifier(table.physicalName ?? table.rawTableName)} ADD COLUMN ${definition}`
        )
      }
      this.insertFieldMetadata(
        tableId,
        prepared,
        fields.length,
        this.operationInstant()
      )
      this.insertFieldSubtypeMetadata(tableId, prepared)
      if (prepared.isRecordLabel) {
        this.connection.run(
          `UPDATE ${EIDOS_FILE_TABLES_TABLE}
              SET label_field_id = ?, updated_at = ? WHERE id = ?`,
          [id, this.operationInstant(), tableId]
        )
      }
      if (type === "relation") this.installRelationTriggers(id)
      if (placement) {
        const view = this.viewRow(placement.viewId)
        const layout = jsonObject(view.layout_json)
        const order = Array.isArray(layout.fieldOrder)
          ? layout.fieldOrder.filter(
              (value): value is string => typeof value === "string"
            )
          : fields.flatMap((field) => (field.id ? [field.id] : []))
        order.splice(
          Math.max(0, Math.min(placement.index, order.length)),
          0,
          id
        )
        layout.fieldOrder = order
        this.connection.run(
          `UPDATE ${EIDOS_FILE_VIEWS_TABLE} SET layout_json = ?, updated_at = ? WHERE id = ?`,
          [canonicalizeEidosFileJson(layout), this.operationInstant(), view.id]
        )
      }
      return this.fieldByKey(tableId, id)
    })
  }

  importField(
    tableId: string,
    input: ImportEidosFileFieldInput
  ): EidosFileFieldInfo {
    if (
      input.type === "formula" ||
      input.type === "lookup" ||
      input.type === "relation"
    ) {
      throw new EidosFileError(
        "invalid-schema",
        "Import derived and Relation Fields through canonical subtype definitions"
      )
    }
    return this.addField(tableId, {
      name: input.name,
      columnName: input.columnName,
      type: input.type as EidosFileSourceFieldType,
      property: input.property ?? undefined,
      storageCodec: input.storageCodec,
    })
  }

  updateField(
    tableId: string,
    fieldKey: string,
    changes: UpdateEidosFileFieldInput
  ): EidosFileFieldInfo {
    const table = this.getTable(tableId)
    const field = this.fieldByKey(tableId, fieldKey)
    const fieldId = field.id
    if (
      changes.type !== undefined &&
      canonicalFieldType({
        type: changes.type,
      } as CreateEidosFileFieldInput) !== field.type
    ) {
      throw new EidosFileError(
        "invalid-schema",
        "Field type conversion requires an explicit canonical conversion operation"
      )
    }
    return this.mutate(() => {
      let name = field.name
      let physicalName: string | null = field.physicalName ?? null
      if (changes.name !== undefined && changes.name !== field.name) {
        name = assertEidosFileDisplayName(changes.name, "Field name")
        const fields = this.listFields(tableId)
        if (
          fields.some(
            (candidate) =>
              candidate.id !== field.id &&
              candidate.name.replace(/[A-Z]/g, (character) =>
                character.toLowerCase()
              ) ===
                name.replace(/[A-Z]/g, (character) => character.toLowerCase())
          )
        ) {
          throw new EidosFileError(
            "constraint-conflict",
            `Duplicate Field name: ${name}`
          )
        }
        if (field.physicalName) {
          physicalName = eidosFilePhysicalName(
            "field",
            name,
            fieldId,
            fields
              .filter((candidate) => candidate.id !== field.id)
              .flatMap((candidate) =>
                candidate.physicalName ? [candidate.physicalName] : []
              )
          )
          if (physicalName !== field.physicalName) {
            this.connection.exec(
              `ALTER TABLE ${quoteIdentifier(table.physicalName ?? table.rawTableName)} RENAME COLUMN ${quoteIdentifier(field.physicalName)} TO ${quoteIdentifier(physicalName)}`
            )
          }
        }
        const formulaRows = this.connection.query<{
          field_id: string
          source_text: string
        }>(
          `SELECT formula.field_id, formula.source_text
             FROM ${EIDOS_FILE_FORMULA_FIELDS_TABLE} formula
             JOIN ${EIDOS_FILE_FIELDS_TABLE} owner ON owner.id = formula.field_id
            WHERE owner.table_id = ?`,
          [tableId]
        )
        for (const formula of formulaRows) {
          const expression = rewriteEidosFileFormulaFieldReferences(
            formula.source_text,
            field.name,
            name
          )
          if (expression !== formula.source_text) {
            this.connection.run(
              `UPDATE ${EIDOS_FILE_FORMULA_FIELDS_TABLE} SET source_text = ? WHERE field_id = ?`,
              [expression, formula.field_id]
            )
          }
        }
      }

      let settings = field.settings ?? {}
      if (changes.property !== undefined) {
        settings = presentationSettingsObject(changes.property)
      }
      if (field.type === "select" || field.type === "multi-select") {
        settings.options = assertEidosFileSelectOptions(settings).map(
          (option) => ({
            color: option.color,
            name: option.name,
          })
        )
      }
      if (changes.optionValueChanges && changes.optionValueChanges.length > 0) {
        if (field.type !== "select" && field.type !== "multi-select") {
          throw new EidosFileError(
            "invalid-schema",
            "Only Select Fields have option values"
          )
        }
        const replacements = new Map(
          changes.optionValueChanges.map((change) => [change.from, change.to])
        )
        for (const [from, to] of replacements) {
          if (field.type === "select") {
            this.connection.run(
              `UPDATE ${quoteIdentifier(table.physicalName ?? table.rawTableName)}
                  SET ${quoteIdentifier(field.physicalName!)} = ?, "_updated_at" = ?
                WHERE ${quoteIdentifier(field.physicalName!)} = ?`,
              [to, this.operationInstant(), from]
            )
          } else {
            this.connection.run(
              `UPDATE ${quoteIdentifier(table.physicalName ?? table.rawTableName)}
                  SET ${quoteIdentifier(field.physicalName!)} = (
                    SELECT json_group_array(value) FROM (
                      SELECT value FROM (
                        SELECT CASE WHEN value = ? THEN ? ELSE value END AS value,
                               CAST(key AS INTEGER) AS position
                          FROM json_each(${quoteIdentifier(field.physicalName!)})
                      ) GROUP BY value ORDER BY min(position)
                    )
                  ), "_updated_at" = ?
                WHERE EXISTS (
                  SELECT 1 FROM json_each(${quoteIdentifier(field.physicalName!)}) WHERE value = ?
                )`,
              [from, to, this.operationInstant(), from]
            )
          }
        }
        for (const view of this.connection.query<ViewRow>(
          `SELECT * FROM ${EIDOS_FILE_VIEWS_TABLE}`
        )) {
          const query = transformOptionValue(
            parseEidosFileJson(view.query_json),
            fieldId,
            replacements
          )
          const layout = transformOptionValue(
            parseEidosFileJson(view.layout_json),
            fieldId,
            replacements
          )
          this.connection.run(
            `UPDATE ${EIDOS_FILE_VIEWS_TABLE} SET query_json = ?, layout_json = ?, updated_at = ? WHERE id = ?`,
            [
              canonicalizeEidosFileJson(query),
              canonicalizeEidosFileJson(layout),
              this.operationInstant(),
              view.id,
            ]
          )
        }
      }

      if (field.type === "formula" && changes.property) {
        const expression = changes.property.formula
        const resultType = changes.property.displayType
        if (typeof expression !== "string" || typeof resultType !== "string") {
          throw new EidosFileError(
            "invalid-schema",
            "Formula requires expression and result type"
          )
        }
        const draft: EidosFileFieldInfo = {
          ...field,
          name,
          physicalName,
          property: {
            ...changes.property,
            formula: expression,
            displayType: resultType,
          },
        }
        compileEidosFileFormula(
          draft,
          this.listFields(tableId).map((candidate) =>
            candidate.id === fieldId ? draft : candidate
          )
        )
        this.connection.run(
          `UPDATE ${EIDOS_FILE_FORMULA_FIELDS_TABLE}
              SET source_text = ?, result_type = ? WHERE field_id = ?`,
          [expression, resultType, fieldId]
        )
      }

      if (field.type === "lookup" && changes.property) {
        const relationKey = changes.property.relationField
        const targetKey = changes.property.targetField
        const aggregate = changes.property.aggregate
        if (
          typeof relationKey !== "string" ||
          typeof targetKey !== "string" ||
          ![
            "first",
            "values",
            "count",
            "sum",
            "average",
            "min",
            "max",
          ].includes(String(aggregate))
        ) {
          throw new EidosFileError(
            "invalid-schema",
            "Lookup requires Relation and target Field IDs"
          )
        }
        const relationField = this.fieldByKey(tableId, relationKey)
        const relation = this.allSchema().relations.get(relationField.id!)
        if (!relation)
          throw new EidosFileError(
            "invalid-schema",
            "Lookup requires a Relation Field"
          )
        const targetField = this.fieldByKey(
          uuid(relation.target_table_id),
          targetKey
        )
        this.connection.run(
          `UPDATE ${EIDOS_FILE_LOOKUP_FIELDS_TABLE}
              SET relation_field_id = ?, target_field_id = ?, aggregate = ?, distinct_values = ?
            WHERE field_id = ?`,
          [
            relationField.id!,
            targetField.id!,
            String(aggregate),
            changes.property.distinct === true ? 1 : 0,
            fieldId,
          ]
        )
      }

      if (field.type === "relation" && changes.property) {
        const current = this.allSchema().relations.get(fieldId)
        if (!current)
          throw new EidosFileError(
            "invalid-schema",
            "Relation subtype is missing"
          )
        const direction = changes.property.direction ?? current.direction
        if (direction !== current.direction) {
          throw new EidosFileError(
            "invalid-schema",
            "Changing Relation direction in place is not supported; create the inverse Field explicitly"
          )
        }
        const targetTableId =
          changes.property.targetTableId ?? uuid(current.target_table_id)
        const sourceFieldId =
          changes.property.sourceFieldId ??
          (current.inverse_of_field_id
            ? uuid(current.inverse_of_field_id)
            : null)
        const cardinality =
          direction === "inverse"
            ? "many"
            : (changes.property.cardinality ?? current.cardinality)
        const onDelete =
          direction === "forward"
            ? (changes.property.onDelete ?? current.on_delete ?? "restrict")
            : null
        if (
          (direction !== "forward" && direction !== "inverse") ||
          typeof targetTableId !== "string" ||
          (cardinality !== "one" && cardinality !== "many") ||
          (onDelete !== null &&
            !["restrict", "detach", "preserve"].includes(String(onDelete)))
        ) {
          throw new EidosFileError(
            "invalid-schema",
            "Invalid Relation definition"
          )
        }
        this.dropRelationTriggers(fieldId)
        this.connection.run(
          `UPDATE ${EIDOS_FILE_RELATION_FIELDS_TABLE}
              SET direction = ?, inverse_of_field_id = ?, target_table_id = ?, cardinality = ?, on_delete = ?
            WHERE field_id = ?`,
          [
            direction,
            sourceFieldId
              ? assertEidosFileUuid(String(sourceFieldId), "Source Field ID")
              : null,
            assertEidosFileUuid(String(targetTableId), "Target Table ID"),
            cardinality,
            onDelete === null ? null : String(onDelete),
            fieldId,
          ]
        )
        this.installRelationTriggers(fieldId)
      }

      const now = this.operationInstant()
      this.connection.run(
        `UPDATE ${EIDOS_FILE_FIELDS_TABLE}
            SET name = ?, physical_name = ?, settings_json = ?, updated_at = ?
          WHERE id = ?`,
        [name, physicalName, canonicalizeEidosFileJson(settings), now, fieldId]
      )
      if (changes.isRecordLabel === true) {
        if (field.type === "lookup") {
          throw new EidosFileError(
            "invalid-schema",
            "A Lookup cannot be the Record Label Field in Eidos File 1.0"
          )
        }
        this.connection.run(
          `UPDATE ${EIDOS_FILE_TABLES_TABLE}
              SET label_field_id = ?, updated_at = ? WHERE id = ?`,
          [fieldId, now, tableId]
        )
      }
      return this.fieldByKey(tableId, fieldId)
    })
  }

  setFieldNullable(fieldId: string, nullable: boolean): EidosFileFieldInfo {
    const field = Array.from(this.allSchema().fields.values()).find(
      (candidate) => candidate.id === fieldId
    )
    if (!field) {
      throw new EidosFileError(
        "field-not-found",
        "Eidos File Field not found: " + fieldId
      )
    }
    if (
      field.systemRole ||
      !field.physicalName ||
      ["file", "multi-select", "relation", "formula", "lookup"].includes(
        field.type
      )
    ) {
      throw new EidosFileError(
        "protected-field",
        "Only stored scalar and JSON Fields have configurable nullability"
      )
    }
    if ((field.nullable ?? true) === nullable) return field
    return this.mutate(() => {
      const table = this.getTable(field.tableId)
      if (!nullable) {
        const nulls =
          this.connection.get<{ count: number | bigint }>(
            "SELECT count(*) AS count FROM " +
              quoteIdentifier(table.physicalName ?? table.rawTableName) +
              " WHERE " +
              quoteIdentifier(field.physicalName!) +
              " IS NULL"
          )?.count ?? 0
        if (BigInt(nulls) > 0n) {
          throw new EidosFileError(
            "constraint-conflict",
            "Existing SQL NULL values block non-nullability"
          )
        }
      }
      this.connection.run(
        "UPDATE " + EIDOS_FILE_FIELDS_TABLE + " SET nullable=? WHERE id=?",
        [nullable ? 1 : 0, fieldId]
      )
      this.rebuildUserTable(field.tableId)
      return this.fieldByKey(field.tableId, fieldId)
    })
  }

  /** @internal Applies a preflighted Runtime 1.0 stored-type conversion. */
  convertStoredField(
    fieldId: string,
    targetType: EidosFileFieldType,
    nullable: boolean,
    rows: readonly {
      id: string
      value: EidosFileSqlPrimitive
      changed: boolean
    }[],
    relation?: {
      targetTableId: string
      cardinality: "one" | "many"
      onDelete: "restrict" | "detach" | "preserve"
    }
  ): EidosFileFieldInfo {
    const field = Array.from(this.allSchema().fields.values()).find(
      (candidate) => candidate.id === fieldId
    )
    if (
      !field ||
      field.systemRole ||
      !field.physicalName ||
      ["formula", "lookup"].includes(field.type) ||
      [
        "formula",
        "lookup",
        "row-id",
        "created-time",
        "last-edited-time",
      ].includes(targetType)
    ) {
      throw new EidosFileError(
        "protected-field",
        "Stored-type conversion requires a writable stored Field"
      )
    }
    if (targetType === "relation" && !relation) {
      throw new EidosFileError(
        "invalid-schema",
        "Relation conversion requires a forward Relation definition"
      )
    }
    const expectedRows = this.countRows(field.tableId)
    if (
      rows.length !== expectedRows ||
      new Set(rows.map((row) => row.id)).size !== rows.length
    ) {
      throw new EidosFileError(
        "stale-revision",
        "Conversion rows no longer match the Table"
      )
    }
    return this.mutate(() => {
      const relationFieldIdsBefore = Array.from(
        this.allSchema().relations.keys()
      )
      for (const relationFieldId of relationFieldIdsBefore) {
        this.dropRelationTriggers(relationFieldId)
      }
      this.connection.run(
        `DELETE FROM ${EIDOS_FILE_RELATION_FIELDS_TABLE} WHERE field_id = ?`,
        [fieldId]
      )
      this.connection.run(
        `UPDATE ${EIDOS_FILE_FIELDS_TABLE}
            SET type = ?, nullable = ? WHERE id = ?`,
        [
          targetType,
          targetType === "file" ||
          targetType === "multi-select" ||
          targetType === "relation"
            ? 0
            : nullable
              ? 1
              : 0,
          fieldId,
        ]
      )
      if (targetType === "relation" && relation) {
        this.connection.run(
          `INSERT INTO ${EIDOS_FILE_RELATION_FIELDS_TABLE}
            (field_id, direction, target_table_id, cardinality, inverse_of_field_id, on_delete)
           VALUES (?, 'forward', ?, ?, NULL, ?)`,
          [
            fieldId,
            assertEidosFileUuid(relation.targetTableId, "Target Table ID"),
            relation.cardinality,
            relation.onDelete,
          ]
        )
      }
      this.schemaCache = undefined
      this.rebuildUserTable(
        field.tableId,
        {
          fieldId,
          rows: new Map(rows.map((row) => [row.id, row])),
        },
        relationFieldIdsBefore
      )
      this.connection.run(
        `UPDATE ${EIDOS_FILE_TABLES_TABLE} SET updated_at = ? WHERE id = ?`,
        [this.operationInstant(), field.tableId]
      )
      return this.fieldByKey(field.tableId, fieldId)
    })
  }

  private rebuildUserTable(
    tableId: string,
    transformed?: {
      fieldId: string
      rows: Map<
        string,
        { id: string; value: EidosFileSqlPrimitive; changed: boolean }
      >
    },
    relationFieldIdsBefore?: string[]
  ): void {
    this.schemaCache = undefined
    const table = this.getTable(tableId)
    const physicalName = table.physicalName ?? table.rawTableName
    const fields = this.listFields(tableId)
    const stored = fields.filter((field) => field.physicalName)
    const definitions = stored.map(
      (field) =>
        fieldColumnSql({
          id: field.id!,
          name: field.name,
          type: field.type,
          physicalName: field.physicalName!,
          settings: field.settings ?? {},
          isRecordLabel: field.isRecordLabel === true,
          systemRole: field.systemRole ?? null,
          nullable: field.nullable ?? false,
        })!
    )
    const temporary = this.transientTableName(
      "t__rebuild__" + tableId.replace(/-/g, "")
    )
    const staging = this.transientTableName(
      "t__rebuild_old__" + tableId.replace(/-/g, "")
    )
    const relationFieldIds = Array.from(
      new Set([
        ...(relationFieldIdsBefore ?? []),
        ...Array.from(this.allSchema().relations.keys()),
      ])
    )
    for (const relationFieldId of relationFieldIds) {
      this.dropRelationTriggers(relationFieldId)
    }
    const organization = this.connection.get<{ sql: string }>(
      "SELECT sql FROM sqlite_schema WHERE type='table' AND name=?",
      [physicalName]
    )?.sql
    const withoutRowid = /\bWITHOUT\s+ROWID\b/i.test(organization ?? "")
    this.connection.exec(
      "CREATE TABLE " +
        quoteIdentifier(temporary) +
        " (" +
        definitions.join(", ") +
        `) STRICT${withoutRowid ? ", WITHOUT ROWID" : ""}`
    )
    const columns = stored.map((field) => quoteIdentifier(field.physicalName!))
    if (transformed) {
      const sourceRows = this.connection.query<
        Record<string, EidosFileSqlPrimitive>
      >(
        `SELECT * FROM ${quoteIdentifier(physicalName)} ORDER BY "_id" COLLATE BINARY`
      )
      const parameterSets = sourceRows.map((row) => {
        const rowId = String(row._id)
        const conversion = transformed.rows.get(rowId)
        if (!conversion) {
          throw new EidosFileError(
            "stale-revision",
            "Conversion row set changed before apply"
          )
        }
        return stored.map((storedField) => {
          if (storedField.id === transformed.fieldId) return conversion.value
          if (storedField.systemRole === "updated-time" && conversion.changed) {
            return this.operationInstant()
          }
          return row[storedField.physicalName!]
        })
      })
      const placeholders = columns.map(() => "?").join(", ")
      const sql = `INSERT INTO ${quoteIdentifier(temporary)} (${columns.join(", ")}) VALUES (${placeholders})`
      if (this.connection.runMany) this.connection.runMany(sql, parameterSets)
      else
        for (const parameters of parameterSets)
          this.connection.run(sql, parameters)
    } else {
      this.connection.exec(
        "INSERT INTO " +
          quoteIdentifier(temporary) +
          " (" +
          columns.join(", ") +
          ") SELECT " +
          columns.join(", ") +
          " FROM " +
          quoteIdentifier(physicalName)
      )
    }
    this.connection.exec(
      `DROP TRIGGER IF EXISTS ${quoteIdentifier(
        `eidos__row_id_immutable__${tableId.replace(/-/g, "")}`
      )}`
    )
    this.connection.exec(
      `ALTER TABLE ${quoteIdentifier(physicalName)} RENAME TO ${quoteIdentifier(staging)}`
    )
    this.connection.exec(
      "ALTER TABLE " +
        quoteIdentifier(temporary) +
        " RENAME TO " +
        quoteIdentifier(physicalName)
    )
    this.connection.exec("DROP TABLE " + quoteIdentifier(staging))
    this.installRowIdTrigger(tableId, physicalName)
    for (const relationFieldId of relationFieldIds) {
      this.installRelationTriggers(relationFieldId)
    }
    this.schemaCache = undefined
  }

  private transientTableName(base: string): string {
    const names = new Set(
      this.connection
        .query<{ name: string }>("SELECT name FROM sqlite_schema")
        .map((row) => row.name)
    )
    if (!names.has(base)) return base
    for (let suffix = 1; suffix < Number.MAX_SAFE_INTEGER; suffix += 1) {
      const candidate = `${base}__${suffix}`
      if (!names.has(candidate)) return candidate
    }
    throw new EidosFileError(
      "resource-limit",
      "No collision-free rebuild Table name is available"
    )
  }

  private removeFieldFromViewLayouts(tableId: string, fieldId: string): void {
    const views = this.connection.query<{
      id: string
      layout_json: string
    }>(
      `SELECT id, layout_json FROM ${EIDOS_FILE_VIEWS_TABLE} WHERE table_id = ?`,
      [tableId]
    )
    for (const view of views) {
      const layout = jsonObject(view.layout_json)
      for (const key of ["cardFields", "fieldOrder", "hiddenFields"] as const) {
        if (Array.isArray(layout[key])) {
          layout[key] = layout[key].filter((value) => value !== fieldId)
        }
      }
      for (const key of ["coverField", "groupField"] as const) {
        if (layout[key] === fieldId) layout[key] = null
      }
      if (
        layout.fieldWidths &&
        typeof layout.fieldWidths === "object" &&
        !Array.isArray(layout.fieldWidths)
      ) {
        const fieldWidths = {
          ...(layout.fieldWidths as Record<string, unknown>),
        }
        delete fieldWidths[fieldId]
        layout.fieldWidths = fieldWidths
      }
      const next = canonicalizeEidosFileJson(layout)
      if (next === view.layout_json) continue
      this.connection.run(
        `UPDATE ${EIDOS_FILE_VIEWS_TABLE}
            SET layout_json = ?, updated_at = ? WHERE id = ?`,
        [next, this.operationInstant(), view.id]
      )
    }
  }

  deleteField(
    tableId: string,
    fieldKey: string,
    replacementRecordLabelFieldId?: string
  ): boolean {
    const table = this.getTable(tableId)
    const field = this.fieldByKey(tableId, fieldKey)
    if (!field.id) return false
    if (field.valueKind === "system") {
      throw new EidosFileError(
        "protected-field",
        "System Fields cannot be deleted"
      )
    }
    if (field.isRecordLabel && !replacementRecordLabelFieldId) {
      throw new EidosFileError(
        "constraint-conflict",
        "Deleting the Record Label Field requires a replacement Field ID"
      )
    }
    const replacement = replacementRecordLabelFieldId
      ? this.fieldByKey(tableId, replacementRecordLabelFieldId)
      : undefined
    if (replacement?.id === field.id) {
      throw new EidosFileError(
        "constraint-conflict",
        "The replacement Record Label Field must be a different Field"
      )
    }
    return this.mutate(() => {
      if (field.isRecordLabel && replacement?.id) {
        this.connection.run(
          `UPDATE ${EIDOS_FILE_TABLES_TABLE}
              SET label_field_id = ?, updated_at = ? WHERE id = ?`,
          [replacement.id, this.operationInstant(), tableId]
        )
      }
      const dependentLookup = this.connection.get<{ field_id: string }>(
        `SELECT field_id FROM ${EIDOS_FILE_LOOKUP_FIELDS_TABLE}
          WHERE relation_field_id = ? OR target_field_id = ? LIMIT 1`,
        [field.id!, field.id!]
      )
      const dependentInverse = this.connection.get<{ field_id: string }>(
        `SELECT field_id FROM ${EIDOS_FILE_RELATION_FIELDS_TABLE}
          WHERE inverse_of_field_id = ? LIMIT 1`,
        [field.id!]
      )
      if (dependentLookup || dependentInverse) {
        throw new EidosFileError(
          "constraint-conflict",
          `Field ${field.name} has structural dependents`
        )
      }
      for (const formula of this.listFields(tableId).filter(
        (candidate) => candidate.type === "formula"
      )) {
        const compiled = compileEidosFileFormula(
          formula,
          this.listFields(tableId)
        )
        if (compiled.dependencyFieldIds.includes(field.id!)) {
          throw new EidosFileError(
            "formula-in-use",
            `Formula ${formula.name} depends on ${field.name}`
          )
        }
      }
      this.removeFieldFromViewLayouts(tableId, field.id!)
      if (field.type === "relation") this.dropRelationTriggers(field.id!)
      if (field.physicalName) {
        this.connection.exec(
          `ALTER TABLE ${quoteIdentifier(table.physicalName ?? table.rawTableName)} DROP COLUMN ${quoteIdentifier(field.physicalName)}`
        )
      }
      const result = this.connection.run(
        `DELETE FROM ${EIDOS_FILE_FIELDS_TABLE} WHERE id = ?`,
        [field.id!]
      )
      return result.changes > 0
    })
  }

  private viewRow(viewId: string): ViewRow {
    const row = this.connection.get<ViewRow>(
      `SELECT * FROM ${EIDOS_FILE_VIEWS_TABLE} WHERE id = ?`,
      [assertEidosFileUuid(viewId, "View ID")]
    )
    if (!row)
      throw new EidosFileError(
        "view-not-found",
        `Eidos File View not found: ${viewId}`
      )
    return row
  }

  private mapView(row: ViewRow): EidosFileViewInfo {
    const tableId = uuid(row.table_id)
    const fields = this.listFields(tableId)
    const query = jsonObject(row.query_json)
    const layout = jsonObject(row.layout_json)
    const storedSorts = normalizeEidosFileSorts(query.sort)
    const fieldIds = new Set(
      fields.flatMap((field) => (field.id ? [field.id] : []))
    )
    const fieldOrder = Array.isArray(layout.fieldOrder)
      ? layout.fieldOrder.flatMap((value) =>
          typeof value === "string" && fieldIds.has(value) ? [value] : []
        )
      : []
    const properties = { ...layout }
    return {
      id: uuid(row.id),
      name: row.name,
      type: row.type,
      tableId,
      query: "",
      properties,
      filter: filterFromStorage(query.filter, fields),
      sorts: storedSorts.filter((sort) => fieldIds.has(sort.field)),
      orderMap: Object.fromEntries(
        fieldOrder.map((fieldId, index) => [fieldId, index])
      ),
      hiddenFields: Array.isArray(layout.hiddenFields)
        ? layout.hiddenFields.flatMap((value) =>
            typeof value === "string" && fieldIds.has(value) ? [value] : []
          )
        : [],
      position: row.position,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  listViews(tableId: string): EidosFileViewInfo[] {
    this.tableRow(tableId)
    return this.connection
      .query<ViewRow>(
        `SELECT * FROM ${EIDOS_FILE_VIEWS_TABLE}
          WHERE table_id = ? ORDER BY position, id`,
        [tableId]
      )
      .map((row) => this.mapView(row))
  }

  createView(
    tableId: string,
    input: CreateEidosFileViewInput
  ): EidosFileViewInfo {
    const fields = this.listFields(tableId)
    const id = input.id ?? this.allocateId()
    const now = this.operationInstant()
    const fieldByKey = new Map<string, string>()
    for (const field of fields) {
      if (!field.id) continue
      fieldByKey.set(field.id, field.id)
      fieldByKey.set(field.tableColumnName, field.id)
    }
    const sorts = normalizeEidosFileSorts(input.sorts).flatMap((sort) => {
      const field = fieldByKey.get(sort.field)
      return field ? [{ ...sort, field }] : []
    })
    const properties = input.properties ?? {}
    const mapFieldList = (value: unknown): string[] =>
      Array.isArray(value)
        ? value.flatMap((key) => {
            const fieldId =
              typeof key === "string" ? fieldByKey.get(key) : undefined
            return fieldId ? [fieldId] : []
          })
        : []
    const hiddenFields = (
      input.hiddenFields ?? mapFieldList(properties.hiddenFields)
    ).flatMap((key) => {
      const id = fieldByKey.get(key)
      return id ? [id] : []
    })
    const orderSource = input.orderMap
      ? Object.entries(input.orderMap)
          .sort((left, right) => left[1] - right[1])
          .map(([key]) => key)
      : Array.isArray(properties.fieldOrder)
        ? properties.fieldOrder.flatMap((key) =>
            typeof key === "string" ? [key] : []
          )
        : systemFieldsLast(fields).flatMap((field) =>
            field.id ? [field.id] : []
          )
    const fieldOrder = orderSource.flatMap((key) => {
      const id = fieldByKey.get(key)
      return id ? [id] : []
    })
    const fieldWidths =
      properties.fieldWidths &&
      typeof properties.fieldWidths === "object" &&
      !Array.isArray(properties.fieldWidths)
        ? Object.fromEntries(
            Object.entries(properties.fieldWidths).flatMap(([key, value]) => {
              const fieldId = fieldByKey.get(key)
              return fieldId &&
                typeof value === "number" &&
                Number.isFinite(value)
                ? [[fieldId, value]]
                : []
            })
          )
        : {}
    const mappedLayoutField = (value: unknown): string | null =>
      typeof value === "string" ? (fieldByKey.get(value) ?? null) : null
    return this.mutate(() => {
      this.connection.run(
        `INSERT INTO ${EIDOS_FILE_VIEWS_TABLE}
          (id, table_id, name, type, query_json, layout_json, position, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          assertEidosFileUuid(id, "View ID"),
          assertEidosFileUuid(tableId, "Table ID"),
          input.name,
          input.type,
          canonicalizeEidosFileJson({
            ...(filterToStorage(input.filter, fields)
              ? { filter: filterToStorage(input.filter, fields) }
              : {}),
            ...(sorts.length > 0 ? { sort: sorts } : {}),
          }),
          canonicalizeEidosFileJson({
            ...properties,
            cardFields: mapFieldList(properties.cardFields),
            coverField: mappedLayoutField(properties.coverField),
            fieldOrder,
            fieldWidths,
            groupField: mappedLayoutField(properties.groupField),
            hiddenFields,
          }),
          stablePosition(input.position, this.listViews(tableId).length),
          now,
          now,
        ]
      )
      return this.mapView(this.viewRow(id))
    })
  }

  updateView(
    viewId: string,
    changes: UpdateEidosFileViewInput
  ): EidosFileViewInfo {
    const current = this.mapView(this.viewRow(viewId))
    const fields = this.listFields(current.tableId)
    const next: CreateEidosFileViewInput = {
      name: changes.name ?? current.name,
      type: changes.type ?? current.type,
      position: changes.position ?? current.position,
      properties:
        changes.properties === undefined
          ? current.properties
          : changes.properties,
      filter: changes.filter === undefined ? current.filter : changes.filter,
      sorts: changes.sorts === undefined ? current.sorts : changes.sorts,
      orderMap:
        changes.orderMap === undefined ? current.orderMap : changes.orderMap,
      hiddenFields:
        changes.hiddenFields === undefined
          ? current.hiddenFields
          : changes.hiddenFields,
    }
    return this.mutate(() => {
      const fieldByKey = new Map(
        fields.flatMap((field) =>
          field.id
            ? [
                [field.tableColumnName, field.id],
                [field.id, field.id],
              ]
            : []
        )
      )
      const sorts = normalizeEidosFileSorts(next.sorts).flatMap((sort) => {
        const id = fieldByKey.get(sort.field)
        return id ? [{ ...sort, field: id }] : []
      })
      const hiddenFields = (next.hiddenFields ?? []).flatMap((key) => {
        const id = fieldByKey.get(key)
        return id ? [id] : []
      })
      const fieldOrder = next.orderMap
        ? Object.entries(next.orderMap)
            .sort((left, right) => left[1] - right[1])
            .flatMap(([key]) => {
              const id = fieldByKey.get(key)
              return id ? [id] : []
            })
        : systemFieldsLast(fields).flatMap((field) =>
            field.id ? [field.id] : []
          )
      const layout = {
        ...(next.properties ?? {}),
        fieldOrder,
        hiddenFields,
      }
      this.connection.run(
        `UPDATE ${EIDOS_FILE_VIEWS_TABLE}
            SET name = ?, type = ?, query_json = ?, layout_json = ?, position = ?, updated_at = ?
          WHERE id = ?`,
        [
          next.name,
          next.type,
          canonicalizeEidosFileJson({
            ...(filterToStorage(next.filter, fields)
              ? { filter: filterToStorage(next.filter, fields) }
              : {}),
            ...(sorts.length ? { sort: sorts } : {}),
          }),
          canonicalizeEidosFileJson(layout),
          stablePosition(next.position, current.position ?? 0),
          this.operationInstant(),
          viewId,
        ]
      )
      return this.mapView(this.viewRow(viewId))
    })
  }

  duplicateView(viewId: string, name?: string): EidosFileViewInfo {
    const view = this.mapView(this.viewRow(viewId))
    return this.createView(view.tableId, {
      name: name ?? `${view.name} copy`,
      type: view.type,
      properties: view.properties,
      filter: view.filter,
      sorts: view.sorts,
      orderMap: view.orderMap,
      hiddenFields: view.hiddenFields,
    })
  }

  deleteView(viewId: string): boolean {
    const view = this.mapView(this.viewRow(viewId))
    if (this.listViews(view.tableId).length <= 1) {
      throw new EidosFileError(
        "protected-view",
        "A Table must retain at least one View"
      )
    }
    return this.mutate(
      () =>
        this.connection.run(
          `DELETE FROM ${EIDOS_FILE_VIEWS_TABLE} WHERE id = ?`,
          [viewId]
        ).changes > 0
    )
  }

  reorderViews(tableId: string, viewIds: string[]): EidosFileViewInfo[] {
    const current = this.listViews(tableId).map((view) => view.id)
    if (
      current.length !== viewIds.length ||
      current.some((id) => !viewIds.includes(id))
    ) {
      throw new EidosFileError(
        "invalid-value",
        "View reorder must contain every View exactly once"
      )
    }
    this.mutate(() => {
      viewIds.forEach((id, position) => {
        this.connection.run(
          `UPDATE ${EIDOS_FILE_VIEWS_TABLE} SET position = ?, updated_at = ? WHERE id = ?`,
          [position, this.operationInstant(), id]
        )
      })
    })
    return this.listViews(tableId)
  }

  private fieldExpression(
    field: EidosFileFieldInfo,
    rowAlias: string,
    schema: RuntimeSchema,
    stack: string[] = []
  ): string {
    if (!field.id) throw new EidosFileError("invalid-schema", "Field has no ID")
    if (stack.includes(field.id)) {
      throw new EidosFileError(
        "dependency-cycle",
        `Dependency cycle: ${[...stack, field.id].join(" → ")}`
      )
    }
    if (field.type === "row-id") return `${rowAlias}."_id"`
    if (field.physicalName)
      return `${rowAlias}.${quoteIdentifier(field.physicalName)}`
    const nextStack = [...stack, field.id]
    const formula = schema.formulas.get(field.id)
    if (formula) {
      const ownerFields = schema.fieldsByTable.get(field.tableId!) ?? []
      const expression = compileEidosFileFormulaSource(
        formula.source_text,
        ownerFields,
        (dependency) =>
          this.fieldExpression(dependency, rowAlias, schema, nextStack),
        formula.result_type
      ).expression
      return canonicalTemporalProjection(expression, formula.result_type)
    }
    const relation = schema.relations.get(field.id)
    if (relation?.direction === "inverse" && relation.inverse_of_field_id) {
      const sourceField = schema.fields.get(uuid(relation.inverse_of_field_id))
      if (!sourceField?.physicalName)
        throw new EidosFileError(
          "invalid-schema",
          "Inverse Relation source is invalid"
        )
      const sourceTable = schema.tables.get(sourceField.tableId!)!
      return `coalesce((
        SELECT json_group_array(source_id) FROM (
          SELECT source."_id" AS source_id
          FROM ${quoteIdentifier(sourceTable.physical_name)} source,
               json_each(source.${quoteIdentifier(sourceField.physicalName)}) item
          WHERE item.value = ${rowAlias}."_id"
          ORDER BY source."_id"
        )
      ), '[]')`
    }
    const lookup = schema.lookups.get(field.id)
    if (lookup)
      return this.lookupExpression(lookup, rowAlias, schema, nextStack)
    throw new EidosFileError(
      "invalid-schema",
      `No logical projection for Field ${field.name}`
    )
  }

  private lookupExpression(
    lookup: LookupRow,
    rowAlias: string,
    schema: RuntimeSchema,
    stack: string[]
  ): string {
    const relationField = schema.fields.get(uuid(lookup.relation_field_id))
    const targetField = schema.fields.get(uuid(lookup.target_field_id))
    if (!relationField || !targetField) {
      throw new EidosFileError(
        "invalid-schema",
        "Lookup references a missing Field"
      )
    }
    const relation = schema.relations.get(relationField.id!)
    if (!relation)
      throw new EidosFileError("invalid-schema", "Lookup relation is invalid")
    const targetTableId = uuid(relation.target_table_id)
    const targetTable = schema.tables.get(targetTableId)
    if (!targetTable || targetField.tableId !== targetTableId) {
      throw new EidosFileError(
        "invalid-schema",
        "Lookup target does not belong to the Relation target Table"
      )
    }
    const targetAlias = `lookup_${stack.length}`
    const relationExpression = this.fieldExpression(
      relationField,
      rowAlias,
      schema,
      stack
    )
    const targetExpression = this.fieldExpression(
      targetField,
      targetAlias,
      schema,
      stack
    )
    const targetIsList =
      targetField.type === "relation" ||
      targetField.type === "multi-select" ||
      targetField.type === "file" ||
      (targetField.type === "lookup" &&
        targetField.property?.aggregate === "values")
    const targetResultType = eidosFileLookupElementType(targetField)
    const base = `
      SELECT CAST(item.key AS INTEGER) AS relation_order,
             ${targetExpression} AS value,
             ${targetExpression} AS typed_value
      FROM json_each(${relationExpression}) item
      JOIN ${quoteIdentifier(targetTable.physical_name)} ${targetAlias}
        ON item.value = ${targetAlias}."_id"
    `
    const flattened = targetIsList
      ? `SELECT relation_order, CAST(flat.key AS INTEGER) AS nested_order,
                flat.value AS value
           FROM (${base}) valueset,
                json_each(CASE WHEN json_valid(valueset.typed_value) THEN valueset.typed_value ELSE '[]' END) flat`
      : `SELECT relation_order, 0 AS nested_order, typed_value AS value FROM (${base})`
    const encoded =
      targetResultType === "integer"
        ? "CASE WHEN value IS NULL THEN NULL ELSE CAST(value AS TEXT) END"
        : targetResultType === "json" || targetResultType === "file-entry"
          ? "CASE WHEN value IS NULL THEN NULL ELSE json(value) END"
          : "value"
    const payload = `(SELECT coalesce(
      json_group_array(
        json_object('v', ${encoded})
        ORDER BY relation_order, nested_order
      ),
      '[]'
    ) FROM (${flattened}))`
    return `eidos_lookup_aggregate(
      ${payload},
      '${lookup.aggregate}',
      ${lookup.distinct_values === 1 ? 1 : 0},
      '${targetResultType}'
    )`
  }

  private relationDisplayExpression(
    field: EidosFileFieldInfo,
    rowAlias: string,
    schema: RuntimeSchema
  ): string {
    const relation = schema.relations.get(field.id!)
    if (!relation) return "'[]'"
    const targetTableId = uuid(relation.target_table_id)
    const targetTable = schema.tables.get(targetTableId)!
    const label = (schema.fieldsByTable.get(targetTableId) ?? []).find(
      (candidate) => candidate.isRecordLabel
    )
    if (!label) return "'[]'"
    const ids = this.fieldExpression(field, rowAlias, schema)
    const labelExpression = this.fieldExpression(
      label,
      "relation_target",
      schema
    )
    return `coalesce((
      SELECT json_group_array(json_object('id', id, 'title', label)) FROM (
        SELECT item.value AS id, ${labelExpression} AS label
        FROM json_each(${ids}) item
        JOIN ${quoteIdentifier(targetTable.physical_name)} relation_target
          ON item.value = relation_target."_id"
        ORDER BY CAST(item.key AS INTEGER)
      )
    ), '[]')`
  }

  private requiredQueryFieldKeys(
    fields: EidosFileFieldInfo[],
    query: EidosFileRowQuery
  ): Set<string> {
    const required = new Set<string>()
    const collectFilter = (
      group: EidosFileFilterGroup | null | undefined
    ): void => {
      if (!group) return
      for (const child of group.children) {
        if (child.type === "group") collectFilter(child)
        else required.add(child.field)
      }
    }
    collectFilter(query.filter)
    for (const sort of query.sorts ?? []) required.add(sort.field)
    if (query.search?.trim()) {
      for (const field of fields) {
        if (
          !field.isHidden &&
          (field.isRecordLabel ||
            field.valueKind === "source" ||
            field.valueKind === "relation" ||
            field.valueKind === "derived")
        ) {
          required.add(field.id)
        }
      }
    }
    return required
  }

  private logicalSource(
    tableId: string,
    requestedKeys?: Iterable<string>,
    includeRecordLabel = true,
    includeRelationDisplays = true
  ): {
    sql: string
    fields: EidosFileFieldInfo[]
    schema: RuntimeSchema
  } {
    const schema = this.allSchema()
    const table = schema.tables.get(tableId)
    if (!table)
      throw new EidosFileError("table-not-found", `Table not found: ${tableId}`)
    const fields = schema.fieldsByTable.get(tableId) ?? []
    const byKey = new Map<string, EidosFileFieldInfo>()
    for (const field of fields) {
      byKey.set(field.id!, field)
      byKey.set(field.tableColumnName, field)
      byKey.set(field.name, field)
    }
    const projected = requestedKeys
      ? new Set(
          [...requestedKeys].flatMap((key) => {
            const field = byKey.get(key)
            return field?.id ? [field.id] : []
          })
        )
      : new Set(fields.flatMap((field) => (field.id ? [field.id] : [])))
    const rowId = fields.find((field) => field.type === "row-id")
    const label = fields.find((field) => field.isRecordLabel)
    if (rowId?.id) projected.add(rowId.id)
    if (includeRecordLabel && label?.id) projected.add(label.id)
    const projections = fields
      .filter((field) => projected.has(field.id!))
      .flatMap((field) => {
        const expression = this.fieldExpression(field, "base", schema)
        const result = [
          `${expression} AS ${quoteIdentifier(field.tableColumnName)}`,
        ]
        if (includeRelationDisplays && field.type === "relation") {
          result.push(
            `${this.relationDisplayExpression(field, "base", schema)} AS ${quoteIdentifier(`${field.tableColumnName}__display`)}`
          )
        }
        return result
      })
    return {
      sql: `SELECT base."_id" AS "__base_rowid", ${projections.join(", ")}
              FROM ${quoteIdentifier(table.physical_name)} base`,
      fields,
      schema,
    }
  }

  private compatibilityQuery(
    tableId: string,
    query: EidosFileRowQuery
  ): EidosFileRowQuery {
    assertEidosFileRowQuery(query)
    const fields = this.listFields(tableId)
    const byKey = new Map<string, string>()
    for (const field of fields) {
      byKey.set(field.tableColumnName, field.tableColumnName)
      byKey.set(field.name, field.tableColumnName)
      if (field.id) byKey.set(field.id, field.tableColumnName)
    }
    const normalized = normalizeEidosFileRowQuery(query)
    const convertFilter = (
      group: EidosFileFilterGroup | null | undefined
    ): EidosFileFilterGroup | null => {
      if (!group) return null
      const children: EidosFileFilterGroup["children"] = []
      for (const child of group.children) {
        if (child.type === "group") {
          const nested = convertFilter(child)
          if (nested) children.push(nested)
        } else {
          const field = byKey.get(child.field)
          if (field) children.push({ ...child, field })
        }
      }
      return { ...group, children }
    }
    return {
      ...normalized,
      filter: convertFilter(normalized.filter),
      sorts: normalized.sorts?.flatMap((sort) => {
        const field = byKey.get(sort.field)
        return field ? [{ ...sort, field }] : []
      }),
    }
  }

  listRows(
    tableId: string,
    options?: { offset?: number; limit?: number; query?: EidosFileRowQuery }
  ): EidosFileRow[]
  listRows(
    tableId: string,
    limit?: number,
    offset?: number,
    query?: EidosFileRowQuery
  ): EidosFileRow[]
  listRows(
    tableId: string,
    optionsOrLimit:
      | { offset?: number; limit?: number; query?: EidosFileRowQuery }
      | number = {},
    legacyOffset = 0,
    legacyQuery: EidosFileRowQuery = {}
  ): EidosFileRow[] {
    const options =
      typeof optionsOrLimit === "number"
        ? { limit: optionsOrLimit, offset: legacyOffset, query: legacyQuery }
        : optionsOrLimit
    return this.getRowPage(
      tableId,
      options.offset ?? 0,
      options.limit ?? 100,
      options.query ?? {}
    ).rows
  }

  getRowPage(
    tableId: string,
    offset: number,
    limit: number,
    query: EidosFileRowQuery = {},
    totalHint?: number,
    cursor?: string,
    projection?: EidosFileRowPageProjection
  ): EidosFileRowPage {
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 10_000
    ) {
      throw new EidosFileError("query-limit", "Invalid Eidos File page bounds")
    }
    const compatibleQuery = this.compatibilityQuery(tableId, query)
    const fields = this.listFields(tableId)
    const requested = projection
      ? new Set([
          ...projection.columns,
          ...(projection.preservedColumns ?? []),
          ...this.requiredQueryFieldKeys(fields, compatibleQuery),
        ])
      : undefined
    const source = this.logicalSource(
      tableId,
      requested,
      projection?.includeRecordLabel !== false,
      projection?.includeRelationDisplays !== false
    )
    const compiled = compileEidosFileRowQuery(source.fields, compatibleQuery)
    const querySignature = canonicalizeEidosFileJson(compatibleQuery)
    const sorts = uniqueSortFields(source.fields, compatibleQuery.sorts)
    const revision = String(this.info().revision ?? 0)
    let effectiveOffset = offset
    let cursorWhere = ""
    let cursorParams: EidosFileSqlPrimitive[] = []
    if (cursor) {
      try {
        const payload = JSON.parse(decodeURIComponent(cursor)) as {
          version: number
          revision: string
          tableId: string
          query: string
          offset: number
          values: unknown[]
          lastId: string
          direction: "forward"
        }
        if (
          payload.version !== 1 ||
          payload.direction !== "forward" ||
          payload.revision !== revision ||
          payload.tableId !== tableId ||
          payload.query !== querySignature ||
          !Array.isArray(payload.values)
        ) {
          throw new Error("cursor binding mismatch")
        }
        effectiveOffset = payload.offset
        const keyset = compileKeysetAfter(
          sorts,
          payload.values.map(decodeCursorSqlValue),
          payload.lastId
        )
        cursorWhere = keyset.sql
        cursorParams = keyset.params
      } catch {
        throw new EidosFileError(
          "invalid-query",
          "Invalid or stale Eidos File cursor"
        )
      }
    }
    const whereSql = cursorWhere
      ? compiled.whereSql
        ? `${compiled.whereSql} AND ${cursorWhere}`
        : `WHERE ${cursorWhere}`
      : compiled.whereSql
    const rawRows = this.connection.query<
      Record<string, EidosFileSqlPrimitive>
    >(
      `WITH logical AS (${source.sql})
         SELECT * FROM logical ${whereSql} ${compiled.orderSql}
         LIMIT ?${cursor ? "" : " OFFSET ?"}`,
      cursor
        ? [...compiled.params, ...cursorParams, limit]
        : [...compiled.params, limit, effectiveOffset]
    )
    const rows = rawRows.map((row) => {
      const mapped: EidosFileRow = {}
      for (const [key, value] of Object.entries(row)) {
        if (key !== "__base_rowid") mapped[key] = rowValue(value)
      }
      if (!projection) return mapped
      const preserved = new Set(["_id", ...(projection.preservedColumns ?? [])])
      const candidates = projection.columns
      const selected = new Set<string>(preserved)
      let count = 0
      for (const key of candidates) {
        const value = mapped[key]
        if (
          projection.omitEmptyFields &&
          (value === null ||
            value === undefined ||
            value === "" ||
            value === "[]")
        )
          continue
        if (
          projection.fieldLimit !== undefined &&
          count >= projection.fieldLimit
        )
          break
        selected.add(key)
        if (`${key}__display` in mapped) selected.add(`${key}__display`)
        count += 1
      }
      return Object.fromEntries(
        Object.entries(mapped).filter(([key]) => selected.has(key))
      )
    })
    const total = totalHint ?? this.countRows(tableId, query)
    const nextOffset = effectiveOffset + rawRows.length
    const lastRawRow = rawRows.at(-1)
    const nextCursor =
      lastRawRow && rawRows.length === limit && nextOffset < total
        ? encodeURIComponent(
            JSON.stringify({
              version: 1,
              revision,
              tableId,
              query: querySignature,
              offset: nextOffset,
              values: sorts.map(({ field }) =>
                encodeCursorSqlValue(cursorSortValue(lastRawRow, field))
              ),
              lastId: String(lastRawRow.__base_rowid),
              direction: "forward",
            })
          )
        : undefined
    return {
      tableId,
      offset: effectiveOffset,
      limit,
      total,
      rows,
      ...(nextCursor ? { nextCursor } : {}),
    }
  }

  getRow(tableId: string, rowId: string): EidosFileRow | null {
    const source = this.logicalSource(tableId)
    const row = this.connection.get<Record<string, EidosFileSqlPrimitive>>(
      `WITH logical AS (${source.sql}) SELECT * FROM logical WHERE "__base_rowid" = ?`,
      [assertEidosFileUuid(rowId, "Row ID")]
    )
    if (!row) return null
    return Object.fromEntries(
      Object.entries(row).flatMap(([key, value]) =>
        key === "__base_rowid" ? [] : [[key, rowValue(value)]]
      )
    )
  }

  queryRows(
    tableId: string,
    options: {
      fields?: string[]
      query?: EidosFileRowQuery
      limit?: number
      offset?: number
      cursor?: string
      resolveRelations?: boolean
    } = {}
  ): { rows: EidosFileLogicalRow[]; nextCursor?: string } {
    const fields = this.listFields(tableId)
    const requested = options.fields
      ? options.fields.map((id) => this.fieldByKey(tableId, id))
      : fields
    const rowIdField = fields.find((field) => field.type === "row-id")!
    const page = this.getRowPage(
      tableId,
      options.offset ?? 0,
      options.limit ?? 100,
      options.query ?? {},
      undefined,
      options.cursor,
      {
        columns: requested.map((field) => field.tableColumnName),
        preservedColumns: [rowIdField.tableColumnName],
        fieldLimit: requested.length,
        includeRecordLabel: false,
        includeRelationDisplays: options.resolveRelations === true,
      }
    )
    const rows = page.rows.map((row) => {
      const logicalFields = Object.fromEntries(
        requested.map((field) => {
          const raw = row[field.tableColumnName]
          let value: EidosFileLogicalValue = raw ?? null
          const resultType =
            field.type === "formula" || field.type === "lookup"
              ? String(field.property?.displayType ?? field.type)
              : field.type
          if (
            typeof raw === "string" &&
            (field.type === "file" ||
              field.type === "multi-select" ||
              field.type === "relation" ||
              (field.type === "lookup" &&
                field.property?.aggregate === "values") ||
              field.type === "json")
          ) {
            if (field.type === "file") {
              try {
                value = decodeEidosFileValues(raw)
              } catch {
                throw new EidosFileError(
                  "invalid-sqlite",
                  `${field.name} contains an invalid stored File value`
                )
              }
            } else {
              value = parseEidosFileJson(raw)
            }
          } else if (resultType === "checkbox" && typeof raw === "number") {
            value = raw === 1
          }
          return [field.id!, value]
        })
      )
      const resolved = options.resolveRelations
        ? Object.fromEntries(
            requested.flatMap((field) => {
              if (field.type !== "relation") return []
              const display = row[`${field.tableColumnName}__display`]
              if (typeof display !== "string") return [[field.id!, []]]
              const parsed = parseEidosFileJson(display)
              if (!Array.isArray(parsed)) return [[field.id!, []]]
              return [
                [
                  field.id!,
                  parsed.flatMap((entry) =>
                    entry &&
                    !Array.isArray(entry) &&
                    typeof entry === "object" &&
                    typeof entry.id === "string"
                      ? [{ id: entry.id, label: entry.title ?? null }]
                      : []
                  ),
                ],
              ]
            })
          )
        : undefined
      return {
        id: String(row[rowIdField.tableColumnName]),
        fields: logicalFields,
        ...(resolved && Object.keys(resolved).length > 0 ? { resolved } : {}),
      }
    })
    return { rows, ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}) }
  }

  /**
   * @internal Exact Runtime aggregate/group scan. One set-based SQL statement
   * returns typed logical inputs in effective query order; the public Runtime
   * remains responsible for aggregate arithmetic and response bounds.
   */
  runtimeScanLogicalRows(
    tableId: string,
    fieldIds: string[],
    query: EidosFileRowQuery
  ): EidosFileLogicalRow[] {
    const compatibleQuery = this.compatibilityQuery(tableId, query)
    const source = this.logicalSource(tableId, fieldIds, false, false)
    const compiled = compileEidosFileRowQuery(source.fields, compatibleQuery)
    const selectedFields = fieldIds.map((fieldId) =>
      this.fieldByKey(tableId, fieldId)
    )
    const encodedValues = selectedFields.map((field) => {
      const column = quoteIdentifier(field.tableColumnName)
      return `json_object(
        'storage', typeof(${column}),
        'value', CASE WHEN typeof(${column})='integer'
                      THEN CAST(${column} AS TEXT) ELSE ${column} END
      )`
    })
    const payload = this.connection.get<{ payload: string }>(
      `WITH logical AS (${source.sql}), ordered AS (
         SELECT * FROM logical ${compiled.whereSql} ${compiled.orderSql}
         LIMIT -1
       )
       SELECT coalesce(
         json_group_array(
           json_object(
             'id', "__base_rowid",
             'values', json_array(${encodedValues.join(", ")})
           )
         ),
         '[]'
       ) AS payload
       FROM ordered`,
      compiled.params
    )?.payload
    const parsed = parseEidosFileJson(payload ?? "[]")
    if (!Array.isArray(parsed)) {
      throw new EidosFileError(
        "invalid-value",
        "Logical aggregate scan returned an invalid payload"
      )
    }
    return parsed.map((entry) => {
      if (!entry || Array.isArray(entry) || typeof entry !== "object") {
        throw new EidosFileError(
          "invalid-value",
          "Logical aggregate scan returned an invalid row"
        )
      }
      const rowId = entry.id
      const rowValues = entry.values
      if (
        typeof rowId !== "string" ||
        !Array.isArray(rowValues) ||
        rowValues.length !== selectedFields.length
      ) {
        throw new EidosFileError(
          "invalid-value",
          "Logical aggregate scan returned an invalid row"
        )
      }
      return {
        id: rowId,
        fields: Object.fromEntries(
          selectedFields.map((field, index) => {
            const wrapped = rowValues[index]
            if (
              !wrapped ||
              Array.isArray(wrapped) ||
              typeof wrapped !== "object"
            ) {
              throw new EidosFileError(
                "invalid-value",
                "Logical aggregate scan returned an invalid value"
              )
            }
            const storage = wrapped.storage
            const value = wrapped.value
            if (storage === "null") return [field.id!, null]
            if (storage === "integer") {
              if (typeof value !== "string") {
                throw new EidosFileError(
                  "invalid-value",
                  "Logical aggregate INTEGER lost precision"
                )
              }
              return [
                field.id!,
                fieldValueTypeForScan(field) === "checkbox"
                  ? value === "1"
                  : fieldValueTypeForScan(field) === "integer"
                    ? BigInt(value)
                    : Number(value),
              ]
            }
            if (storage === "real") return [field.id!, Number(value)]
            if (storage === "text") {
              const logicalType = fieldValueTypeForScan(field)
              if (
                logicalType === "json" ||
                logicalType === "file" ||
                logicalType === "multi-select" ||
                logicalType === "relation" ||
                logicalType === "file-entry" ||
                typeof logicalType === "object"
              ) {
                return [field.id!, parseEidosFileJson(String(value))]
              }
              return [field.id!, String(value)]
            }
            throw new EidosFileError(
              "invalid-value",
              "Logical aggregate scan returned an unsupported storage class"
            )
          })
        ),
      }
    })
  }

  /** @internal Builds the keyset boundary used by the exact Runtime service. */
  createRowCursor(
    tableId: string,
    query: EidosFileRowQuery,
    row: EidosFileLogicalRow
  ): string {
    const compatibleQuery = this.compatibilityQuery(tableId, query)
    const fields = this.listFields(tableId)
    const sorts = uniqueSortFields(fields, compatibleQuery.sorts)
    const values = sorts.map(({ field }) => {
      const value = row.fields[field.id!] ?? null
      return typeof value === "boolean" ? (value ? 1 : 0) : value
    })
    if (
      values.some(
        (value) =>
          value !== null &&
          typeof value !== "string" &&
          typeof value !== "number" &&
          typeof value !== "bigint" &&
          !(value instanceof Uint8Array)
      )
    ) {
      throw new EidosFileError(
        "invalid-query",
        "Sort boundary is not a scalar SQLite value"
      )
    }
    return encodeURIComponent(
      JSON.stringify({
        version: 1,
        revision: String(this.info().revision ?? 0),
        tableId,
        query: canonicalizeEidosFileJson(compatibleQuery),
        offset: 0,
        values: values.map((value) =>
          encodeCursorSqlValue(value as EidosFileSqlPrimitive)
        ),
        lastId: row.id,
        direction: "forward",
      })
    )
  }

  countRows(tableId: string, query: EidosFileRowQuery = {}): number {
    const compatibleQuery = this.compatibilityQuery(tableId, query)
    const fields = this.listFields(tableId)
    const source = this.logicalSource(
      tableId,
      this.requiredQueryFieldKeys(fields, compatibleQuery),
      false,
      false
    )
    const compiled = compileEidosFileRowQuery(source.fields, compatibleQuery)
    return (
      this.connection.get<{ count: number }>(
        `WITH logical AS (${source.sql}) SELECT count(*) AS count FROM logical ${compiled.whereSql}`,
        compiled.params
      )?.count ?? 0
    )
  }

  countRowsByField(
    tableId: string,
    fieldKey: string,
    query: EidosFileRowQuery = {}
  ): EidosFileRowGroupCount[] {
    const field = this.fieldByKey(tableId, fieldKey)
    const compatibleQuery = this.compatibilityQuery(tableId, query)
    const fields = this.listFields(tableId)
    const source = this.logicalSource(
      tableId,
      [field.id!, ...this.requiredQueryFieldKeys(fields, compatibleQuery)],
      false,
      false
    )
    const compiled = compileEidosFileRowQuery(source.fields, compatibleQuery)
    const column = quoteIdentifier(field.tableColumnName)
    if (
      field.storageCodec === "json_array" ||
      field.storageCodec === "relation"
    ) {
      return this.connection.query<{
        value: EidosFileSqlPrimitive
        total: number
      }>(
        `WITH logical AS (${source.sql}), filtered AS (
           SELECT * FROM logical ${compiled.whereSql}
         )
         SELECT item.value AS value, count(*) AS total
         FROM filtered, json_each(filtered.${column}) item
         GROUP BY item.value ORDER BY total DESC, item.value`,
        compiled.params
      )
    }
    return this.connection.query<{
      value: EidosFileSqlPrimitive
      total: number
    }>(
      `WITH logical AS (${source.sql})
       SELECT ${column} AS value, count(*) AS total FROM logical
       ${compiled.whereSql} GROUP BY ${column} ORDER BY total DESC, ${column}`,
      compiled.params
    )
  }

  calculateColumnStats(
    tableId: string,
    configs: EidosFileColumnStatConfig[],
    query: EidosFileRowQuery = {}
  ): EidosFileColumnStatResult[] {
    const compatibleQuery = this.compatibilityQuery(tableId, query)
    const fields = this.listFields(tableId)
    configs = normalizeEidosFileColumnStatConfigs(configs, fields)
    const source = this.logicalSource(
      tableId,
      [
        ...configs.map((config) => config.fieldId),
        ...this.requiredQueryFieldKeys(fields, compatibleQuery),
      ],
      false,
      false
    )
    const compiled = compileEidosFileRowQuery(source.fields, compatibleQuery)
    return configs.map((config) => {
      const field = this.fieldByKey(tableId, config.fieldId)
      const column = quoteIdentifier(field.tableColumnName)
      const list =
        field.storageCodec === "json_array" || field.storageCodec === "relation"
      if (config.type.startsWith("relation-") && field.type !== "relation") {
        throw new EidosFileError(
          "invalid-query",
          `${config.type} requires a Relation Field`
        )
      }
      const flattened = `(SELECT item.value AS value, item.type AS value_type
          FROM filtered, json_each(filtered.${column}) item
         WHERE item.value IS NOT NULL)`
      const expression = {
        "count-all": "count(*)",
        "count-non-null": list ? "count(*)" : `count(${column})`,
        "count-empty": `sum(CASE WHEN ${column} IS NULL${list ? ` OR json_array_length(${column}) = 0` : ""} THEN 1 ELSE 0 END)`,
        "count-distinct": list
          ? `(SELECT count(DISTINCT value_type || ':' || json_quote(value)) FROM ${flattened})`
          : `count(DISTINCT ${column})`,
        sum: list
          ? `(SELECT sum(value) FROM ${flattened} WHERE value_type IN ('integer','real'))`
          : `sum(${column})`,
        average: list
          ? `(SELECT avg(value) FROM ${flattened} WHERE value_type IN ('integer','real'))`
          : `avg(${column})`,
        min: list ? `(SELECT min(value) FROM ${flattened})` : `min(${column})`,
        max: list ? `(SELECT max(value) FROM ${flattened})` : `max(${column})`,
        "relation-value-count": `sum(json_array_length(${column}))`,
        "relation-row-count": `sum(CASE WHEN json_array_length(${column}) > 0 THEN 1 ELSE 0 END)`,
        "relation-distinct-target-count": `(SELECT count(DISTINCT value) FROM ${flattened} WHERE value_type = 'text')`,
      }[config.type]
      if (!expression) {
        throw new EidosFileError(
          "invalid-query",
          `Unsupported statistic: ${config.type}`
        )
      }
      const value =
        this.connection.get<{ value: number | string | null }>(
          `WITH logical AS (${source.sql}), filtered AS (
           SELECT * FROM logical ${compiled.whereSql}
         ) SELECT ${expression} AS value FROM filtered`,
          compiled.params
        )?.value ?? null
      return { ...config, value }
    })
  }

  aggregate(
    tableId: string,
    configs: EidosFileColumnStatConfig[],
    query: EidosFileRowQuery = {}
  ): EidosFileColumnStatResult[] {
    return this.calculateColumnStats(tableId, configs, query)
  }

  private normalizeStoredValue(
    field: EidosFileFieldInfo,
    value: EidosFileRow[string],
    allowUnresolvedRelations: boolean
  ): EidosFileSqlPrimitive {
    if (value === null || value === undefined) {
      if (
        field.type === "file" ||
        field.type === "multi-select" ||
        field.type === "relation"
      )
        return "[]"
      return null
    }
    if (field.type === "checkbox") {
      if (value === true || value === 1) return 1
      if (value === false || value === 0) return 0
      throw new EidosFileError(
        "invalid-value",
        `${field.name} must be boolean or NULL`
      )
    }
    if (field.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new EidosFileError(
          "invalid-value",
          `${field.name} must be finite number or NULL`
        )
      }
      return value
    }
    if (field.type === "date") {
      if (typeof value !== "string") {
        throw new EidosFileError(
          "invalid-value",
          `${field.name} must be canonical YYYY-MM-DD text or NULL`
        )
      }
      return normalizeEidosFileDate(value, field.name)
    }
    if (field.type === "datetime") {
      if (typeof value !== "string") {
        throw new EidosFileError(
          "invalid-value",
          `${field.name} must be RFC 3339 text or NULL`
        )
      }
      return normalizeEidosFileInstant(value, field.name)
    }
    if (["integer", "rating"].includes(field.type)) {
      if (typeof value !== "number" && typeof value !== "bigint") {
        throw new EidosFileError(
          "invalid-value",
          `${field.name} must be an integer or NULL`
        )
      }
      const integer =
        typeof value === "bigint"
          ? value >= -9_223_372_036_854_775_808n &&
            value <= 9_223_372_036_854_775_807n
          : typeof value === "number" && Number.isSafeInteger(value)
      if (!integer) {
        throw new EidosFileError(
          "invalid-value",
          `${field.name} must be an integer or NULL`
        )
      }
      if (field.type === "rating") {
        const maximum =
          typeof field.settings?.max === "number" ? field.settings.max : 5
        if (typeof value !== "number" || value < 0 || value > maximum) {
          throw new EidosFileError(
            "invalid-value",
            `${field.name} must be between 0 and ${maximum}`
          )
        }
      }
      return value
    }
    if (
      field.type === "select" ||
      field.type === "text" ||
      field.type === "url"
    ) {
      if (typeof value !== "string") {
        throw new EidosFileError(
          "invalid-value",
          `${field.name} must be text or NULL`
        )
      }
      return value
    }
    if (field.type === "json") {
      const text =
        typeof value === "string" ? value : canonicalizeEidosFileJson(value)
      return canonicalizeEidosFileJson(parseEidosFileJson(text))
    }
    if (field.type === "multi-select") {
      const parsed =
        typeof value === "string" ? parseEidosFileJson(value) : value
      if (
        !Array.isArray(parsed) ||
        !parsed.every((entry) => typeof entry === "string") ||
        new Set(parsed).size !== parsed.length
      ) {
        throw new EidosFileError(
          "invalid-value",
          `${field.name} must be a unique string array`
        )
      }
      return canonicalizeEidosFileJson(parsed)
    }
    if (field.type === "file") {
      return typeof value === "string"
        ? canonicalizeEidosFileJson(decodeEidosFileValues(value))
        : canonicalizeEidosFileJson(assertEidosFileValues(value))
    }
    if (field.type === "relation") {
      const ids = Array.isArray(value)
        ? value.map(String)
        : decodeEidosFileRelationIds(
            typeof value === "string" ? value : undefined
          )
      const encoded = encodeEidosFileRelationIds(ids)
      const schema = this.allSchema()
      const relation = schema.relations.get(field.id!)
      if (!relation || relation.direction !== "forward") {
        throw new EidosFileError(
          "invalid-value",
          "Inverse Relations are read-only"
        )
      }
      if (relation.cardinality === "one" && ids.length > 1) {
        throw new EidosFileError(
          "invalid-value",
          `${field.name} accepts at most one target`
        )
      }
      if (!allowUnresolvedRelations && ids.length > 0) {
        const target = schema.tables.get(uuid(relation.target_table_id))!
        const placeholders = ids.map(() => "?").join(", ")
        const count =
          this.connection.get<{ count: number }>(
            `SELECT count(*) AS count FROM ${quoteIdentifier(target.physical_name)}
            WHERE "_id" IN (${placeholders})`,
            ids
          )?.count ?? 0
        if (count !== ids.length) {
          throw new EidosFileError(
            "invalid-value",
            `${field.name} contains a missing target Row ID`
          )
        }
      }
      return encoded
    }
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "bigint"
    ) {
      return value
    }
    throw new EidosFileError(
      "invalid-value",
      `Unsupported value for ${field.name}`
    )
  }

  private rowChanges(
    tableId: string,
    row: EidosFileRow,
    allowUnresolvedRelations: boolean
  ): Array<{ field: EidosFileFieldInfo; value: EidosFileSqlPrimitive }> {
    const changes: Array<{
      field: EidosFileFieldInfo
      value: EidosFileSqlPrimitive
    }> = []
    for (const [key, value] of Object.entries(row)) {
      if (key === "_id" || key === "id" || key.endsWith("__display")) continue
      const field = this.fieldByKey(tableId, key)
      if (!field.physicalName || field.valueKind === "system") {
        throw new EidosFileError(
          "protected-field",
          `Field ${field.name} is read-only`
        )
      }
      changes.push({
        field,
        value: this.normalizeStoredValue(
          field,
          value,
          allowUnresolvedRelations
        ),
      })
    }
    return changes
  }

  private insertRowInTransaction(
    tableId: string,
    row: EidosFileRow,
    allowUnresolvedRelations: boolean
  ): string {
    const table = this.getTable(tableId)
    const requestedId = row._id ?? row.id
    const rowId =
      typeof requestedId === "string"
        ? assertEidosFileUuid(requestedId, "Row ID")
        : this.allocateId()
    const now = this.operationInstant()
    const changes = this.rowChanges(tableId, row, allowUnresolvedRelations)
    const columns = [
      "_id",
      "_created_at",
      "_updated_at",
      ...changes.map((change) => change.field.physicalName!),
    ]
    const values: EidosFileSqlPrimitive[] = [
      rowId,
      now,
      now,
      ...changes.map((change) => change.value),
    ]
    this.connection.run(
      `INSERT INTO ${quoteIdentifier(table.physicalName ?? table.rawTableName)}
        (${columns.map(quoteIdentifier).join(", ")})
       VALUES (${values.map(() => "?").join(", ")})`,
      values
    )
    return rowId
  }

  insertRow(tableId: string, row: EidosFileRow): EidosFileRow {
    const id = this.mutate(() =>
      this.insertRowInTransaction(tableId, row, true)
    )
    return this.getRow(tableId, id)!
  }

  insertImportedRow(tableId: string, row: EidosFileRow): EidosFileRow {
    const id = this.mutate(() =>
      this.insertRowInTransaction(tableId, row, true)
    )
    return this.getRow(tableId, id)!
  }

  insertImportedRows(tableId: string, rows: EidosFileRow[]): EidosFileRow[] {
    const ids = this.mutate(() =>
      rows.map((row) => this.insertRowInTransaction(tableId, row, true))
    )
    return ids.map((id) => this.getRow(tableId, id)!)
  }

  /** @internal Appends rows inside a caller-owned import transaction. */
  appendImportedRows(tableId: string, rows: EidosFileRow[]): void {
    rows.forEach((row) => this.insertRowInTransaction(tableId, row, true))
  }

  /** @internal Used by the transactional CSV interchange layer. */
  importTable(
    table: CreateEidosFileTableInput,
    rows: EidosFileRow[]
  ): EidosFileTableInfo {
    return this.mutate(() => {
      const created = this.createTable(table)
      rows.forEach((row) => this.insertRowInTransaction(created.id, row, true))
      return created
    })
  }

  updateRow(
    tableId: string,
    rowId: string,
    changes: EidosFileRow
  ): EidosFileRow {
    return this.updateRows(tableId, [{ rowId, changes }])[0]!
  }

  updateRows(tableId: string, updates: EidosFileRowUpdate[]): EidosFileRow[] {
    const table = this.getTable(tableId)
    const ids = this.mutate(() => {
      for (const update of updates) {
        const rowId = assertEidosFileUuid(update.rowId, "Row ID")
        const changes = this.rowChanges(tableId, update.changes, true)
        if (changes.length === 0) continue
        const assignments = [
          ...changes.map(
            (change) => `${quoteIdentifier(change.field.physicalName!)} = ?`
          ),
          `"_updated_at" = ?`,
        ]
        const result = this.connection.run(
          `UPDATE ${quoteIdentifier(table.physicalName ?? table.rawTableName)}
              SET ${assignments.join(", ")} WHERE "_id" = ?`,
          [
            ...changes.map((change) => change.value),
            this.operationInstant(),
            rowId,
          ]
        )
        if (result.changes === 0) {
          throw new EidosFileError(
            "row-not-found",
            `Eidos File Row not found: ${rowId}`
          )
        }
      }
      return updates.map((update) => update.rowId)
    })
    return ids.map((id) => this.getRow(tableId, id)!)
  }

  deleteRow(tableId: string, rowId: string): boolean {
    return this.deleteRows(tableId, [rowId]).length === 1
  }

  deleteRows(tableId: string, rowIds: string[]): string[] {
    if (rowIds.length === 0) return []
    const ids = Array.from(
      new Set(rowIds.map((id) => assertEidosFileUuid(id, "Row ID")))
    )
    if (ids.length > 500) {
      throw new EidosFileError(
        "resource-limit",
        "deleteRows accepts at most 500 Row IDs"
      )
    }
    return this.mutateRows({ tableId, delete: ids }).deleted
  }

  deleteRowRanges(
    tableId: string,
    ranges: EidosFileRowRange[],
    query: EidosFileRowQuery = {}
  ): number {
    const rowIdField = this.listFields(tableId).find(
      (field) => field.type === "row-id"
    )!
    const ids = ranges.flatMap((range) => {
      const start = Math.max(0, Math.trunc(range.startIndex))
      const end = Math.max(start, Math.trunc(range.endIndex))
      return this.getRowPage(
        tableId,
        start,
        end - start + 1,
        query
      ).rows.flatMap((row) => {
        const id = row[rowIdField.tableColumnName]
        return typeof id === "string" ? [id] : []
      })
    })
    return this.deleteRows(tableId, ids).length
  }

  previewFormula(
    tableId: string,
    input: EidosFileFormulaPreviewInput
  ): EidosFileFormulaPreview {
    const fields = this.listFields(tableId)
    const draft: EidosFileFieldInfo = {
      id: this.allocateId(),
      tableId,
      name: input.name,
      type: "formula",
      tableName: this.getTable(tableId).rawTableName,
      tableColumnName: input.columnName,
      physicalName: null,
      isRecordLabel: false,
      position: fields.length,
      settings: {},
      property: { formula: input.formula, displayType: input.displayType },
      storageCodec: "scalar",
      valueKind: "derived",
      isHidden: false,
      isDerived: true,
      sourceTableColumnName: null,
      dependsOn: null,
    }
    const compiled = compileEidosFileFormula(draft, fields)
    const schema = this.allSchema()
    const expression = compileEidosFileFormulaSource(
      input.formula,
      fields,
      (dependency) => this.fieldExpression(dependency, "base", schema),
      input.displayType
    ).expression
    const sampleExpression = canonicalTemporalProjection(
      expression,
      input.displayType
    )
    const table = this.getTable(tableId)
    const label = fields.find((field) => field.isRecordLabel)!
    const samples = this.connection.query<{
      row_id: string
      title: EidosFileSqlPrimitive
      value: EidosFileSqlPrimitive
    }>(
      `SELECT base."_id" AS row_id,
              ${this.fieldExpression(label, "base", schema)} AS title,
              ${sampleExpression} AS value
         FROM ${quoteIdentifier(table.physicalName ?? table.rawTableName)} base
        ORDER BY base."_id" LIMIT 5`
    )
    return {
      expression,
      dependencies: compiled.dependencyFieldIds.map((id) => {
        const field = fields.find((candidate) => candidate.id === id)!
        return { name: field.name, columnName: field.tableColumnName }
      }),
      samples: samples.map((sample) => ({
        rowId: sample.row_id,
        title: sample.title === null ? null : String(sample.title),
        value: rowValue(sample.value),
      })),
    }
  }

  optimizeViewQueries(): void {
    // Optional indexes are generated state. The 1.0 Runtime currently relies
    // on SQLite query planning and never persists a second multivalue source.
  }

  schema(tableId?: string) {
    const tables = tableId ? [this.getTable(tableId)] : this.listTables()
    return tables.map((table) => ({
      table,
      fields: this.listFields(table.id),
      views: this.listViews(table.id),
    }))
  }

  mutateSchema(
    operations: EidosFileSchemaMutation[],
    expectedRevision?: number | bigint
  ): { revision: number | bigint; results: unknown[] } {
    if (operations.length === 0) {
      throw new EidosFileError(
        "invalid-value",
        "mutateSchema requires at least one operation"
      )
    }
    const results = this.mutate(
      () =>
        operations.map((operation) => {
          switch (operation.type) {
            case "create-table":
              return this.createTable(operation.table)
            case "update-table":
              return this.updateTable(operation.tableId, operation.changes)
            case "delete-table":
              return this.deleteTable(operation.tableId)
            case "add-field":
              return this.addField(operation.tableId, operation.field)
            case "update-field":
              return this.updateField(
                operation.tableId,
                operation.fieldId,
                operation.changes
              )
            case "delete-field":
              return this.deleteField(operation.tableId, operation.fieldId)
            case "create-view":
              return this.createView(operation.tableId, operation.view)
            case "update-view":
              return this.updateView(operation.viewId, operation.changes)
            case "delete-view":
              return this.deleteView(operation.viewId)
          }
        }),
      expectedRevision
    )
    return { revision: this.info().revision ?? 0, results }
  }

  private logicalMutationFields(
    tableId: string,
    fields: Record<string, EidosFileLogicalValue>,
    id?: string
  ): EidosFileRow {
    const row: Record<string, EidosFileLogicalValue> = id ? { _id: id } : {}
    for (const [fieldId, value] of Object.entries(fields)) {
      const field = this.fieldByKey(tableId, fieldId)
      if (
        field.isDerived ||
        (field.valueKind === "system" && field.type !== "row-id")
      ) {
        throw new EidosFileError(
          "invalid-value",
          `Field ${field.name} is read-only`
        )
      }
      row[field.id!] = value
    }
    return row as unknown as EidosFileRow
  }

  mutateRows(input: EidosFileRowsMutation): {
    revision: number | bigint
    rows: EidosFileLogicalRow[]
    deleted: string[]
    /** @internal Exact Runtime affected-row composition, including detach. */
    affected?: Array<{ tableId: string; rowId: string }>
  } {
    const operationCount =
      (input.insert?.length ?? 0) +
      (input.update?.length ?? 0) +
      (input.delete?.length ?? 0)
    if (operationCount === 0) {
      throw new EidosFileError(
        "invalid-value",
        "mutateRows requires at least one operation"
      )
    }
    if (operationCount > 500) {
      throw new EidosFileError(
        "resource-limit",
        "mutateRows accepts at most 500 row operations per atomic batch"
      )
    }
    const table = this.getTable(input.tableId)
    const result = this.mutate(() => {
      const operationInstant = this.operationInstant()
      const deleteIds = (input.delete ?? []).map((id) =>
        assertEidosFileUuid(id, "Row ID")
      )
      const deleteSet = new Set(deleteIds)
      if (deleteSet.size !== deleteIds.length) {
        throw new EidosFileError(
          "invalid-value",
          "A Row ID may occur only once in one mutation"
        )
      }
      for (const rowId of deleteIds) {
        const exists = this.connection.get<{ present: number }>(
          `SELECT 1 AS present FROM ${quoteIdentifier(table.physicalName ?? table.rawTableName)} WHERE "_id" = ?`,
          [rowId]
        )
        if (!exists) {
          throw new EidosFileError("row-not-found", `Row not found: ${rowId}`)
        }
      }

      const preparedUpdates = (input.update ?? []).map((update) => {
        const rowId = assertEidosFileUuid(update.id, "Row ID")
        const requestedChanges = this.rowChanges(
          input.tableId,
          this.logicalMutationFields(input.tableId, update.fields),
          false
        )
        const current = this.connection.get<
          Record<string, EidosFileSqlPrimitive>
        >(
          `SELECT * FROM ${quoteIdentifier(table.physicalName ?? table.rawTableName)} WHERE "_id" = ?`,
          [rowId]
        )
        if (!current) {
          throw new EidosFileError("row-not-found", `Row not found: ${rowId}`)
        }
        const changes = requestedChanges.filter(
          (change) =>
            !sameSqlValue(current[change.field.physicalName!], change.value)
        )
        return { rowId, requestedChanges, changes }
      })

      type DetachAction = {
        tableId: string
        physicalTable: string
        physicalColumn: string
        rowId: string
        value: string
      }
      const detachActions: DetachAction[] = []
      if (deleteSet.size > 0) {
        const schema = this.allSchema()
        const proposedRelationValues = new Map<string, EidosFileSqlPrimitive>()
        for (const update of preparedUpdates) {
          for (const change of update.requestedChanges) {
            if (change.field.type === "relation") {
              proposedRelationValues.set(
                `${update.rowId}\u0000${change.field.id}`,
                change.value
              )
            }
          }
        }
        for (const [fieldId, relation] of schema.relations) {
          if (
            relation.direction !== "forward" ||
            uuid(relation.target_table_id) !== input.tableId ||
            relation.on_delete === "preserve"
          ) {
            continue
          }
          const field = Array.from(schema.fieldsByTable.values())
            .flat()
            .find((candidate) => candidate.id === fieldId)
          if (!field?.tableId || !field.physicalName) continue
          const sourceTable = schema.tables.get(field.tableId)
          if (!sourceTable) continue
          const sourceRows = this.connection.query<{
            _id: string
            relation_value: string
          }>(
            `SELECT "_id", ${quoteIdentifier(field.physicalName)} AS relation_value FROM ${quoteIdentifier(sourceTable.physical_name)} ORDER BY "_id" COLLATE BINARY`
          )
          for (const sourceRow of sourceRows) {
            if (
              field.tableId === input.tableId &&
              deleteSet.has(sourceRow._id)
            ) {
              continue
            }
            const proposed = proposedRelationValues.get(
              `${sourceRow._id}\u0000${fieldId}`
            )
            const raw = proposed ?? sourceRow.relation_value
            if (typeof raw !== "string") {
              throw new EidosFileError(
                "invalid-value",
                `Relation ${fieldId} has a non-text stored value`
              )
            }
            const parsed = parseEidosFileJson(raw)
            if (!Array.isArray(parsed)) {
              throw new EidosFileError(
                "invalid-value",
                `Relation ${fieldId} has a non-array stored value`
              )
            }
            const referenced = parsed.some(
              (entry) => typeof entry === "string" && deleteSet.has(entry)
            )
            if (!referenced) continue
            if (relation.on_delete === "restrict") {
              throw new EidosFileError(
                "constraint-conflict",
                `Relation ${fieldId} restricts deletion of a referenced Row`
              )
            }
            const survivors = parsed.filter(
              (entry) => typeof entry !== "string" || !deleteSet.has(entry)
            )
            detachActions.push({
              tableId: field.tableId,
              physicalTable: sourceTable.physical_name,
              physicalColumn: field.physicalName,
              rowId: sourceRow._id,
              value: canonicalizeEidosFileJson(survivors),
            })
          }
        }
      }

      const inserted = (input.insert ?? []).map((row) =>
        this.insertRowInTransaction(
          input.tableId,
          this.logicalMutationFields(input.tableId, row.fields, row.id),
          false
        )
      )
      const changedUpdates: string[] = []
      for (const { rowId, changes } of preparedUpdates) {
        if (changes.length === 0) continue
        const response = this.connection.run(
          `UPDATE ${quoteIdentifier(table.physicalName ?? table.rawTableName)}
              SET ${changes.map((change) => `${quoteIdentifier(change.field.physicalName!)} = ?`).join(", ")},
                  "_updated_at" = ?
            WHERE "_id" = ?`,
          [...changes.map((change) => change.value), operationInstant, rowId]
        )
        if (response.changes === 0)
          throw new EidosFileError("row-not-found", `Row not found: ${rowId}`)
        changedUpdates.push(rowId)
      }
      for (const detach of detachActions) {
        const response = this.connection.run(
          `UPDATE ${quoteIdentifier(detach.physicalTable)}
              SET ${quoteIdentifier(detach.physicalColumn)} = ?, "_updated_at" = ?
            WHERE "_id" = ? AND ${quoteIdentifier(detach.physicalColumn)} IS NOT ?`,
          [detach.value, operationInstant, detach.rowId, detach.value]
        )
        if (response.changes === 0) {
          throw new EidosFileError(
            "stale-revision",
            "Relation source changed during composed delete"
          )
        }
      }

      // Deleted source rows are excluded from incoming policy checks. Clearing
      // their outgoing arrays prevents the portable single-row safety triggers
      // from reintroducing order-dependent behavior during the physical delete.
      if (deleteSet.size > 0) {
        const schema = this.allSchema()
        const outgoing = (schema.fieldsByTable.get(input.tableId) ?? []).filter(
          (field) =>
            field.type === "relation" &&
            field.physicalName &&
            schema.relations.get(field.id!)?.direction === "forward"
        )
        for (const field of outgoing) {
          this.connection.run(
            `UPDATE ${quoteIdentifier(table.physicalName ?? table.rawTableName)} SET ${quoteIdentifier(field.physicalName!)} = '[]' WHERE "_id" IN (${deleteIds.map(() => "?").join(",")})`,
            deleteIds
          )
        }
      }
      const deleted: string[] = []
      for (const rowId of deleteIds) {
        const response = this.connection.run(
          `DELETE FROM ${quoteIdentifier(table.physicalName ?? table.rawTableName)} WHERE "_id" = ?`,
          [rowId]
        )
        if (response.changes) deleted.push(rowId)
      }
      return {
        inserted,
        updated: preparedUpdates.map(({ rowId }) => rowId),
        deleted,
        affected: [
          ...inserted.map((rowId) => ({ tableId: input.tableId, rowId })),
          ...changedUpdates.map((rowId) => ({ tableId: input.tableId, rowId })),
          ...deleted.map((rowId) => ({ tableId: input.tableId, rowId })),
          ...detachActions.map(({ tableId, rowId }) => ({ tableId, rowId })),
        ],
      }
    }, input.expectedRevision)
    const requestedIds = [...new Set([...result.inserted, ...result.updated])]
    const rowIdField = this.listFields(input.tableId).find(
      (field) => field.type === "row-id"
    )!
    const queried =
      requestedIds.length === 0
        ? []
        : this.queryRows(input.tableId, {
            query: {
              filter: {
                type: "group",
                conjunction: "and",
                children: [
                  {
                    type: "rule",
                    field: rowIdField.id!,
                    operator: "is-any-of",
                    value: requestedIds,
                  },
                ],
              },
            },
            limit: requestedIds.length,
          }).rows
    const rowsById = new Map(queried.map((row) => [row.id, row]))
    return {
      revision: this.info().revision ?? 0,
      rows: requestedIds.flatMap((id) => {
        const row = rowsById.get(id)
        return row ? [row] : []
      }),
      deleted: result.deleted,
      affected: Array.from(
        new Map(
          result.affected.map((entry) => [
            `${entry.tableId}\u0000${entry.rowId}`,
            entry,
          ])
        ).values()
      ).sort((left, right) =>
        left.tableId === right.tableId
          ? left.rowId < right.rowId
            ? -1
            : left.rowId > right.rowId
              ? 1
              : 0
          : left.tableId < right.tableId
            ? -1
            : 1
      ),
    }
  }
}

function fieldValueTypeForScan(
  field: EidosFileFieldInfo
): string | { kind: "list"; element: string } {
  if (field.systemRole === "row-id") return "row-id"
  if (
    field.systemRole === "created-time" ||
    field.systemRole === "updated-time"
  ) {
    return "datetime"
  }
  if (field.type === "lookup" && field.property?.aggregate === "values") {
    const display = String(field.property?.displayType ?? "text")
    return {
      kind: "list",
      element:
        display === "file"
          ? "file-entry"
          : display === "relation"
            ? "row-id"
            : display === "multi-select"
              ? "select"
              : display,
    }
  }
  if (field.type === "formula" || field.type === "lookup") {
    const display = String(field.property?.displayType ?? "text")
    return display === "file" ? "file-entry" : display
  }
  return field.type
}
