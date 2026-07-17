import type { BaseConnection } from "./connection"
import {
  BASE_COLUMNS_TABLE,
  BASE_FORMAT,
  BASE_FORMAT_VERSION,
  BASE_META_TABLE,
  BASE_REQUIRED_META_KEYS,
  BASE_REQUIRED_TABLES,
  BASE_SCHEMA_VERSION,
  BASE_TABLES_TABLE,
  BASE_VIEWS_TABLE,
  BASE_REFERENCES_TABLE,
} from "./constants"
import { quoteIdentifier } from "./identifiers"
import { compileBaseFormulaFields } from "./formula"
import type {
  BaseFieldInfo,
  BaseFieldType,
  BaseMetadata,
  BaseStorageCodec,
  BaseTableInfo,
  BaseValidationIssue,
  BaseValidationResult,
  BaseValueKind,
} from "./types"

interface MetaRow {
  key: string
  value: string
}

interface RegistryRow {
  id: string
  name: string
  raw_table_name: string
  position: number | null
  icon: string | null
  description: string | null
  created_at: string
  updated_at: string
}

interface FieldValidationRow {
  name: string
  type: string
  table_name: string
  table_column_name: string
  property: string | null
  storage_codec: string
  value_kind: string
  is_hidden: number
  is_derived: number
  source_table_column_name: string | null
  depends_on: string | null
}

interface ViewValidationRow {
  id: string
  name: string
  type: string
  table_id: string
  properties: string | null
  filter: string | null
  order_map: string | null
  hidden_fields: string | null
}

const FIELD_TYPES = new Set<BaseFieldType>([
  "title",
  "text",
  "number",
  "checkbox",
  "date",
  "datetime",
  "file",
  "multi-select",
  "rating",
  "select",
  "url",
  "formula",
  "link",
  "lookup",
  "created-time",
  "created-by",
  "last-edited-time",
  "last-edited-by",
  "row-id",
])
const STORAGE_CODECS = new Set<BaseStorageCodec>([
  "scalar",
  "json_array",
  "relation",
  "materialized_text",
])
const VALUE_KINDS = new Set<BaseValueKind>([
  "source",
  "relation",
  "derived",
  "materialized",
  "system",
])
const FORMULA_DISPLAY_TYPES = new Set([
  "text",
  "number",
  "checkbox",
  "date",
  "datetime",
  "url",
])
const LOOKUP_AGGREGATES = new Set([
  "first",
  "values",
  "count",
  "sum",
  "average",
  "min",
  "max",
])
const MAX_REGISTRY_ROWS = 10_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseMetadataJson(
  value: string | null,
  label: string,
  errors: BaseValidationIssue[],
  table?: string
): { valid: boolean; value: unknown } {
  if (value === null) return { valid: true, value: null }
  try {
    return { valid: true, value: JSON.parse(value) as unknown }
  } catch {
    errors.push({
      code: "invalid-metadata-json",
      message: `${label} must contain valid JSON`,
      table,
    })
    return { valid: false, value: null }
  }
}

function validateFormulaProperty(
  field: FieldValidationRow,
  property: unknown,
  errors: BaseValidationIssue[]
): void {
  if (field.type !== "formula" || field.value_kind !== "derived") return
  if (
    !isRecord(property) ||
    typeof property.formula !== "string" ||
    property.formula.trim().length === 0 ||
    !FORMULA_DISPLAY_TYPES.has(String(property.displayType))
  ) {
    errors.push({
      code: "invalid-formula-property",
      message: `Formula field ${field.table_name}.${field.table_column_name} has invalid formula metadata`,
      table: field.table_name,
    })
  }
}

function validateLookupProperty(
  field: FieldValidationRow,
  property: unknown,
  errors: BaseValidationIssue[]
): void {
  if (field.type !== "lookup" || field.value_kind !== "derived") return
  if (
    !isRecord(property) ||
    typeof property.relationField !== "string" ||
    typeof property.targetField !== "string" ||
    !LOOKUP_AGGREGATES.has(String(property.aggregate)) ||
    !FORMULA_DISPLAY_TYPES.has(String(property.displayType))
  ) {
    errors.push({
      code: "invalid-lookup-property",
      message: `Lookup field ${field.table_name}.${field.table_column_name} has invalid lookup metadata`,
      table: field.table_name,
    })
  }
}

function validateSelectProperty(
  field: FieldValidationRow,
  property: unknown,
  errors: BaseValidationIssue[]
): void {
  if (field.type !== "select" && field.type !== "multi-select") return
  if (!isRecord(property) || !Array.isArray(property.options)) {
    errors.push({
      code: "invalid-select-property",
      message: `Select field ${field.table_name}.${field.table_column_name} requires an options array`,
      table: field.table_name,
    })
    return
  }
  const values = new Set<string>()
  const invalid = property.options.some((option) => {
    if (
      !isRecord(option) ||
      typeof option.value !== "string" ||
      option.value.trim().length === 0 ||
      values.has(option.value)
    ) {
      return true
    }
    values.add(option.value)
    return false
  })
  if (invalid) {
    errors.push({
      code: "invalid-select-property",
      message: `Select field ${field.table_name}.${field.table_column_name} has invalid option values`,
      table: field.table_name,
    })
  }
}

function validateCanonicalStorageCodec(
  field: FieldValidationRow,
  property: unknown,
  errors: BaseValidationIssue[]
): void {
  const expected =
    field.type === "multi-select" || field.type === "file"
      ? "json_array"
      : field.type === "link"
        ? "relation"
        : field.type === "lookup" &&
            field.value_kind === "derived" &&
            isRecord(property) &&
            property.aggregate === "values"
          ? "json_array"
          : field.value_kind === "derived"
            ? "scalar"
            : null
  if (expected !== null && field.storage_codec !== expected) {
    errors.push({
      code: "invalid-storage-codec",
      message: `Field ${field.table_name}.${field.table_column_name} must use ${expected} storage`,
      table: field.table_name,
    })
  }
}

const REQUIRED_COLUMNS: Record<string, string[]> = {
  [BASE_META_TABLE]: ["key", "value"],
  [BASE_TABLES_TABLE]: [
    "id",
    "name",
    "raw_table_name",
    "position",
    "icon",
    "description",
    "created_at",
    "updated_at",
  ],
  [BASE_COLUMNS_TABLE]: [
    "name",
    "type",
    "table_name",
    "table_column_name",
    "property",
    "storage_codec",
    "value_kind",
    "is_hidden",
    "is_derived",
    "source_table_column_name",
    "depends_on",
    "created_at",
    "updated_at",
  ],
  [BASE_VIEWS_TABLE]: [
    "id",
    "name",
    "type",
    "table_id",
    "query",
    "properties",
    "filter",
    "order_map",
    "hidden_fields",
    "position",
    "created_at",
    "updated_at",
  ],
  [BASE_REFERENCES_TABLE]: [
    "self_table_name",
    "self_table_column_name",
    "ref_table_name",
    "ref_table_column_name",
    "link_table_name",
    "link_table_column_name",
    "self",
    "ref",
    "link",
    "created_at",
  ],
}

const REQUIRED_USER_COLUMNS = [
  "_id",
  "title",
  "_created_time",
  "_last_edited_time",
  "_created_by",
  "_last_edited_by",
]

const MIGRATABLE_V1_COLUMNS = new Set([
  "storage_codec",
  "value_kind",
  "is_hidden",
  "is_derived",
  "source_table_column_name",
  "depends_on",
])

function metadataFromRows(rows: MetaRow[]): Record<string, string> {
  return Object.fromEntries(rows.map((row) => [row.key, row.value]))
}

function mapMetadata(values: Record<string, string>): BaseMetadata | null {
  if (values.format !== BASE_FORMAT) return null
  return {
    format: BASE_FORMAT,
    formatVersion: Number(values.format_version),
    schemaVersion: Number(values.schema_version ?? 0),
    app: values.app,
    createdAt: values.created_at,
    updatedAt: values.updated_at,
    title: values.title,
    description: values.description,
    defaultTableId: values.default_table_id,
  }
}

function mapTable(row: RegistryRow): BaseTableInfo {
  return {
    id: row.id,
    name: row.name,
    rawTableName: row.raw_table_name,
    position: row.position,
    icon: row.icon,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function validateBase(connection: BaseConnection): BaseValidationResult {
  const errors: BaseValidationIssue[] = []
  const warnings: BaseValidationIssue[] = []
  const quickCheck = connection.get<{ quick_check: string }>(
    "PRAGMA quick_check"
  )
  if (quickCheck?.quick_check !== "ok") {
    errors.push({
      code: "sqlite-integrity",
      message: `SQLite integrity check failed: ${quickCheck?.quick_check ?? "unknown"}`,
    })
  }

  const sqliteTables = new Set(
    connection
      .query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table'"
      )
      .map((row) => row.name)
  )
  for (const tableName of BASE_REQUIRED_TABLES) {
    if (!sqliteTables.has(tableName)) {
      errors.push({
        code: "missing-required-table",
        message: `Missing required Base table: ${tableName}`,
        table: tableName,
      })
    }
  }

  if (!sqliteTables.has(BASE_META_TABLE)) {
    return { valid: false, metadata: null, tables: [], errors, warnings }
  }

  const metadataCount =
    connection.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ${BASE_META_TABLE}`
    )?.count ?? 0
  if (metadataCount > MAX_REGISTRY_ROWS) {
    errors.push({
      code: "metadata-limit-exceeded",
      message: `Base contains too many metadata entries (${metadataCount})`,
      table: BASE_META_TABLE,
    })
  }
  const metadataValues = metadataFromRows(
    connection.query<MetaRow>(
      `SELECT key, value FROM ${BASE_META_TABLE} LIMIT ${MAX_REGISTRY_ROWS + 1}`
    )
  )
  for (const key of BASE_REQUIRED_META_KEYS) {
    if (!metadataValues[key]) {
      errors.push({
        code: "missing-metadata",
        message: `Missing required Base metadata: ${key}`,
      })
    }
  }
  if (metadataValues.format !== BASE_FORMAT) {
    errors.push({
      code: "invalid-format",
      message: `Expected Base format ${BASE_FORMAT}`,
    })
  }
  const formatVersion = Number(metadataValues.format_version)
  if (formatVersion !== BASE_FORMAT_VERSION) {
    errors.push({
      code: "unsupported-format-version",
      message: `Unsupported Base format version: ${metadataValues.format_version ?? "missing"}`,
    })
  }
  const schemaVersion = Number(metadataValues.schema_version ?? 0)
  if (schemaVersion > BASE_SCHEMA_VERSION) {
    errors.push({
      code: "unsupported-schema-version",
      message: `Base schema version ${schemaVersion} is newer than ${BASE_SCHEMA_VERSION}`,
    })
  } else if (schemaVersion < BASE_SCHEMA_VERSION) {
    warnings.push({
      code: "schema-migration-available",
      message: `Base schema can be migrated from ${schemaVersion} to ${BASE_SCHEMA_VERSION}`,
    })
  }

  const tableColumns = new Map<string, Set<string>>()
  for (const [tableName, requiredColumns] of Object.entries(REQUIRED_COLUMNS)) {
    if (!sqliteTables.has(tableName)) continue
    const actualColumns = new Set(
      connection
        .query<{ name: string }>(
          `PRAGMA table_xinfo(${quoteIdentifier(tableName)})`
        )
        .map((column) => column.name)
    )
    tableColumns.set(tableName, actualColumns)
    for (const columnName of requiredColumns) {
      if (actualColumns.has(columnName)) continue
      const isMigratable =
        tableName === BASE_COLUMNS_TABLE &&
        schemaVersion < BASE_SCHEMA_VERSION &&
        MIGRATABLE_V1_COLUMNS.has(columnName)
      const issues = isMigratable ? warnings : errors
      issues.push({
        code: isMigratable
          ? "schema-column-migration-available"
          : "missing-required-column",
        message: `Missing required column ${tableName}.${columnName}`,
        table: tableName,
      })
    }
  }

  for (const [key, value] of [
    ["created_at", metadataValues.created_at],
    ["updated_at", metadataValues.updated_at],
  ] as const) {
    if (value && Number.isNaN(Date.parse(value))) {
      errors.push({
        code: "invalid-metadata-timestamp",
        message: `Invalid Base metadata timestamp: ${key}`,
      })
    }
  }

  const tableRegistryReady = REQUIRED_COLUMNS[BASE_TABLES_TABLE].every(
    (column) => tableColumns.get(BASE_TABLES_TABLE)?.has(column)
  )
  const tableCount =
    sqliteTables.has(BASE_TABLES_TABLE) && tableRegistryReady
      ? (connection.get<{ count: number }>(
          `SELECT COUNT(*) AS count FROM ${BASE_TABLES_TABLE}`
        )?.count ?? 0)
      : 0
  if (tableCount > MAX_REGISTRY_ROWS) {
    errors.push({
      code: "metadata-limit-exceeded",
      message: `Base contains too many table definitions (${tableCount})`,
      table: BASE_TABLES_TABLE,
    })
  }
  const tables =
    sqliteTables.has(BASE_TABLES_TABLE) &&
    tableRegistryReady &&
    tableCount <= MAX_REGISTRY_ROWS
      ? connection
          .query<RegistryRow>(
            `SELECT id, name, raw_table_name, position, icon, description,
                  created_at, updated_at
             FROM ${BASE_TABLES_TABLE}
            ORDER BY position, created_at, id`
          )
          .map(mapTable)
      : []

  for (const table of tables) {
    if (table.rawTableName !== `tb_${table.id}`) {
      errors.push({
        code: "invalid-raw-table-name",
        message: `Table ${table.id} must use raw table name tb_${table.id}`,
        table: table.rawTableName,
      })
    }
    if (!sqliteTables.has(table.rawTableName)) {
      errors.push({
        code: "missing-user-table",
        message: `Registered table is missing: ${table.rawTableName}`,
        table: table.rawTableName,
      })
      continue
    }
    const actualColumns = new Set(
      connection
        .query<{ name: string }>(
          `PRAGMA table_xinfo(${quoteIdentifier(table.rawTableName)})`
        )
        .map((column) => column.name)
    )
    tableColumns.set(table.rawTableName, actualColumns)
    for (const columnName of REQUIRED_USER_COLUMNS) {
      if (!actualColumns.has(columnName)) {
        errors.push({
          code: "missing-user-table-column",
          message: `Missing required column ${table.rawTableName}.${columnName}`,
          table: table.rawTableName,
        })
      }
    }
  }

  if (
    sqliteTables.has(BASE_COLUMNS_TABLE) &&
    sqliteTables.has(BASE_TABLES_TABLE)
  ) {
    const registeredNames = new Set(tables.map((table) => table.rawTableName))
    const orphanFields = connection.query<{ table_name: string }>(
      `SELECT DISTINCT table_name FROM ${BASE_COLUMNS_TABLE}
        WHERE table_name NOT IN (SELECT raw_table_name FROM ${BASE_TABLES_TABLE})`
    )
    for (const field of orphanFields) {
      if (!registeredNames.has(field.table_name)) {
        errors.push({
          code: "orphan-field-metadata",
          message: `Field metadata references an unregistered table: ${field.table_name}`,
          table: field.table_name,
        })
      }
    }
  }

  const fieldMetadataReady = REQUIRED_COLUMNS[BASE_COLUMNS_TABLE].every(
    (column) => tableColumns.get(BASE_COLUMNS_TABLE)?.has(column)
  )
  if (sqliteTables.has(BASE_COLUMNS_TABLE) && fieldMetadataReady) {
    const fieldCount =
      connection.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${BASE_COLUMNS_TABLE}`
      )?.count ?? 0
    if (fieldCount > MAX_REGISTRY_ROWS) {
      errors.push({
        code: "metadata-limit-exceeded",
        message: `Base contains too many field definitions (${fieldCount})`,
        table: BASE_COLUMNS_TABLE,
      })
    } else {
      const fields = connection.query<FieldValidationRow>(
        `SELECT name, type, table_name, table_column_name, property,
                storage_codec, value_kind, is_hidden, is_derived,
                source_table_column_name, depends_on
           FROM ${BASE_COLUMNS_TABLE}`
      )
      const formulaFields = new Map<string, BaseFieldInfo[]>()
      const registeredTables = new Map(
        tables.map((table) => [table.rawTableName, table])
      )
      for (const field of fields) {
        const fieldLabel = `${field.table_name}.${field.table_column_name}`
        const registeredTable = registeredTables.get(field.table_name)
        const typeValid = FIELD_TYPES.has(field.type as BaseFieldType)
        const codecValid = STORAGE_CODECS.has(
          field.storage_codec as BaseStorageCodec
        )
        const valueKindValid = VALUE_KINDS.has(
          field.value_kind as BaseValueKind
        )
        if (!field.name.trim() || !field.table_column_name.trim()) {
          errors.push({
            code: "invalid-field-identifier",
            message: `Field ${fieldLabel} requires a name and column name`,
            table: field.table_name,
          })
        }
        if (!typeValid) {
          errors.push({
            code: "invalid-field-type",
            message: `Field ${fieldLabel} has unsupported type: ${field.type}`,
            table: field.table_name,
          })
        }
        if (!codecValid) {
          errors.push({
            code: "invalid-storage-codec",
            message: `Field ${fieldLabel} has unsupported storage codec: ${field.storage_codec}`,
            table: field.table_name,
          })
        }
        if (!valueKindValid) {
          errors.push({
            code: "invalid-value-kind",
            message: `Field ${fieldLabel} has unsupported value kind: ${field.value_kind}`,
            table: field.table_name,
          })
        }
        if (
          ![0, 1].includes(field.is_hidden) ||
          ![0, 1].includes(field.is_derived)
        ) {
          errors.push({
            code: "invalid-field-flag",
            message: `Field ${fieldLabel} has invalid boolean flags`,
            table: field.table_name,
          })
        }
        if (
          registeredTable &&
          tableColumns.has(registeredTable.rawTableName) &&
          field.value_kind !== "derived" &&
          !tableColumns
            .get(registeredTable.rawTableName)
            ?.has(field.table_column_name)
        ) {
          errors.push({
            code: "missing-field-column",
            message: `Stored field column is missing: ${fieldLabel}`,
            table: field.table_name,
          })
        }

        const parsedProperty = parseMetadataJson(
          field.property,
          `Field property ${fieldLabel}`,
          errors,
          field.table_name
        )
        if (
          parsedProperty.valid &&
          parsedProperty.value !== null &&
          !isRecord(parsedProperty.value)
        ) {
          errors.push({
            code: "invalid-field-property",
            message: `Field property ${fieldLabel} must be a JSON object`,
            table: field.table_name,
          })
        }
        validateFormulaProperty(field, parsedProperty.value, errors)
        validateLookupProperty(field, parsedProperty.value, errors)
        validateSelectProperty(field, parsedProperty.value, errors)
        validateCanonicalStorageCodec(field, parsedProperty.value, errors)

        const parsedDependencies = parseMetadataJson(
          field.depends_on,
          `Field dependencies ${fieldLabel}`,
          errors,
          field.table_name
        )
        if (
          parsedDependencies.valid &&
          parsedDependencies.value !== null &&
          (!Array.isArray(parsedDependencies.value) ||
            !parsedDependencies.value.every(
              (dependency) => typeof dependency === "string"
            ))
        ) {
          errors.push({
            code: "invalid-field-dependencies",
            message: `Field dependencies ${fieldLabel} must be an array of column names`,
            table: field.table_name,
          })
        }

        if (
          registeredTable &&
          typeValid &&
          codecValid &&
          valueKindValid &&
          parsedProperty.valid &&
          parsedDependencies.valid
        ) {
          const tableFields = formulaFields.get(field.table_name) ?? []
          tableFields.push({
            name: field.name,
            type: field.type as BaseFieldType,
            tableName: field.table_name,
            tableColumnName: field.table_column_name,
            property: isRecord(parsedProperty.value)
              ? parsedProperty.value
              : null,
            storageCodec: field.storage_codec as BaseStorageCodec,
            valueKind: field.value_kind as BaseValueKind,
            isHidden: field.is_hidden === 1,
            isDerived: field.is_derived === 1,
            sourceTableColumnName: field.source_table_column_name,
            dependsOn: parsedDependencies.value,
          })
          formulaFields.set(field.table_name, tableFields)
        }
      }
      for (const [tableName, tableFields] of formulaFields) {
        try {
          compileBaseFormulaFields(tableFields)
        } catch (error) {
          errors.push({
            code: "invalid-formula-definition",
            message:
              error instanceof Error
                ? error.message
                : `Unable to validate formulas in ${tableName}`,
            table: tableName,
          })
        }
      }
    }
  }

  const viewMetadataReady = REQUIRED_COLUMNS[BASE_VIEWS_TABLE].every((column) =>
    tableColumns.get(BASE_VIEWS_TABLE)?.has(column)
  )
  if (sqliteTables.has(BASE_VIEWS_TABLE) && viewMetadataReady) {
    const viewCount =
      connection.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${BASE_VIEWS_TABLE}`
      )?.count ?? 0
    if (viewCount > MAX_REGISTRY_ROWS) {
      errors.push({
        code: "metadata-limit-exceeded",
        message: `Base contains too many view definitions (${viewCount})`,
        table: BASE_VIEWS_TABLE,
      })
    } else {
      const tableIds = new Set(tables.map((table) => table.id))
      for (const view of connection.query<ViewValidationRow>(
        `SELECT id, name, type, table_id, properties, filter, order_map,
                hidden_fields FROM ${BASE_VIEWS_TABLE}`
      )) {
        if (!view.id.trim() || !view.name.trim() || !view.type.trim()) {
          errors.push({
            code: "invalid-view-identifier",
            message: `Base view ${view.id || "<missing>"} requires an id, name, and type`,
            table: BASE_VIEWS_TABLE,
          })
        }
        if (!tableIds.has(view.table_id)) {
          errors.push({
            code: "orphan-view-metadata",
            message: `Base view ${view.id} references an unknown table: ${view.table_id}`,
            table: BASE_VIEWS_TABLE,
          })
        }
        const properties = parseMetadataJson(
          view.properties,
          `View properties ${view.id}`,
          errors,
          BASE_VIEWS_TABLE
        )
        if (
          properties.valid &&
          properties.value !== null &&
          !isRecord(properties.value)
        ) {
          errors.push({
            code: "invalid-view-properties",
            message: `View properties ${view.id} must be a JSON object`,
            table: BASE_VIEWS_TABLE,
          })
        }
        const filter = parseMetadataJson(
          view.filter,
          `View filter ${view.id}`,
          errors,
          BASE_VIEWS_TABLE
        )
        if (filter.valid && filter.value !== null && !isRecord(filter.value)) {
          errors.push({
            code: "invalid-view-filter",
            message: `View filter ${view.id} must be a JSON object`,
            table: BASE_VIEWS_TABLE,
          })
        }
        const orderMap = parseMetadataJson(
          view.order_map,
          `View order map ${view.id}`,
          errors,
          BASE_VIEWS_TABLE
        )
        if (
          orderMap.valid &&
          orderMap.value !== null &&
          (!isRecord(orderMap.value) ||
            !Object.values(orderMap.value).every(
              (position) =>
                typeof position === "number" && Number.isFinite(position)
            ))
        ) {
          errors.push({
            code: "invalid-view-order-map",
            message: `View order map ${view.id} must map fields to finite numbers`,
            table: BASE_VIEWS_TABLE,
          })
        }
        const hiddenFields = parseMetadataJson(
          view.hidden_fields,
          `View hidden fields ${view.id}`,
          errors,
          BASE_VIEWS_TABLE
        )
        if (
          hiddenFields.valid &&
          hiddenFields.value !== null &&
          (!Array.isArray(hiddenFields.value) ||
            !hiddenFields.value.every((field) => typeof field === "string"))
        ) {
          errors.push({
            code: "invalid-view-hidden-fields",
            message: `View hidden fields ${view.id} must be an array of column names`,
            table: BASE_VIEWS_TABLE,
          })
        }
      }
    }
  }

  if (sqliteTables.has(BASE_REFERENCES_TABLE)) {
    const referenceCount =
      connection.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${BASE_REFERENCES_TABLE}`
      )?.count ?? 0
    if (referenceCount > MAX_REGISTRY_ROWS) {
      errors.push({
        code: "metadata-limit-exceeded",
        message: `Base contains too many reference definitions (${referenceCount})`,
        table: BASE_REFERENCES_TABLE,
      })
    }
  }

  if (
    metadataValues.default_table_id &&
    !tables.some((table) => table.id === metadataValues.default_table_id)
  ) {
    errors.push({
      code: "invalid-default-table",
      message: `Default table is not registered: ${metadataValues.default_table_id}`,
    })
  }

  return {
    valid: errors.length === 0,
    metadata: mapMetadata(metadataValues),
    tables,
    errors,
    warnings,
  }
}
