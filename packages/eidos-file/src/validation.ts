import type { EidosFileConnection, EidosFileSqlPrimitive } from "./connection"
import {
  EIDOS_FILE_APPLICATION_ID,
  EIDOS_FILE_FEATURES_TABLE,
  EIDOS_FILE_FIELDS_TABLE,
  EIDOS_FILE_FORMAT,
  EIDOS_FILE_FORMAT_VERSION,
  EIDOS_FILE_FORMULA_FIELDS_TABLE,
  EIDOS_FILE_LOOKUP_FIELDS_TABLE,
  EIDOS_FILE_META_TABLE,
  EIDOS_FILE_RELATION_FIELDS_TABLE,
  EIDOS_FILE_REQUIRED_TABLES,
  EIDOS_FILE_SCHEMA_VERSION,
  EIDOS_FILE_TABLES_TABLE,
  EIDOS_FILE_VIEWS_TABLE,
} from "./constants"
import { compileEidosFileFormula } from "./formula"
import { smallestDependencyCycle } from "./dependency-graph"
import { assertEidosFileValues } from "./file-values"
import { isEidosFileUuid, quoteIdentifier } from "./identifiers"
import { isCanonicalEidosFileJson, parseEidosFileJson } from "./canonical-json"
import { assertEidosFileSelectOptions } from "./select-options"
import {
  isCanonicalEidosFileDate,
  isCanonicalEidosFileInstant,
} from "./temporal"
import type {
  EidosFileFieldInfo,
  EidosFileFieldType,
  EidosFileMetadata,
  EidosFileStorageCodec,
  EidosFileTableInfo,
  EidosFileValidationIssue,
  EidosFileValidationResult,
  EidosFileValueKind,
} from "./types"

export type EidosFileValidationLevel =
  | "identity"
  | "structural"
  | "content"
  | "semantic"
  | "full"

interface MetaRow {
  singleton: number
  format_major: number
  format_minor: number
  file_id: string
  revision: number | bigint
  title: string
  default_table_id: string | null
  created_at: string
  updated_at: string
}

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
  type: string
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
  aggregate: "first" | "values" | "count" | "sum" | "average" | "min" | "max"
  distinct_values: number
}

const REQUIRED_COLUMNS: Record<string, readonly string[]> = {
  [EIDOS_FILE_META_TABLE]: [
    "singleton",
    "format_major",
    "format_minor",
    "file_id",
    "revision",
    "title",
    "default_table_id",
    "created_at",
    "updated_at",
  ],
  [EIDOS_FILE_FEATURES_TABLE]: ["name", "version", "required", "config_json"],
  [EIDOS_FILE_TABLES_TABLE]: [
    "id",
    "name",
    "physical_name",
    "label_field_id",
    "position",
    "settings_json",
    "created_at",
    "updated_at",
  ],
  [EIDOS_FILE_FIELDS_TABLE]: [
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
  [EIDOS_FILE_RELATION_FIELDS_TABLE]: [
    "field_id",
    "direction",
    "inverse_of_field_id",
    "target_table_id",
    "cardinality",
    "on_delete",
  ],
  [EIDOS_FILE_FORMULA_FIELDS_TABLE]: ["field_id", "source_text", "result_type"],
  [EIDOS_FILE_LOOKUP_FIELDS_TABLE]: [
    "field_id",
    "relation_field_id",
    "target_field_id",
    "aggregate",
    "distinct_values",
  ],
  [EIDOS_FILE_VIEWS_TABLE]: [
    "id",
    "table_id",
    "name",
    "type",
    "query_json",
    "layout_json",
    "position",
    "created_at",
    "updated_at",
  ],
}

const ID_COLUMNS: Record<string, readonly string[]> = {
  [EIDOS_FILE_META_TABLE]: ["file_id", "default_table_id"],
  [EIDOS_FILE_TABLES_TABLE]: ["id"],
  [EIDOS_FILE_FIELDS_TABLE]: ["id", "table_id"],
  [EIDOS_FILE_RELATION_FIELDS_TABLE]: [
    "field_id",
    "inverse_of_field_id",
    "target_table_id",
  ],
  [EIDOS_FILE_FORMULA_FIELDS_TABLE]: ["field_id"],
  [EIDOS_FILE_LOOKUP_FIELDS_TABLE]: [
    "field_id",
    "relation_field_id",
    "target_field_id",
  ],
  [EIDOS_FILE_VIEWS_TABLE]: ["id", "table_id"],
}

const REQUIRED_INDEXES = new Set([
  "eidos__fields_one_system_role",
  "eidos__relation_one_inverse",
])

const REQUIRED_TRIGGERS = new Set([
  "eidos__meta_no_delete",
  "eidos__meta_no_key_update",
])

const DYNAMIC_TRIGGER_NAME =
  /^eidos__(?:row_id_immutable|relation_(?:validate_(?:insert|update)|restrict|detach))__[0-9a-f]{32}$/

const FIELD_TYPES = new Set<EidosFileFieldType>([
  "text",
  "number",
  "integer",
  "checkbox",
  "date",
  "datetime",
  "url",
  "file",
  "json",
  "select",
  "multi-select",
  "relation",
  "formula",
  "lookup",
])

const LABEL_SCALAR_TYPES = new Set([
  "text",
  "number",
  "integer",
  "checkbox",
  "date",
  "datetime",
  "url",
  "select",
])

const FORMULA_RESULT_TYPES = new Set([
  "text",
  "number",
  "integer",
  "checkbox",
  "date",
  "datetime",
  "url",
  "json",
])

const NUMERIC_LOOKUP_TYPES = new Set(["number", "integer"])
const FILTER_OPERATORS = new Set([
  "equals",
  "not-equals",
  "contains",
  "not-contains",
  "starts-with",
  "ends-with",
  "greater-than",
  "greater-than-or-equal",
  "less-than",
  "less-than-or-equal",
  "is-empty",
  "is-not-empty",
  "is-any-of",
  "is-none-of",
])

const LEVELS: Record<EidosFileValidationLevel, number> = {
  identity: 0,
  structural: 1,
  content: 2,
  semantic: 3,
  full: 4,
}

function uuid(value: unknown, label: string): string {
  if (!isEidosFileUuid(value)) {
    throw new Error(`${label} is not canonical lowercase UUIDv7 TEXT`)
  }
  return value
}

function subtypeMap<T extends { field_id: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((row) => [uuid(row.field_id, "Field ID"), row]))
}

function storageCodec(
  field: FieldRow,
  relation?: RelationRow
): EidosFileStorageCodec {
  if (field.type === "relation" && relation?.direction === "forward")
    return "relation"
  if (field.type === "file" || field.type === "multi-select")
    return "json_array"
  return "scalar"
}

function valueKind(
  field: FieldRow,
  relation?: RelationRow
): EidosFileValueKind {
  if (field.system_role !== null) return "system"
  if (field.type === "formula" || field.type === "lookup") return "derived"
  if (field.type === "relation") {
    return relation?.direction === "inverse" ? "derived" : "relation"
  }
  return "source"
}

function validPhysicalMapping(
  kind: "table" | "field",
  name: string,
  physicalName: string,
  id: string
): boolean {
  const folded = name.replace(/[A-Z]/g, (character) => character.toLowerCase())
  const reserved =
    kind === "table"
      ? ["sqlite_", "eidos__", "x__"].some((prefix) =>
          folded.startsWith(prefix)
        )
      : ["_id", "_created_at", "_updated_at"].includes(folded)
  const hex = id.replace(/-/g, "")
  if (kind === "table" && reserved) {
    return [8, 12, 32].some((length) => {
      const prefix = `t__${hex.slice(0, length)}__`
      return (
        physicalName.startsWith(prefix) &&
        new TextEncoder().encode(physicalName).byteLength <= 1024
      )
    })
  }
  if (physicalName === name) return !reserved
  // A formerly-colliding suffixed mapping remains valid after the other object
  // is removed (§6.3); validation therefore cannot require re-minimization.
  return [8, 12, 32].some(
    (length) => physicalName === `${name}__${hex.slice(0, length)}`
  )
}

function expectedColumnType(type: string): string | null {
  if (
    [
      "text",
      "url",
      "select",
      "date",
      "datetime",
      "file",
      "json",
      "multi-select",
      "relation",
    ].includes(type)
  ) {
    return "TEXT"
  }
  if (["integer", "checkbox"].includes(type)) {
    return "INTEGER"
  }
  if (type === "number") return "REAL"
  return null
}

function relationIds(value: EidosFileSqlPrimitive): string[] | null {
  if (typeof value !== "string" || !isCanonicalEidosFileJson(value)) return null
  const parsed = parseEidosFileJson(value)
  if (!Array.isArray(parsed) || !parsed.every(isEidosFileUuid)) return null
  if (new Set(parsed).size !== parsed.length) return null
  return parsed
}

function declaresBinaryText(sql: string | null, column: string): boolean {
  if (!sql) return false
  const escaped = column.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const identifier = `(?:"${escaped}"|\\[${escaped}\\]|\`${escaped}\`|${escaped})`
  return new RegExp(
    `(?:\\(|,)\\s*${identifier}\\s+TEXT\\b[^,)]*\\bCOLLATE\\s+BINARY\\b`,
    "i"
  ).test(sql)
}

export function validateEidosFile(
  connection: EidosFileConnection,
  options: { level?: EidosFileValidationLevel } = {}
): EidosFileValidationResult {
  const level = options.level ?? "full"
  const errors: EidosFileValidationIssue[] = []
  const warnings: EidosFileValidationIssue[] = []
  const add = (
    target: EidosFileValidationIssue[],
    code: string,
    message: string,
    table?: string
  ): void => {
    target.push({ code, message, ...(table ? { table } : {}) })
  }

  const applicationId = connection.get<{ application_id: number }>(
    "PRAGMA application_id"
  )?.application_id
  const userVersion = connection.get<{ user_version: number }>(
    "PRAGMA user_version"
  )?.user_version
  if (applicationId !== EIDOS_FILE_APPLICATION_ID) {
    add(errors, "not-eidos-file", "SQLite application_id is not EIDS")
  }
  if (userVersion !== EIDOS_FILE_SCHEMA_VERSION) {
    add(
      errors,
      "unsupported-version",
      `Unsupported Eidos File schema revision: ${userVersion ?? "missing"}`
    )
  }

  const sqliteObjects = connection.query<{
    name: string
    type: string
    tbl_name: string
    sql: string | null
  }>("SELECT name, type, tbl_name, sql FROM sqlite_master")
  const sqliteTables = new Map(
    sqliteObjects
      .filter((object) => object.type === "table")
      .map((object) => [object.name, object])
  )
  for (const tableName of EIDOS_FILE_REQUIRED_TABLES) {
    if (!sqliteTables.has(tableName)) {
      add(
        errors,
        "invalid-schema",
        `Missing required metadata table: ${tableName}`,
        tableName
      )
    }
  }
  const allowedStaticObjects = new Set([
    ...EIDOS_FILE_REQUIRED_TABLES,
    ...REQUIRED_INDEXES,
    ...REQUIRED_TRIGGERS,
  ])
  for (const object of sqliteObjects) {
    if (
      object.name
        .replace(/[A-Z]/g, (character) => character.toLowerCase())
        .startsWith("eidos__") &&
      !allowedStaticObjects.has(object.name) &&
      !DYNAMIC_TRIGGER_NAME.test(object.name)
    ) {
      add(
        errors,
        "invalid-schema",
        `Undeclared reserved SQLite object: ${object.type} ${object.name}`,
        object.name
      )
    }
  }
  const indexes = new Set(
    sqliteObjects
      .filter((object) => object.type === "index")
      .map((object) => object.name)
  )
  for (const indexName of REQUIRED_INDEXES) {
    if (!indexes.has(indexName)) {
      add(
        errors,
        "invalid-schema",
        `Missing required metadata index: ${indexName}`
      )
    }
  }
  const triggers = new Set(
    sqliteObjects
      .filter((object) => object.type === "trigger")
      .map((object) => object.name)
  )
  for (const triggerName of REQUIRED_TRIGGERS) {
    if (!triggers.has(triggerName)) {
      add(errors, "invalid-schema", `Missing required trigger: ${triggerName}`)
    }
  }
  if (!sqliteTables.has(EIDOS_FILE_META_TABLE)) {
    return { valid: false, metadata: null, tables: [], errors, warnings }
  }

  let meta: MetaRow | undefined
  try {
    const metaRows = connection.query<MetaRow>(
      `SELECT * FROM ${EIDOS_FILE_META_TABLE}`
    )
    if (metaRows.length !== 1 || metaRows[0]?.singleton !== 1) {
      add(
        errors,
        "invalid-schema",
        "eidos__meta must contain exactly singleton row 1"
      )
    } else {
      meta = metaRows[0]
    }
  } catch {
    add(
      errors,
      "invalid-schema",
      "Unable to read the canonical metadata singleton"
    )
  }

  let metadata: EidosFileMetadata | null = null
  if (meta) {
    try {
      const fileId = uuid(meta.file_id, "File ID")
      const defaultTableId = meta.default_table_id
        ? uuid(meta.default_table_id, "Default Table ID")
        : undefined
      if (meta.format_major !== 1 || meta.format_minor !== 0) {
        add(
          errors,
          "unsupported-version",
          `Unsupported Eidos File format: ${meta.format_major}.${meta.format_minor}`
        )
      }
      if (
        (typeof meta.revision !== "number" &&
          typeof meta.revision !== "bigint") ||
        (typeof meta.revision === "number" &&
          !Number.isSafeInteger(meta.revision)) ||
        BigInt(meta.revision) < 0n
      ) {
        add(
          errors,
          "invalid-schema",
          "File revision must be a non-negative integer"
        )
      }
      if (
        !isCanonicalEidosFileInstant(meta.created_at) ||
        !isCanonicalEidosFileInstant(meta.updated_at)
      ) {
        add(
          errors,
          "invalid-schema",
          "File metadata timestamps must be canonical UTC millisecond text"
        )
      }
      metadata = {
        format: EIDOS_FILE_FORMAT,
        fileId,
        formatVersion: EIDOS_FILE_FORMAT_VERSION,
        schemaVersion: EIDOS_FILE_SCHEMA_VERSION,
        revision: meta.revision,
        createdAt: meta.created_at,
        updatedAt: meta.updated_at,
        title: meta.title,
        ...(defaultTableId ? { defaultTableId } : {}),
      }
    } catch (error) {
      add(
        errors,
        "invalid-schema",
        error instanceof Error ? error.message : "Invalid metadata ID"
      )
    }
  }

  if (LEVELS[level] === LEVELS.identity) {
    return {
      valid: errors.length === 0,
      metadata,
      tables: [],
      errors,
      warnings,
    }
  }

  for (const [tableName, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
    if (!sqliteTables.has(tableName)) continue
    const columns = new Map(
      connection
        .query<{ name: string; type: string }>(
          `PRAGMA table_xinfo(${quoteIdentifier(tableName)})`
        )
        .map((column) => [column.name, column.type.toUpperCase()])
    )
    for (const column of requiredColumns) {
      if (!columns.has(column)) {
        add(
          errors,
          "invalid-schema",
          `Missing required column ${tableName}.${column}`,
          tableName
        )
      }
    }
    for (const column of ID_COLUMNS[tableName] ?? []) {
      if (
        columns.get(column) !== "TEXT" ||
        !declaresBinaryText(sqliteTables.get(tableName)?.sql ?? null, column)
      ) {
        add(
          errors,
          "invalid-schema",
          `${tableName}.${column} must use canonical UUIDv7 TEXT COLLATE BINARY`,
          tableName
        )
      }
    }
    if (
      new Set<string>([
        EIDOS_FILE_META_TABLE,
        EIDOS_FILE_TABLES_TABLE,
        EIDOS_FILE_FIELDS_TABLE,
        EIDOS_FILE_VIEWS_TABLE,
      ]).has(tableName)
    ) {
      for (const column of ["created_at", "updated_at"]) {
        if (columns.get(column) !== "TEXT") {
          add(
            errors,
            "invalid-schema",
            `${tableName}.${column} must use SQLite TEXT`,
            tableName
          )
        }
      }
    }
  }

  const tableModes = new Map(
    connection
      .query<{ name: string; wr: number; strict: number }>("PRAGMA table_list")
      .map((row) => [row.name, row])
  )
  for (const tableName of EIDOS_FILE_REQUIRED_TABLES) {
    const mode = tableModes.get(tableName)
    if (!mode) continue
    if (mode.strict !== 1) {
      add(errors, "invalid-schema", `${tableName} must be STRICT`, tableName)
    }
    if (mode.wr !== 1) {
      add(
        errors,
        "invalid-schema",
        `${tableName} has the wrong WITHOUT ROWID mode`,
        tableName
      )
    }
  }

  if (sqliteTables.has(EIDOS_FILE_FEATURES_TABLE)) {
    for (const feature of connection.query<{
      name: string
      required: number
      config_json: string
    }>(
      `SELECT name, required, config_json FROM ${EIDOS_FILE_FEATURES_TABLE}`
    )) {
      if (!isCanonicalEidosFileJson(feature.config_json)) {
        add(
          errors,
          "invalid-schema",
          `Feature ${feature.name} has non-canonical config_json`
        )
      }
      if (feature.required === 1) {
        add(
          errors,
          "unsupported-feature",
          `Unknown required feature: ${feature.name}`
        )
      }
    }
  }

  const tableRows = sqliteTables.has(EIDOS_FILE_TABLES_TABLE)
    ? connection.query<TableRow>(
        `SELECT * FROM ${EIDOS_FILE_TABLES_TABLE} ORDER BY position, id`
      )
    : []
  const tables: EidosFileTableInfo[] = []
  const tableRowsById = new Map<string, TableRow>()
  for (const row of tableRows) {
    try {
      const id = uuid(row.id, "Table ID")
      tableRowsById.set(id, row)
      const tableSettings = isCanonicalEidosFileJson(row.settings_json)
        ? parseEidosFileJson(row.settings_json)
        : null
      const settings =
        tableSettings &&
        !Array.isArray(tableSettings) &&
        typeof tableSettings === "object"
          ? tableSettings
          : {}
      tables.push({
        id,
        name: row.name,
        physicalName: row.physical_name,
        rawTableName: row.physical_name,
        position: row.position,
        icon: typeof settings.icon === "string" ? settings.icon : null,
        description:
          typeof settings.description === "string"
            ? settings.description
            : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })
      if (
        !isCanonicalEidosFileInstant(row.created_at) ||
        !isCanonicalEidosFileInstant(row.updated_at)
      ) {
        add(
          errors,
          "invalid-schema",
          `Table ${row.name} metadata timestamps are not canonical instants`,
          row.physical_name
        )
      }
      if (!isCanonicalEidosFileJson(row.settings_json)) {
        add(
          errors,
          "invalid-schema",
          `Table ${row.name} has non-canonical settings_json`,
          row.physical_name
        )
      }
      if (!validPhysicalMapping("table", row.name, row.physical_name, id)) {
        add(
          errors,
          "invalid-schema",
          `Table ${row.name} has an invalid physical name`,
          row.physical_name
        )
      }
      const tableObject = sqliteTables.get(row.physical_name)
      if (!tableObject) {
        add(
          errors,
          "invalid-schema",
          `Missing user table ${row.physical_name}`,
          row.physical_name
        )
      } else if (!/\bSTRICT\b/i.test(tableObject.sql ?? "")) {
        add(
          errors,
          "invalid-schema",
          `User table ${row.physical_name} must be STRICT`,
          row.physical_name
        )
      }
    } catch (error) {
      add(
        errors,
        "invalid-schema",
        error instanceof Error ? error.message : "Invalid Table ID"
      )
    }
  }
  if (metadata?.defaultTableId && !tableRowsById.has(metadata.defaultTableId)) {
    add(
      errors,
      "invalid-schema",
      "default_table_id does not reference a registered Table"
    )
  }

  const relationRows = sqliteTables.has(EIDOS_FILE_RELATION_FIELDS_TABLE)
    ? connection.query<RelationRow>(
        `SELECT * FROM ${EIDOS_FILE_RELATION_FIELDS_TABLE}`
      )
    : []
  const formulaRows = sqliteTables.has(EIDOS_FILE_FORMULA_FIELDS_TABLE)
    ? connection.query<FormulaRow>(
        `SELECT * FROM ${EIDOS_FILE_FORMULA_FIELDS_TABLE}`
      )
    : []
  const lookupRows = sqliteTables.has(EIDOS_FILE_LOOKUP_FIELDS_TABLE)
    ? connection.query<LookupRow>(
        `SELECT * FROM ${EIDOS_FILE_LOOKUP_FIELDS_TABLE}`
      )
    : []
  const relations = subtypeMap(relationRows)
  const formulas = subtypeMap(formulaRows)
  const lookups = subtypeMap(lookupRows)

  const fieldRows = sqliteTables.has(EIDOS_FILE_FIELDS_TABLE)
    ? connection.query<FieldRow>(
        `SELECT * FROM ${EIDOS_FILE_FIELDS_TABLE} ORDER BY table_id, position, id`
      )
    : []
  const fieldRowsById = new Map<string, FieldRow>()
  const fieldsByTable = new Map<string, EidosFileFieldInfo[]>()
  for (const row of fieldRows) {
    try {
      const id = uuid(row.id, "Field ID")
      const tableId = uuid(row.table_id, "Field Table ID")
      const table = tableRowsById.get(tableId)
      fieldRowsById.set(id, row)
      if (!table) {
        add(errors, "invalid-schema", `Field ${id} references an unknown Table`)
        continue
      }
      if (!FIELD_TYPES.has(row.type as EidosFileFieldType)) {
        add(
          errors,
          "invalid-schema",
          `Field ${row.name} has unsupported type ${row.type}`
        )
      }
      if (
        !isCanonicalEidosFileInstant(row.created_at) ||
        !isCanonicalEidosFileInstant(row.updated_at)
      ) {
        add(
          errors,
          "invalid-schema",
          `Field ${row.name} metadata timestamps are not canonical instants`
        )
      }
      if (!isCanonicalEidosFileJson(row.settings_json)) {
        add(
          errors,
          "invalid-schema",
          `Field ${row.name} has non-canonical settings_json`
        )
      }
      let settings: Record<string, unknown> = {}
      try {
        const parsed = parseEidosFileJson(row.settings_json)
        if (
          Array.isArray(parsed) ||
          parsed === null ||
          typeof parsed !== "object"
        ) {
          throw new Error("settings_json must be an object")
        }
        settings = parsed
      } catch (error) {
        add(
          errors,
          "invalid-schema",
          `Field ${row.name}: ${error instanceof Error ? error.message : "invalid settings"}`
        )
      }
      if (row.type === "select" || row.type === "multi-select") {
        try {
          assertEidosFileSelectOptions(settings)
        } catch (error) {
          add(
            errors,
            "invalid-schema",
            error instanceof Error ? error.message : "Invalid Select catalog"
          )
        }
      }
      const relation = relations.get(id)
      const virtual =
        row.type === "formula" ||
        row.type === "lookup" ||
        (row.type === "relation" && relation?.direction === "inverse")
      const requiresNonNull =
        row.system_role !== null ||
        row.type === "file" ||
        row.type === "multi-select" ||
        row.type === "relation"
      const requiresNullable = row.type === "formula" || row.type === "lookup"
      if (
        (requiresNonNull && row.nullable !== 0) ||
        (requiresNullable && row.nullable !== 1)
      ) {
        add(
          errors,
          "invalid-schema",
          `Field ${row.name} has invalid nullable metadata for ${row.type}`
        )
      }
      if (virtual && row.physical_name !== null) {
        add(
          errors,
          "invalid-schema",
          `Virtual Field ${row.name} must not have a physical column`
        )
      }
      if (!virtual && row.physical_name === null) {
        add(
          errors,
          "invalid-schema",
          `Stored Field ${row.name} requires a physical column`
        )
      }
      const systemMapping =
        (row.system_role === "row-id" &&
          row.type === "text" &&
          row.physical_name === "_id" &&
          row.nullable === 0) ||
        (row.system_role === "created-time" &&
          row.type === "datetime" &&
          row.physical_name === "_created_at" &&
          row.nullable === 0) ||
        (row.system_role === "updated-time" &&
          row.type === "datetime" &&
          row.physical_name === "_updated_at" &&
          row.nullable === 0)
      if (
        row.physical_name &&
        !systemMapping &&
        !validPhysicalMapping("field", row.name, row.physical_name, id)
      ) {
        add(
          errors,
          "invalid-schema",
          `Field ${row.name} has an invalid physical name`
        )
      }

      const formula = formulas.get(id)
      const lookup = lookups.get(id)
      const property: Record<string, unknown> | null = formula
        ? { formula: formula.source_text, displayType: formula.result_type }
        : lookup
          ? {
              relationField: uuid(
                lookup.relation_field_id,
                "Lookup Relation Field ID"
              ),
              targetField: uuid(
                lookup.target_field_id,
                "Lookup Target Field ID"
              ),
              aggregate: lookup.aggregate,
              displayType: lookup.aggregate === "values" ? "json" : "text",
            }
          : relation
            ? {
                targetTableId: uuid(
                  relation.target_table_id,
                  "Relation Target Table ID"
                ),
                direction: relation.direction,
                sourceFieldId: relation.inverse_of_field_id
                  ? uuid(
                      relation.inverse_of_field_id,
                      "Relation inverse Field ID"
                    )
                  : undefined,
                cardinality: relation.cardinality,
                onDelete: relation.on_delete,
              }
            : settings
      const field: EidosFileFieldInfo = {
        id,
        tableId,
        name: row.name,
        type:
          row.system_role === "row-id"
            ? "row-id"
            : row.system_role === "created-time"
              ? "created-time"
              : row.system_role === "updated-time"
                ? "last-edited-time"
                : (row.type as EidosFileFieldType),
        tableName: table.physical_name,
        tableColumnName: row.physical_name ?? id,
        physicalName: row.physical_name,
        systemRole: row.system_role,
        nullable: row.nullable === 1,
        isRecordLabel: table.label_field_id === id,
        position: row.position,
        settings,
        property,
        storageCodec: storageCodec(row, relation),
        valueKind: valueKind(row, relation),
        isHidden: row.system_role !== null,
        isDerived: virtual,
        sourceTableColumnName:
          relation?.direction === "inverse" && relation.inverse_of_field_id
            ? uuid(relation.inverse_of_field_id, "Inverse source Field ID")
            : null,
        dependsOn: null,
      }
      const fields = fieldsByTable.get(tableId) ?? []
      fields.push(field)
      fieldsByTable.set(tableId, fields)
    } catch (error) {
      add(
        errors,
        "invalid-schema",
        error instanceof Error ? error.message : "Invalid Field metadata"
      )
    }
  }

  for (const [tableId, fields] of fieldsByTable) {
    const table = tableRowsById.get(tableId)
    if (!table) continue
    const requiredSystemFields = [
      ["row-id", "_id"],
      ["created-time", "_created_at"],
      ["last-edited-time", "_updated_at"],
    ] as const
    for (const [type, physicalName] of requiredSystemFields) {
      const matches = fields.filter(
        (field) => field.type === type && field.physicalName === physicalName
      )
      if (matches.length !== 1) {
        add(
          errors,
          "invalid-schema",
          `Table ${table.name} must register exactly one ${type} Field mapped to ${physicalName}`
        )
      }
    }
    const mappedNames = fields.flatMap((field) =>
      field.physicalName ? [field.physicalName] : []
    )
    if (
      new Set(
        mappedNames.map((name) =>
          name.replace(/[A-Z]/g, (character) => character.toLowerCase())
        )
      ).size !== mappedNames.length
    ) {
      add(
        errors,
        "invalid-schema",
        `Table ${table.name} maps more than one Field to a physical column`
      )
    }
  }

  const triggerObjects = new Map(
    sqliteObjects
      .filter((object) => object.type === "trigger")
      .map((object) => [object.name, object])
  )
  const expectedTriggers = new Map<
    string,
    { table: string; fragments: string[] }
  >()
  for (const [tableId, table] of tableRowsById) {
    expectedTriggers.set(
      `eidos__row_id_immutable__${tableId.replace(/-/g, "")}`,
      {
        table: table.physical_name,
        fragments: ["before update of", "_id", "eidos_row_id_immutable"],
      }
    )
  }
  for (const [fieldId, relation] of relations) {
    if (relation.direction !== "forward") continue
    const field = fieldRowsById.get(fieldId)
    if (!field) continue
    try {
      const sourceTable = tableRowsById.get(
        uuid(field.table_id, "Relation owner Table ID")
      )
      const targetTable = tableRowsById.get(
        uuid(relation.target_table_id, "Relation target Table ID")
      )
      if (!sourceTable || !targetTable) continue
      const hex = fieldId.replace(/-/g, "")
      expectedTriggers.set(`eidos__relation_validate_insert__${hex}`, {
        table: sourceTable.physical_name,
        fragments: ["before insert", "eidos_invalid_relation_value"],
      })
      expectedTriggers.set(`eidos__relation_validate_update__${hex}`, {
        table: sourceTable.physical_name,
        fragments: ["before update", "eidos_invalid_relation_value"],
      })
      if (
        relation.on_delete === "restrict" ||
        relation.on_delete === "detach"
      ) {
        expectedTriggers.set(`eidos__relation_${relation.on_delete}__${hex}`, {
          table: targetTable.physical_name,
          fragments:
            relation.on_delete === "restrict"
              ? [
                  "before delete",
                  "eidos_relation_restrict",
                  "item.value",
                  'old."_id"',
                ]
              : [
                  "before delete",
                  "update",
                  "json_each",
                  "json_group_array",
                  "order by",
                  'old."_id"',
                  "_updated_at",
                  "strftime",
                ],
        })
      }
    } catch (error) {
      add(
        errors,
        "invalid-schema",
        error instanceof Error
          ? error.message
          : "Invalid Relation trigger identity"
      )
    }
  }
  for (const [name, expected] of expectedTriggers) {
    const trigger = triggerObjects.get(name)
    if (!trigger) {
      add(
        errors,
        "invalid-schema",
        `Missing required portable trigger: ${name}`
      )
      continue
    }
    const sql = (trigger.sql ?? "").toLowerCase()
    if (
      trigger.tbl_name !== expected.table ||
      sql.includes("hex(") ||
      expected.fragments.some((fragment) => !sql.includes(fragment))
    ) {
      add(
        errors,
        "invalid-schema",
        `Portable trigger ${name} has an invalid definition`
      )
    }
  }
  for (const name of triggerObjects.keys()) {
    if (DYNAMIC_TRIGGER_NAME.test(name) && !expectedTriggers.has(name)) {
      add(
        errors,
        "invalid-schema",
        `Undeclared or stale portable trigger: ${name}`
      )
    }
  }

  if (LEVELS[level] === LEVELS.structural) {
    return { valid: errors.length === 0, metadata, tables, errors, warnings }
  }

  if (level === "semantic" || level === "full") {
    const dependencyGraph = new Map<string, string[]>()
    for (const [fieldId] of relations) {
      if (fieldRowsById.get(fieldId)?.type !== "relation") {
        add(
          errors,
          "invalid-schema",
          `Relation subtype ${fieldId} does not belong to a Relation Field`
        )
      }
    }
    for (const [fieldId] of formulas) {
      if (fieldRowsById.get(fieldId)?.type !== "formula") {
        add(
          errors,
          "invalid-schema",
          `Formula subtype ${fieldId} does not belong to a Formula Field`
        )
      }
    }
    for (const [fieldId] of lookups) {
      if (fieldRowsById.get(fieldId)?.type !== "lookup") {
        add(
          errors,
          "invalid-schema",
          `Lookup subtype ${fieldId} does not belong to a Lookup Field`
        )
      }
    }

    const logicalType = (
      fieldId: string,
      visiting = new Set<string>()
    ): string => {
      if (visiting.has(fieldId)) return "invalid"
      const row = fieldRowsById.get(fieldId)
      if (!row) return "invalid"
      if (row.type === "formula")
        return formulas.get(fieldId)?.result_type ?? "invalid"
      if (row.type !== "lookup") {
        if (row.system_role === "row-id") return "row-id"
        return row.type
      }
      const lookup = lookups.get(fieldId)
      if (!lookup) return "invalid"
      const element = lookupElementType(
        uuid(lookup.target_field_id, "Lookup Target Field ID"),
        new Set([...visiting, fieldId])
      )
      if (lookup.aggregate === "values") return `list:${element}`
      if (lookup.aggregate === "count") return "integer"
      if (lookup.aggregate === "average") return "number"
      if (lookup.aggregate === "sum")
        return element === "integer" ? "integer" : "number"
      return element
    }
    const lookupElementType = (
      fieldId: string,
      visiting = new Set<string>()
    ) => {
      const type = logicalType(fieldId, visiting)
      if (type.startsWith("list:")) return type.slice(5)
      if (type === "multi-select") return "select"
      if (type === "file") return "file-entry"
      if (type === "relation") return "row-id"
      return type
    }
    for (const fields of fieldsByTable.values()) {
      for (const field of fields) {
        if (field.type !== "lookup" || !field.property) continue
        const valueType = logicalType(field.id!)
        field.property.valueType = valueType.startsWith("list:")
          ? { kind: "list", element: valueType.slice(5) }
          : valueType
        const atom = valueType.startsWith("list:")
          ? valueType.slice(5)
          : valueType
        field.property.displayType =
          atom === "row-id" || atom === "select"
            ? "text"
            : atom === "file-entry"
              ? "json"
              : atom
      }
    }
    for (const [tableId, fields] of fieldsByTable) {
      const table = tableRowsById.get(tableId)!
      const labels = fields.filter((field) => field.isRecordLabel)
      if (labels.length !== 1) {
        add(
          errors,
          "invalid-schema",
          `Table ${table.name} must have exactly one Record Label Field`
        )
      }
      for (const label of labels) {
        const resultType = logicalType(label.id!)
        if (label.type === "lookup" || !LABEL_SCALAR_TYPES.has(resultType)) {
          add(
            errors,
            "invalid-schema",
            `Record Label Field ${label.name} is not scalar`
          )
        }
      }

      const physicalColumnRows = connection.query<{
        name: string
        type: string
        notnull: number
      }>(`PRAGMA table_xinfo(${quoteIdentifier(table.physical_name)})`)
      const physicalColumns = new Map(
        physicalColumnRows.map((column) => [
          column.name,
          column.type.toUpperCase(),
        ])
      )
      const physicalNullability = new Map(
        physicalColumnRows.map((column) => [column.name, column.notnull === 0])
      )
      for (const required of ["_id", "_created_at", "_updated_at"]) {
        if (!physicalColumns.has(required)) {
          add(
            errors,
            "invalid-schema",
            `User table ${table.name} is missing ${required}`
          )
        }
      }
      if (
        physicalColumns.get("_id") !== "TEXT" ||
        !declaresBinaryText(
          sqliteTables.get(table.physical_name)?.sql ?? null,
          "_id"
        )
      ) {
        add(
          errors,
          "invalid-schema",
          `User table ${table.name}._id must use canonical UUIDv7 TEXT COLLATE BINARY`
        )
      }
      for (const field of fields) {
        const fieldId = field.id!
        if (field.physicalName) {
          const actualType = physicalColumns.get(field.physicalName)
          const expected = expectedColumnType(field.type)
          if (!actualType) {
            add(
              errors,
              "invalid-schema",
              `Stored Field ${field.name} has no physical column`
            )
          } else if (expected && actualType !== expected) {
            add(
              errors,
              "invalid-schema",
              `Field ${field.name} must use SQLite ${expected}, found ${actualType}`
            )
          }
          if (
            !["row-id", "created-time", "last-edited-time"].includes(
              field.type
            ) &&
            physicalNullability.get(field.physicalName) !== field.nullable
          ) {
            add(
              errors,
              "invalid-schema",
              `Field ${field.name} nullable metadata does not match its physical column`
            )
          }
        }
        if (field.type === "formula") {
          if (!formulas.has(fieldId)) {
            add(
              errors,
              "invalid-schema",
              `Formula Field ${field.name} is missing subtype metadata`
            )
          } else {
            if (!FORMULA_RESULT_TYPES.has(formulas.get(fieldId)!.result_type)) {
              add(
                errors,
                "invalid-schema",
                `Formula Field ${field.name} has an invalid result type`
              )
            }
            try {
              const compiled = compileEidosFileFormula(field, fields)
              dependencyGraph.set(fieldId, compiled.dependencyFieldIds)
            } catch (error) {
              add(
                errors,
                "invalid-schema",
                error instanceof Error ? error.message : "Invalid Formula"
              )
            }
          }
        } else if (field.type === "lookup") {
          const lookup = lookups.get(fieldId)
          if (!lookup) {
            add(
              errors,
              "invalid-schema",
              `Lookup Field ${field.name} is missing subtype metadata`
            )
          } else {
            const relationFieldId = uuid(
              lookup.relation_field_id,
              "Lookup Relation Field ID"
            )
            const targetFieldId = uuid(
              lookup.target_field_id,
              "Lookup Target Field ID"
            )
            const relationField = fieldRowsById.get(relationFieldId)
            const relation = relations.get(relationFieldId)
            const targetField = fieldRowsById.get(targetFieldId)
            if (
              !relationField ||
              !relation ||
              relationField.type !== "relation"
            ) {
              add(
                errors,
                "invalid-schema",
                `Lookup ${field.name} does not reference a Relation Field`
              )
            } else {
              const relationOwner = uuid(
                relationField.table_id,
                "Relation owner Table ID"
              )
              const logicalTarget = uuid(
                relation.target_table_id,
                "Relation target Table ID"
              )
              const targetOwner = targetField
                ? uuid(targetField.table_id, "Lookup target owner Table ID")
                : ""
              if (relationOwner !== tableId) {
                add(
                  errors,
                  "invalid-schema",
                  `Lookup ${field.name} Relation belongs to another Table`
                )
              }
              if (!targetField || targetOwner !== logicalTarget) {
                add(
                  errors,
                  "invalid-schema",
                  `Lookup ${field.name} target is outside the Relation target Table`
                )
              }
            }
            const targetType = lookupElementType(targetFieldId)
            if (
              (lookup.aggregate === "sum" || lookup.aggregate === "average") &&
              !NUMERIC_LOOKUP_TYPES.has(targetType)
            ) {
              add(
                errors,
                "invalid-schema",
                `Lookup ${field.name} ${lookup.aggregate} requires a numeric target`
              )
            }
            if (
              (lookup.aggregate === "min" || lookup.aggregate === "max") &&
              ![
                "text",
                "url",
                "select",
                "row-id",
                "integer",
                "number",
                "checkbox",
                "date",
                "datetime",
              ].includes(targetType)
            ) {
              add(
                errors,
                "invalid-schema",
                `Lookup ${field.name} ${lookup.aggregate} requires a scalar target`
              )
            }
            dependencyGraph.set(fieldId, [relationFieldId, targetFieldId])
          }
        } else if (field.type === "relation") {
          const relation = relations.get(fieldId)
          if (!relation) {
            add(
              errors,
              "invalid-schema",
              `Relation Field ${field.name} is missing subtype metadata`
            )
          } else if (
            relation.direction === "inverse" &&
            relation.inverse_of_field_id
          ) {
            const sourceFieldId = uuid(
              relation.inverse_of_field_id,
              "Inverse source Field ID"
            )
            const sourceField = fieldRowsById.get(sourceFieldId)
            const sourceRelation = relations.get(sourceFieldId)
            const sourceTableId = sourceField
              ? uuid(sourceField.table_id, "Forward Relation owner Table ID")
              : ""
            if (
              !sourceField ||
              !sourceRelation ||
              sourceRelation.direction !== "forward" ||
              uuid(
                sourceRelation.target_table_id,
                "Forward Relation target Table ID"
              ) !== tableId ||
              uuid(
                relation.target_table_id,
                "Inverse Relation target Table ID"
              ) !== sourceTableId ||
              relation.cardinality !== "many"
            ) {
              add(
                errors,
                "invalid-schema",
                `Inverse Relation ${field.name} has inconsistent endpoints`
              )
            }
            dependencyGraph.set(fieldId, [sourceFieldId])
          } else if (relation.direction === "forward") {
            const targetTableId = uuid(
              relation.target_table_id,
              "Relation target Table ID"
            )
            if (!tableRowsById.has(targetTableId)) {
              add(
                errors,
                "invalid-schema",
                `Relation ${field.name} targets a missing Table`
              )
            }
          }
        }
      }
    }

    for (const id of fieldRowsById.keys())
      dependencyGraph.set(id, dependencyGraph.get(id) ?? [])
    const canonicalGraph = new Map<string, Set<string>>(
      Array.from(fieldRowsById.keys(), (id) => [id, new Set<string>()])
    )
    for (const [dependent, dependencies] of dependencyGraph) {
      for (const dependency of dependencies) {
        if (!fieldRowsById.has(dependency)) {
          add(
            errors,
            "invalid-schema",
            `Field ${dependent} depends on missing Field ${dependency}`
          )
        } else {
          canonicalGraph.get(dependency)!.add(dependent)
        }
      }
    }
    const dependencyCycle = smallestDependencyCycle(canonicalGraph)
    if (dependencyCycle) {
      const cycle = dependencyCycle
        .map((fieldId) => {
          const field = fieldRowsById.get(fieldId)
          return field ? `${field.name} (${fieldId})` : fieldId
        })
        .join(" → ")
      add(errors, "dependency-cycle", `Eidos File dependency cycle: ${cycle}`)
    }

    if (sqliteTables.has(EIDOS_FILE_VIEWS_TABLE)) {
      for (const view of connection.query<{
        id: string
        table_id: string
        query_json: string
        layout_json: string
        created_at: string
        updated_at: string
      }>(
        `SELECT id, table_id, query_json, layout_json, created_at, updated_at FROM ${EIDOS_FILE_VIEWS_TABLE}`
      )) {
        try {
          uuid(view.id, "View ID")
          const tableId = uuid(view.table_id, "View Table ID")
          if (!tableRowsById.has(tableId))
            throw new Error("View references an unknown Table")
          if (
            !isCanonicalEidosFileInstant(view.created_at) ||
            !isCanonicalEidosFileInstant(view.updated_at)
          ) {
            throw new Error("View timestamps must be canonical instants")
          }
          if (
            !isCanonicalEidosFileJson(view.query_json) ||
            !isCanonicalEidosFileJson(view.layout_json)
          ) {
            throw new Error(
              "View query_json and layout_json must be canonical JSON"
            )
          }
          const viewFields = fieldsByTable.get(tableId) ?? []
          const fieldsById = new Map(
            viewFields.map((field) => [field.id!, field])
          )
          const fieldIds = new Set(fieldsById.keys())
          const query = parseEidosFileJson(view.query_json)
          const layout = parseEidosFileJson(view.layout_json)
          if (!query || Array.isArray(query) || typeof query !== "object") {
            throw new Error("View query_json must be an object")
          }
          if (!layout || Array.isArray(layout) || typeof layout !== "object") {
            throw new Error("View layout_json must be an object")
          }
          const checkFilter = (value: unknown): void => {
            if (!value || typeof value !== "object" || Array.isArray(value)) {
              throw new Error("View filter nodes must be objects")
            }
            const node = value as Record<string, unknown>
            if (Array.isArray(node.args)) {
              if (node.op !== "and" && node.op !== "or") {
                throw new Error("View filter group has an invalid op")
              }
              node.args.forEach(checkFilter)
              return
            }
            if (typeof node.field !== "string" || !fieldIds.has(node.field)) {
              throw new Error("View filter references an unknown Field ID")
            }
            if (typeof node.op !== "string" || !FILTER_OPERATORS.has(node.op)) {
              throw new Error("View filter rule has an invalid operator")
            }
            const field = fieldsById.get(node.field)!
            const list =
              field.storageCodec === "json_array" ||
              field.storageCodec === "relation"
            if (
              list &&
              [
                "greater-than",
                "greater-than-or-equal",
                "less-than",
                "less-than-or-equal",
                "starts-with",
                "ends-with",
              ].includes(node.op)
            ) {
              throw new Error(
                "View filter uses a scalar comparison on a list Field"
              )
            }
            if (field.type === "relation" && "value" in node) {
              const values = Array.isArray(node.value)
                ? node.value
                : [node.value]
              if (
                !values.every(
                  (entry) => entry === null || isEidosFileUuid(entry)
                )
              ) {
                throw new Error(
                  "View Relation filter values must be canonical Row IDs"
                )
              }
            }
          }
          if ("filter" in query) checkFilter(query.filter)
          if ("sort" in query) {
            if (!Array.isArray(query.sort))
              throw new Error("View sort must be an array")
            for (const item of query.sort) {
              if (
                !item ||
                Array.isArray(item) ||
                typeof item !== "object" ||
                typeof item.field !== "string" ||
                !fieldIds.has(item.field) ||
                (item.direction !== "asc" && item.direction !== "desc") ||
                (item.nulls !== "first" && item.nulls !== "last")
              ) {
                throw new Error(
                  "View sort contains an invalid Field reference or direction"
                )
              }
            }
          }
          for (const key of [
            "cardFields",
            "fieldOrder",
            "hiddenFields",
          ] as const) {
            const value = layout[key]
            if (
              value !== undefined &&
              (!Array.isArray(value) ||
                !value.every(
                  (fieldId) =>
                    typeof fieldId === "string" && fieldIds.has(fieldId)
                ))
            ) {
              throw new Error(
                `View ${key} must contain Field IDs from its Table`
              )
            }
          }
          for (const key of ["coverField", "groupField"] as const) {
            const value = layout[key]
            if (
              value !== undefined &&
              value !== null &&
              (typeof value !== "string" || !fieldIds.has(value))
            ) {
              throw new Error(
                `View ${key} must be null or a Field ID from its Table`
              )
            }
          }
          if (layout.fieldWidths !== undefined) {
            if (
              !layout.fieldWidths ||
              Array.isArray(layout.fieldWidths) ||
              typeof layout.fieldWidths !== "object" ||
              Object.keys(layout.fieldWidths).some(
                (fieldId) => !fieldIds.has(fieldId)
              )
            ) {
              throw new Error(
                "View fieldWidths keys must be Field IDs from its Table"
              )
            }
          }
        } catch (error) {
          add(
            errors,
            "invalid-schema",
            error instanceof Error ? error.message : "Invalid View"
          )
        }
      }
    }

    const foreignKeyRows = connection.query<{ table: string; rowid: number }>(
      "PRAGMA foreign_key_check"
    )
    for (const violation of foreignKeyRows) {
      add(
        errors,
        "invalid-schema",
        `Foreign-key violation in ${violation.table}`,
        violation.table
      )
    }
  }

  if (level === "content" || level === "full") {
    const quickCheck = connection.get<{ quick_check: string }>(
      "PRAGMA quick_check"
    )
    if (quickCheck?.quick_check !== "ok") {
      add(
        errors,
        "invalid-schema",
        `SQLite quick_check failed: ${quickCheck?.quick_check ?? "unknown"}`
      )
    }
    for (const [tableId, fields] of fieldsByTable) {
      const table = tableRowsById.get(tableId)!
      const stored = fields.filter((field) => field.physicalName)
      if (stored.length === 0) continue
      const selection = stored
        .map((field) => quoteIdentifier(field.physicalName!))
        .join(", ")
      for (const row of connection.query<Record<string, EidosFileSqlPrimitive>>(
        `SELECT ${selection} FROM ${quoteIdentifier(table.physical_name)}`
      )) {
        for (const field of stored) {
          const value = row[field.physicalName!]
          if (value === null || value === undefined) continue
          if (field.type === "row-id") {
            if (!isEidosFileUuid(value)) {
              add(
                errors,
                "invalid-value",
                `${table.name}._id must be canonical lowercase UUIDv7 TEXT`
              )
            }
          }
          if (
            field.type === "number" &&
            (typeof value !== "number" || !Number.isFinite(value))
          ) {
            add(
              errors,
              "invalid-value",
              `${table.name}.${field.name} must be finite REAL`
            )
          }
          if (field.type === "checkbox" && value !== 0 && value !== 1) {
            add(
              errors,
              "invalid-value",
              `${table.name}.${field.name} must be 0, 1, or NULL`
            )
          }
          if (field.type === "date" && !isCanonicalEidosFileDate(value)) {
            add(
              errors,
              "invalid-value",
              `${table.name}.${field.name} must be canonical YYYY-MM-DD text`
            )
          }
          if (
            ["datetime", "created-time", "last-edited-time"].includes(
              field.type
            ) &&
            !isCanonicalEidosFileInstant(value)
          ) {
            add(
              errors,
              "invalid-value",
              `${table.name}.${field.name} must be canonical UTC millisecond text`
            )
          }
          if (["multi-select", "file"].includes(field.type)) {
            const parsed =
              typeof value === "string" && isCanonicalEidosFileJson(value)
                ? parseEidosFileJson(value)
                : null
            if (!Array.isArray(parsed)) {
              add(
                errors,
                "invalid-value",
                `${table.name}.${field.name} must be a canonical JSON array`
              )
            }
            if (
              field.type === "multi-select" &&
              Array.isArray(parsed) &&
              (!parsed.every((entry) => typeof entry === "string") ||
                new Set(parsed).size !== parsed.length)
            ) {
              add(
                errors,
                "invalid-value",
                `${table.name}.${field.name} must be a unique string array`
              )
            }
            if (field.type === "file" && Array.isArray(parsed)) {
              try {
                assertEidosFileValues(parsed)
              } catch (error) {
                add(
                  errors,
                  "invalid-value",
                  `${table.name}.${field.name}: ${error instanceof Error ? error.message : "invalid File value"}`
                )
              }
            }
          }
          if (
            field.type === "json" &&
            (typeof value !== "string" || !isCanonicalEidosFileJson(value))
          ) {
            add(
              errors,
              "invalid-value",
              `${table.name}.${field.name} must be canonical JSON`
            )
          }
          if (field.type === "relation") {
            const ids = relationIds(value)
            const relation = relations.get(field.id!)
            if (!ids || relation?.direction !== "forward") {
              add(
                errors,
                "invalid-value",
                `${table.name}.${field.name} must be a canonical UUID array`
              )
            } else if (relation.cardinality === "one" && ids.length > 1) {
              add(
                errors,
                "invalid-value",
                `${table.name}.${field.name} exceeds cardinality one`
              )
            }
          }
        }
      }
      for (const field of fields) {
        const relation = field.id ? relations.get(field.id) : undefined
        if (
          field.type !== "relation" ||
          relation?.direction !== "forward" ||
          !field.physicalName
        ) {
          continue
        }
        const targetTable = tableRowsById.get(
          uuid(relation.target_table_id, "Relation target Table ID")
        )
        if (!targetTable) continue
        const missing =
          connection.get<{ total: number }>(
            `SELECT count(*) AS total
             FROM ${quoteIdentifier(table.physical_name)} source,
                  json_each(CASE
                    WHEN json_valid(source.${quoteIdentifier(field.physicalName)})
                     AND json_type(source.${quoteIdentifier(field.physicalName)}) = 'array'
                    THEN source.${quoteIdentifier(field.physicalName)} ELSE '[]' END
                  ) item
            WHERE NOT EXISTS (
              SELECT 1 FROM ${quoteIdentifier(targetTable.physical_name)} target
               WHERE item.value = target."_id"
            )`
          )?.total ?? 0
        if (missing > 0) {
          add(
            warnings,
            "unresolved-relation",
            `${table.name}.${field.name} contains ${missing} unresolved Relation value${missing === 1 ? "" : "s"}`,
            table.physical_name
          )
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    metadata,
    tables,
    errors,
    warnings,
  }
}
