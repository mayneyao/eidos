import type {
  BaseConnection,
  BaseSqlParams,
  BaseSqlPrimitive,
} from "./connection"
import {
  BASE_COLUMNS_TABLE,
  BASE_META_TABLE,
  BASE_REFERENCES_TABLE,
  BASE_TABLES_TABLE,
  BASE_VIEWS_TABLE,
} from "./constants"
import { BaseError } from "./errors"
import {
  decodeBaseMultiSelectIds,
  encodeBaseMultiSelectIds,
  isMutableBaseFieldType,
  planBaseFieldConversion,
} from "./field-conversion"
import { decodeBaseFilePaths, encodeBaseFilePaths } from "./file-values"
import { compileBaseFormula, compileBaseFormulaFields } from "./formula"
import { decodeBaseRelationIds, encodeBaseRelationIds } from "./relation-values"
import {
  assertBaseColumnName,
  assertBaseTableId,
  createBaseId,
  quoteIdentifier,
  rawTableNameForId,
} from "./identifiers"
import { setBaseMetadata } from "./schema"
import {
  compileBaseRowQuery,
  normalizeBaseFilter,
  normalizeBaseSorts,
  removeBaseFilterField,
} from "./query"
import type {
  BaseColumnStatConfig,
  BaseColumnStatResult,
  BaseFieldInfo,
  BaseFieldPlacement,
  BaseFieldType,
  BaseFormulaPreview,
  BaseFormulaPreviewInput,
  BaseMetadata,
  BaseLookupAggregate,
  BaseRow,
  BaseRowGroupCount,
  BaseRowPage,
  BaseRowQuery,
  BaseRowRange,
  BaseRowUpdate,
  BaseStorageCodec,
  BaseTableInfo,
  BaseViewInfo,
  CreateBaseFieldInput,
  CreateBaseReferenceInput,
  CreateBaseTableInput,
  CreateBaseViewInput,
  ImportBaseFieldInput,
  UpdateBaseFieldInput,
  UpdateBaseTableInput,
  UpdateBaseViewInput,
} from "./types"
import {
  baseColumnStatTypesForField,
  compileBaseColumnStatExpression,
  normalizeBaseColumnStatConfigs,
} from "./column-stats"
import { validateBase } from "./validation"

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

const BASE_VIEW_QUERY_INDEX_PREFIX = "eidos__view_query_"
const BASE_NOCASE_SORT_TYPES = new Set([
  "title",
  "text",
  "url",
  "select",
  "multi-select",
  "file",
])

function baseViewQueryIndexName(viewId: string): string {
  return `${BASE_VIEW_QUERY_INDEX_PREFIX}${viewId}`
}

function baseFieldUsesNoCaseSort(field: BaseFieldInfo): boolean {
  const displayType =
    (field.type === "formula" || field.type === "lookup") &&
    typeof field.property?.displayType === "string"
      ? field.property.displayType
      : field.type
  return BASE_NOCASE_SORT_TYPES.has(displayType)
}

function normalizedSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim()
}

interface FieldRow {
  name: string
  type: BaseFieldType
  table_name: string
  table_column_name: string
  property: string | null
  storage_codec: BaseStorageCodec
  value_kind: BaseFieldInfo["valueKind"]
  is_hidden: number
  is_derived: number
  source_table_column_name: string | null
  depends_on: string | null
}

interface ViewRow {
  id: string
  name: string
  type: string
  table_id: string
  query: string
  properties: string | null
  filter: string | null
  order_map: string | null
  hidden_fields: string | null
  position: number | null
  created_at: string
  updated_at: string
}

const SYSTEM_FIELDS: Array<{
  name: string
  type: BaseFieldType
  columnName: string
  hidden: boolean
}> = [
  { name: "_id", type: "row-id", columnName: "_id", hidden: true },
  { name: "title", type: "title", columnName: "title", hidden: false },
  {
    name: "Created time",
    type: "created-time",
    columnName: "_created_time",
    hidden: true,
  },
  {
    name: "Last edited time",
    type: "last-edited-time",
    columnName: "_last_edited_time",
    hidden: true,
  },
  {
    name: "Created by",
    type: "created-by",
    columnName: "_created_by",
    hidden: true,
  },
  {
    name: "Last edited by",
    type: "last-edited-by",
    columnName: "_last_edited_by",
    hidden: true,
  },
]

const SYSTEM_FIELD_COLUMNS = new Set(
  SYSTEM_FIELDS.map((field) => field.columnName)
)

function assertKnownFieldColumnName(columnName: string): string {
  return SYSTEM_FIELD_COLUMNS.has(columnName)
    ? columnName
    : assertBaseColumnName(columnName)
}

function tableInfoFromRow(row: RegistryRow): BaseTableInfo {
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

function parseJson(value: string | null): unknown {
  if (value === null) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function sqlTypeForField(type: BaseFieldType): string {
  if (type === "checkbox") return "BOOLEAN"
  if (type === "number") return "REAL"
  if (type === "rating") return "INT"
  return "TEXT"
}

function defaultStorageCodec(type: BaseFieldType): BaseStorageCodec {
  if (type === "multi-select") return "csv_ids"
  if (type === "file") return "json_array"
  if (type === "link") return "relation"
  if (type === "formula" || type === "lookup") return "materialized_text"
  return "scalar"
}

function sqliteParameter(value: BaseRow[string]): BaseSqlParams[number] {
  return typeof value === "boolean" ? (value ? 1 : 0) : value
}

function writableFieldValue(
  field: BaseFieldInfo | undefined,
  value: BaseRow[string]
): BaseRow[string] {
  if (value === null) return value
  if (field?.type === "file") {
    return encodeBaseFilePaths(decodeBaseFilePaths(value))
  }
  if (field?.type === "link") {
    return encodeBaseRelationIds(decodeBaseRelationIds(value))
  }
  return value
}

export class BaseRuntime {
  constructor(
    readonly connection: BaseConnection,
    private readonly closeConnection = false
  ) {}

  close(): void {
    if (this.closeConnection) this.connection.close?.()
  }

  private relationTarget(
    field: BaseFieldInfo
  ): { tableId: string; columnName: string } | null {
    if (field.type !== "link") return null
    const targetTableId = field.property?.targetTableId
    const targetField = field.property?.targetField
    if (typeof targetTableId === "string" && typeof targetField === "string") {
      return { tableId: targetTableId, columnName: targetField }
    }
    const legacyTableName = field.property?.linkTableName
    const legacyColumnName = field.property?.linkColumnName
    if (
      typeof legacyTableName !== "string" ||
      typeof legacyColumnName !== "string"
    ) {
      return null
    }
    const table = this.listTables().find(
      (candidate) => candidate.rawTableName === legacyTableName
    )
    return table ? { tableId: table.id, columnName: legacyColumnName } : null
  }

  private rowSourceSql(tableId: string, fields: BaseFieldInfo[]): string {
    const table = this.getTable(tableId)
    let alias = "base_rows"
    let source = `(SELECT rowid AS "__base_rowid", *
                     FROM ${quoteIdentifier(table.rawTableName)}) AS ${quoteIdentifier(alias)}`
    fields
      .filter(
        (field) =>
          field.type === "lookup" &&
          field.valueKind === "derived" &&
          field.isDerived
      )
      .forEach((field, index) => {
        const expression = this.lookupExpression(tableId, field, fields, alias)
        const nextAlias = `lookup_layer_${index + 1}`
        source = `(SELECT ${quoteIdentifier(alias)}.*, (${expression}) AS ${quoteIdentifier(field.tableColumnName)}
                     FROM ${source}) AS ${quoteIdentifier(nextAlias)}`
        alias = nextAlias
      })
    compileBaseFormulaFields(fields).forEach((formula, index) => {
      const nextAlias = `formula_layer_${index + 1}`
      source = `(SELECT *, (${formula.expression}) AS ${quoteIdentifier(formula.field.tableColumnName)}
                   FROM ${source}) AS ${quoteIdentifier(nextAlias)}`
      alias = nextAlias
    })
    return source
  }

  private viewQueryIndexSql(view: BaseViewInfo): string | null {
    if (view.type !== "gallery" && view.type !== "kanban") return null
    const table = this.getTable(view.tableId)
    const fields = this.listFields(view.tableId)
    const fieldsByColumn = new Map(
      fields.map((field) => [field.tableColumnName, field])
    )
    const columns: string[] = []
    const seen = new Set<string>()
    const groupByField =
      view.type === "kanban" &&
      typeof view.properties?.groupByField === "string"
        ? fieldsByColumn.get(view.properties.groupByField)
        : undefined

    if (groupByField && !groupByField.isDerived) {
      columns.push(quoteIdentifier(groupByField.tableColumnName))
      seen.add(groupByField.tableColumnName)
    }

    for (const sort of view.sorts) {
      if (seen.has(sort.field)) continue
      const field = fieldsByColumn.get(sort.field)
      if (!field || field.isDerived) break
      columns.push(
        `${quoteIdentifier(field.tableColumnName)}${
          baseFieldUsesNoCaseSort(field) ? " COLLATE NOCASE" : ""
        } ${sort.direction === "desc" ? "DESC" : "ASC"}`
      )
      seen.add(field.tableColumnName)
    }

    if (columns.length === 0) return null
    return `CREATE INDEX ${quoteIdentifier(
      baseViewQueryIndexName(view.id)
    )} ON ${quoteIdentifier(table.rawTableName)} (${columns.join(", ")})`
  }

  private syncViewQueryIndex(view: BaseViewInfo): void {
    const indexName = baseViewQueryIndexName(view.id)
    const expectedSql = this.viewQueryIndexSql(view)
    const existing = this.connection.get<{ sql: string | null }>(
      `SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?`,
      [indexName]
    )
    if (
      expectedSql &&
      existing?.sql &&
      normalizedSql(existing.sql) === normalizedSql(expectedSql)
    ) {
      return
    }
    if (existing) {
      this.connection.exec(`DROP INDEX ${quoteIdentifier(indexName)}`)
    }
    if (expectedSql) this.connection.exec(expectedSql)
  }

  private dropViewQueryIndexes(tableId: string): void {
    const table = this.getTable(tableId)
    const indexes = this.connection.query<{ name: string }>(
      `SELECT name FROM sqlite_master
        WHERE type = 'index' AND tbl_name = ? AND name GLOB ?`,
      [table.rawTableName, `${BASE_VIEW_QUERY_INDEX_PREFIX}*`]
    )
    for (const index of indexes) {
      this.connection.exec(`DROP INDEX ${quoteIdentifier(index.name)}`)
    }
  }

  optimizeViewQueries(tableId?: string): void {
    const tables = tableId ? [this.getTable(tableId)] : this.listTables()
    for (const table of tables) {
      const views = this.listViews(table.id)
      const expectedNames = new Set(
        views.map((view) => baseViewQueryIndexName(view.id))
      )
      const indexes = this.connection.query<{ name: string }>(
        `SELECT name FROM sqlite_master
          WHERE type = 'index' AND tbl_name = ? AND name GLOB ?`,
        [table.rawTableName, `${BASE_VIEW_QUERY_INDEX_PREFIX}*`]
      )
      for (const index of indexes) {
        if (!expectedNames.has(index.name)) {
          this.connection.exec(`DROP INDEX ${quoteIdentifier(index.name)}`)
        }
      }
      for (const view of views) this.syncViewQueryIndex(view)
    }
  }

  private lookupExpression(
    tableId: string,
    field: BaseFieldInfo,
    fields: BaseFieldInfo[],
    sourceAlias: string
  ): string {
    const relationColumn = field.property?.relationField
    const targetColumn = field.property?.targetField
    const aggregate = field.property?.aggregate
    const aggregates = new Set<BaseLookupAggregate>([
      "first",
      "values",
      "count",
      "sum",
      "average",
      "min",
      "max",
    ])
    if (
      typeof relationColumn !== "string" ||
      typeof targetColumn !== "string" ||
      typeof aggregate !== "string" ||
      !aggregates.has(aggregate as BaseLookupAggregate)
    ) {
      throw new BaseError(
        "invalid-schema",
        `Lookup field “${field.name}” has incomplete settings`
      )
    }
    const relation = fields.find(
      (candidate) => candidate.tableColumnName === relationColumn
    )
    if (!relation || relation.type !== "link") {
      throw new BaseError(
        "field-not-found",
        `Lookup relation field not found: ${relationColumn}`
      )
    }
    const target = this.relationTarget(relation)
    if (!target) {
      throw new BaseError(
        "invalid-schema",
        `Relation field “${relation.name}” has no target table`
      )
    }
    const targetTable = this.getTable(target.tableId)
    const targetField = this.getField(target.tableId, targetColumn)
    if (targetField.isDerived) {
      throw new BaseError(
        "invalid-schema",
        "A Base lookup target must be stored on the related table"
      )
    }
    if (this.getTable(tableId).rawTableName !== field.tableName) {
      throw new BaseError(
        "invalid-schema",
        "Lookup field belongs to another table"
      )
    }
    const outerRelation = `${quoteIdentifier(sourceAlias)}.${quoteIdentifier(relationColumn)}`
    const targetAlias = quoteIdentifier("lookup_target")
    const targetValue = `${targetAlias}.${quoteIdentifier(targetColumn)}`
    const membership = `(CASE
      WHEN json_valid(${outerRelation})
      THEN EXISTS (
        SELECT 1 FROM json_each(${outerRelation})
         WHERE CAST(value AS TEXT) = CAST(${targetAlias}._id AS TEXT)
      )
      ELSE instr(
        ',' || COALESCE(CAST(${outerRelation} AS TEXT), '') || ',',
        ',' || CAST(${targetAlias}._id AS TEXT) || ','
      ) > 0
    END)`
    const from = `${quoteIdentifier(targetTable.rawTableName)} AS ${targetAlias}`
    if (aggregate === "first") {
      return `SELECT ${targetValue} FROM ${from}
               WHERE ${membership} ORDER BY ${targetAlias}.rowid LIMIT 1`
    }
    if (aggregate === "values") {
      return `SELECT group_concat(CAST(${targetValue} AS TEXT), ', ')
                FROM ${from} WHERE ${membership}`
    }
    if (aggregate === "count") {
      return `SELECT COUNT(*) FROM ${from} WHERE ${membership}`
    }
    const functionName =
      aggregate === "average" ? "AVG" : aggregate.toUpperCase()
    return `SELECT ${functionName}(CAST(${targetValue} AS REAL))
              FROM ${from} WHERE ${membership}`
  }

  private getComputedRow(
    tableId: string,
    rowId: BaseSqlParams[number],
    fields: BaseFieldInfo[]
  ): BaseRow | undefined {
    const row = this.connection.get<BaseRow>(
      `SELECT * FROM ${this.rowSourceSql(tableId, fields)} WHERE _id = ?`,
      [rowId]
    )
    if (row) delete row.__base_rowid
    return row
  }

  previewFormula(
    tableId: string,
    input: BaseFormulaPreviewInput
  ): BaseFormulaPreview {
    const table = this.getTable(tableId)
    const columnName = assertBaseColumnName(input.columnName)
    const fields = this.listFields(tableId)
    const existing = fields.find(
      (field) => field.tableColumnName === columnName
    )
    if (existing && existing.type !== "formula") {
      throw new BaseError(
        "invalid-schema",
        `Base field “${existing.name}” is not a formula`
      )
    }
    const draft: BaseFieldInfo = existing
      ? {
          ...existing,
          name: input.name.trim() || existing.name,
          property: {
            formula: input.formula,
            displayType: input.displayType,
          },
          dependsOn: null,
        }
      : {
          name: input.name.trim() || columnName,
          type: "formula",
          tableName: table.rawTableName,
          tableColumnName: columnName,
          property: {
            formula: input.formula,
            displayType: input.displayType,
          },
          storageCodec: "scalar",
          valueKind: "derived",
          isHidden: false,
          isDerived: true,
          sourceTableColumnName: null,
          dependsOn: null,
        }
    const draftFields = existing
      ? fields.map((field) =>
          field.tableColumnName === columnName ? draft : field
        )
      : [...fields, draft]
    const compiled = compileBaseFormula(draft, draftFields)
    const resolvedDraft: BaseFieldInfo = {
      ...draft,
      property: {
        ...draft.property,
        expression: compiled.expression,
      },
      dependsOn: compiled.dependencies,
    }
    const previewFields = draftFields.map((field) =>
      field.tableColumnName === columnName ? resolvedDraft : field
    )
    compileBaseFormulaFields(previewFields)
    const samples = this.connection.query<{
      row_id: BaseRow[string]
      title: BaseRow[string]
      value: BaseRow[string]
    }>(
      `SELECT _id AS row_id, title, ${quoteIdentifier(columnName)} AS value
         FROM ${this.rowSourceSql(tableId, previewFields)}
        ORDER BY "__base_rowid" ASC
        LIMIT 3`
    )
    return {
      expression: compiled.expression,
      dependencies: compiled.dependencies.map((dependency) => {
        const field = previewFields.find(
          (candidate) => candidate.tableColumnName === dependency
        )
        return {
          name: field?.name ?? dependency,
          columnName: dependency,
        }
      }),
      samples: samples.map((sample) => ({
        rowId: String(sample.row_id),
        title: sample.title === null ? null : String(sample.title),
        value: sample.value,
      })),
    }
  }

  info(): BaseMetadata {
    const result = validateBase(this.connection)
    if (!result.valid || !result.metadata) {
      throw new BaseError(
        "invalid-schema",
        result.errors.map((issue) => issue.message).join("; ") ||
          "Invalid Base file"
      )
    }
    return result.metadata
  }

  listTables(): BaseTableInfo[] {
    return this.connection
      .query<RegistryRow>(
        `SELECT id, name, raw_table_name, position, icon, description,
                created_at, updated_at
           FROM ${BASE_TABLES_TABLE}
          ORDER BY position, created_at, id`
      )
      .map(tableInfoFromRow)
  }

  getTable(tableId: string): BaseTableInfo {
    assertBaseTableId(tableId)
    const row = this.connection.get<RegistryRow>(
      `SELECT id, name, raw_table_name, position, icon, description,
              created_at, updated_at
         FROM ${BASE_TABLES_TABLE}
        WHERE id = ?`,
      [tableId]
    )
    if (!row) {
      throw new BaseError("table-not-found", `Base table not found: ${tableId}`)
    }
    return tableInfoFromRow(row)
  }

  createTable(input: CreateBaseTableInput): BaseTableInfo {
    const tableId = assertBaseTableId(input.id ?? createBaseId("table"))
    const rawTableName = rawTableNameForId(tableId)
    const quotedTable = quoteIdentifier(rawTableName)
    const position =
      this.connection.get<{ position: number }>(
        `SELECT COALESCE(MAX(position), 0) + 1 AS position FROM ${BASE_TABLES_TABLE}`
      )?.position ?? 1

    this.connection.transaction(() => {
      this.connection.exec(`
        CREATE TABLE ${quotedTable} (
          _id TEXT PRIMARY KEY NOT NULL,
          title TEXT NULL,
          _created_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          _last_edited_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          _created_by TEXT DEFAULT 'unknown',
          _last_edited_by TEXT DEFAULT 'unknown'
        );
      `)
      this.connection.run(
        `INSERT INTO ${BASE_TABLES_TABLE}
          (id, name, raw_table_name, position, icon, description)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          tableId,
          input.name,
          rawTableName,
          position,
          input.icon ?? null,
          input.description ?? null,
        ]
      )
      for (const field of SYSTEM_FIELDS) {
        this.connection.run(
          `INSERT INTO ${BASE_COLUMNS_TABLE}
            (name, type, table_name, table_column_name, storage_codec,
             value_kind, is_hidden, is_derived)
           VALUES (?, ?, ?, ?, 'scalar', 'system', ?, 0)`,
          [
            field.name,
            field.type,
            rawTableName,
            field.columnName,
            field.hidden ? 1 : 0,
          ]
        )
      }
      for (const field of input.fields ?? []) this.addField(tableId, field)
      if (input.createDefaultView !== false) {
        this.connection.run(
          `INSERT INTO ${BASE_VIEWS_TABLE}
            (id, name, type, table_id, query, position)
           VALUES (?, 'Grid', 'grid', ?, ?, 1)`,
          [createBaseId("view"), tableId, `SELECT * FROM ${quotedTable}`]
        )
      }
      const currentDefault = this.connection.get<{ value: string }>(
        `SELECT value FROM ${BASE_META_TABLE} WHERE key = 'default_table_id'`
      )
      if (!currentDefault) {
        setBaseMetadata(this.connection, { default_table_id: tableId })
      }
    })
    return this.getTable(tableId)
  }

  updateTable(tableId: string, changes: UpdateBaseTableInput): BaseTableInfo {
    const table = this.getTable(tableId)
    const name = changes.name === undefined ? table.name : changes.name.trim()
    if (!name) {
      throw new BaseError("invalid-identifier", "Base table name is required")
    }
    this.connection.transaction(() => {
      this.connection.run(
        `UPDATE ${BASE_TABLES_TABLE}
            SET name = ?, icon = ?, description = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [
          name,
          changes.icon === undefined ? table.icon : changes.icon,
          changes.description === undefined
            ? table.description
            : changes.description,
          tableId,
        ]
      )
      setBaseMetadata(this.connection, {})
    })
    return this.getTable(tableId)
  }

  deleteTable(tableId: string): boolean {
    const table = this.getTable(tableId)
    const inboundRelations = this.listTables().flatMap((sourceTable) =>
      sourceTable.id === tableId
        ? []
        : this.listFields(sourceTable.id).filter(
            (field) => this.relationTarget(field)?.tableId === tableId
          )
    )
    if (inboundRelations.length > 0) {
      throw new BaseError(
        "relation-in-use",
        `Base table “${table.name}” is used by ${inboundRelations.length} relation field${inboundRelations.length === 1 ? "" : "s"}`
      )
    }
    return this.connection.transaction(() => {
      this.connection.run(
        `DELETE FROM ${BASE_REFERENCES_TABLE}
          WHERE self_table_name = ? OR ref_table_name = ? OR link_table_name = ?`,
        [table.rawTableName, table.rawTableName, table.rawTableName]
      )
      this.connection.run(
        `DELETE FROM ${BASE_VIEWS_TABLE} WHERE table_id = ?`,
        [tableId]
      )
      this.connection.run(
        `DELETE FROM ${BASE_COLUMNS_TABLE} WHERE table_name = ?`,
        [table.rawTableName]
      )
      this.connection.run(`DELETE FROM ${BASE_TABLES_TABLE} WHERE id = ?`, [
        tableId,
      ])
      this.connection.exec(`DROP TABLE ${quoteIdentifier(table.rawTableName)}`)

      const currentDefault = this.connection.get<{ value: string }>(
        `SELECT value FROM ${BASE_META_TABLE} WHERE key = 'default_table_id'`
      )
      if (currentDefault?.value === tableId) {
        const nextDefault = this.connection.get<{ id: string }>(
          `SELECT id FROM ${BASE_TABLES_TABLE}
            ORDER BY position, created_at, id LIMIT 1`
        )
        if (nextDefault) {
          this.connection.run(
            `UPDATE ${BASE_META_TABLE} SET value = ? WHERE key = 'default_table_id'`,
            [nextDefault.id]
          )
        } else {
          this.connection.run(
            `DELETE FROM ${BASE_META_TABLE} WHERE key = 'default_table_id'`
          )
        }
      }
      setBaseMetadata(this.connection, {})
      return true
    })
  }

  listFields(tableId: string): BaseFieldInfo[] {
    const table = this.getTable(tableId)
    return this.connection
      .query<FieldRow>(
        `SELECT name, type, table_name, table_column_name, property,
                storage_codec, value_kind, is_hidden, is_derived,
                source_table_column_name, depends_on
           FROM ${BASE_COLUMNS_TABLE}
          WHERE table_name = ?
          ORDER BY created_at, rowid`,
        [table.rawTableName]
      )
      .map((field) => ({
        name: field.name,
        type: field.type,
        tableName: field.table_name,
        tableColumnName: field.table_column_name,
        property: parseJson(field.property) as Record<string, unknown> | null,
        storageCodec: field.storage_codec,
        valueKind: field.value_kind,
        isHidden: field.is_hidden === 1,
        isDerived: field.is_derived === 1,
        sourceTableColumnName: field.source_table_column_name,
        dependsOn: parseJson(field.depends_on),
      }))
  }

  listViews(tableId: string): BaseViewInfo[] {
    this.getTable(tableId)
    return this.connection
      .query<ViewRow>(
        `SELECT id, name, type, table_id, query, properties, filter,
                order_map, hidden_fields, position, created_at, updated_at
           FROM ${BASE_VIEWS_TABLE}
          WHERE table_id = ?
          ORDER BY position, created_at, id`,
        [tableId]
      )
      .map((view) => {
        const properties = parseJson(view.properties) as Record<
          string,
          unknown
        > | null
        return {
          id: view.id,
          name: view.name,
          type: view.type,
          tableId: view.table_id,
          query: view.query,
          properties,
          filter: normalizeBaseFilter(parseJson(view.filter)),
          sorts: normalizeBaseSorts(properties?.sorts),
          orderMap: parseJson(view.order_map) as Record<string, number> | null,
          hiddenFields:
            (parseJson(view.hidden_fields) as string[] | null) ?? [],
          position: view.position,
          createdAt: view.created_at,
          updatedAt: view.updated_at,
        }
      })
  }

  updateView(viewId: string, changes: UpdateBaseViewInput): BaseViewInfo {
    const existing = this.connection.get<ViewRow>(
      `SELECT id, name, type, table_id, query, properties, filter,
              order_map, hidden_fields, position, created_at, updated_at
         FROM ${BASE_VIEWS_TABLE}
        WHERE id = ?`,
      [viewId]
    )
    if (!existing) {
      throw new BaseError("view-not-found", `Base view not found: ${viewId}`)
    }
    const name =
      changes.name === undefined ? existing.name : changes.name.trim()
    if (!name) {
      throw new BaseError("invalid-identifier", "Base view name is required")
    }
    if (
      changes.position !== undefined &&
      changes.position !== null &&
      (!Number.isSafeInteger(changes.position) || changes.position < 0)
    ) {
      throw new BaseError(
        "invalid-range",
        "Base view position must be a non-negative integer"
      )
    }
    const currentProperties = parseJson(existing.properties) as Record<
      string,
      unknown
    > | null
    const requestedProperties =
      changes.properties === undefined ? currentProperties : changes.properties
    const properties =
      changes.sorts === undefined
        ? requestedProperties
        : {
            ...(requestedProperties ?? {}),
            sorts: normalizeBaseSorts(changes.sorts),
          }
    this.connection.transaction(() => {
      this.connection.run(
        `UPDATE ${BASE_VIEWS_TABLE}
            SET name = ?, position = ?, properties = ?, filter = ?,
                order_map = ?, hidden_fields = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [
          name,
          changes.position === undefined ? existing.position : changes.position,
          JSON.stringify(properties),
          JSON.stringify(
            changes.filter === undefined
              ? normalizeBaseFilter(parseJson(existing.filter))
              : normalizeBaseFilter(changes.filter)
          ),
          JSON.stringify(
            changes.orderMap === undefined
              ? parseJson(existing.order_map)
              : changes.orderMap
          ),
          JSON.stringify(
            changes.hiddenFields === undefined
              ? parseJson(existing.hidden_fields)
              : changes.hiddenFields
          ),
          viewId,
        ]
      )
      const updated = this.listViews(existing.table_id).find(
        (view) => view.id === viewId
      )
      if (!updated) {
        throw new BaseError("view-not-found", `Base view not found: ${viewId}`)
      }
      this.syncViewQueryIndex(updated)
      setBaseMetadata(this.connection, {})
    })
    const updated = this.listViews(existing.table_id).find(
      (view) => view.id === viewId
    )
    if (!updated) {
      throw new BaseError("view-not-found", `Base view not found: ${viewId}`)
    }
    return updated
  }

  createView(tableId: string, input: CreateBaseViewInput): BaseViewInfo {
    const table = this.getTable(tableId)
    const name = input.name.trim()
    const type = input.type.trim()
    if (!name || !type) {
      throw new BaseError(
        "invalid-identifier",
        "Base view name and type are required"
      )
    }
    if (
      input.position !== undefined &&
      input.position !== null &&
      (!Number.isSafeInteger(input.position) || input.position < 0)
    ) {
      throw new BaseError(
        "invalid-range",
        "Base view position must be a non-negative integer"
      )
    }
    const viewId = input.id ?? createBaseId("view")
    const position =
      input.position ??
      this.connection.get<{ position: number }>(
        `SELECT COALESCE(MAX(position), 0) + 1 AS position
           FROM ${BASE_VIEWS_TABLE} WHERE table_id = ?`,
        [tableId]
      )?.position ??
      1
    this.connection.transaction(() => {
      this.connection.run(
        `INSERT INTO ${BASE_VIEWS_TABLE}
          (id, name, type, table_id, query, properties, filter,
           order_map, hidden_fields, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          viewId,
          name,
          type,
          tableId,
          input.query ?? `SELECT * FROM ${quoteIdentifier(table.rawTableName)}`,
          input.properties === undefined && input.sorts === undefined
            ? null
            : JSON.stringify({
                ...(input.properties ?? {}),
                ...(input.sorts === undefined
                  ? {}
                  : { sorts: normalizeBaseSorts(input.sorts) }),
              }),
          input.filter === undefined
            ? null
            : JSON.stringify(normalizeBaseFilter(input.filter)),
          input.orderMap === undefined ? null : JSON.stringify(input.orderMap),
          JSON.stringify(input.hiddenFields ?? []),
          position,
        ]
      )
      const created = this.listViews(tableId).find((view) => view.id === viewId)
      if (!created) {
        throw new BaseError(
          "view-not-found",
          `Unable to create Base view: ${viewId}`
        )
      }
      this.syncViewQueryIndex(created)
      setBaseMetadata(this.connection, {})
    })
    const created = this.listViews(tableId).find((view) => view.id === viewId)
    if (!created) {
      throw new BaseError(
        "view-not-found",
        `Unable to create Base view: ${viewId}`
      )
    }
    return created
  }

  duplicateView(viewId: string, name?: string): BaseViewInfo {
    const existing = this.connection.get<ViewRow>(
      `SELECT id, name, type, table_id, query, properties, filter,
              order_map, hidden_fields, position, created_at, updated_at
         FROM ${BASE_VIEWS_TABLE}
        WHERE id = ?`,
      [viewId]
    )
    if (!existing) {
      throw new BaseError("view-not-found", `Base view not found: ${viewId}`)
    }
    const view = this.listViews(existing.table_id).find(
      (candidate) => candidate.id === viewId
    )
    if (!view) {
      throw new BaseError("view-not-found", `Base view not found: ${viewId}`)
    }
    return this.createView(view.tableId, {
      name: name?.trim() || `${view.name} copy`,
      type: view.type,
      query: view.query,
      properties: view.properties,
      filter: view.filter,
      sorts: view.sorts,
      orderMap: view.orderMap,
      hiddenFields: view.hiddenFields,
    })
  }

  deleteView(viewId: string): boolean {
    const existing = this.connection.get<{ table_id: string }>(
      `SELECT table_id FROM ${BASE_VIEWS_TABLE} WHERE id = ?`,
      [viewId]
    )
    if (!existing) {
      throw new BaseError("view-not-found", `Base view not found: ${viewId}`)
    }
    const count =
      this.connection.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${BASE_VIEWS_TABLE} WHERE table_id = ?`,
        [existing.table_id]
      )?.count ?? 0
    if (count <= 1) {
      throw new BaseError(
        "protected-view",
        "A Base table must keep at least one view"
      )
    }
    return this.connection.transaction(() => {
      this.connection.exec(
        `DROP INDEX IF EXISTS ${quoteIdentifier(baseViewQueryIndexName(viewId))}`
      )
      const result = this.connection.run(
        `DELETE FROM ${BASE_VIEWS_TABLE} WHERE id = ?`,
        [viewId]
      )
      if (result.changes > 0) setBaseMetadata(this.connection, {})
      return result.changes > 0
    })
  }

  reorderViews(tableId: string, viewIds: string[]): BaseViewInfo[] {
    const current = this.listViews(tableId)
    const expected = new Set(current.map((view) => view.id))
    if (
      viewIds.length !== current.length ||
      new Set(viewIds).size !== viewIds.length ||
      viewIds.some((viewId) => !expected.has(viewId))
    ) {
      throw new BaseError(
        "invalid-range",
        "Base view order must contain every table view exactly once"
      )
    }
    this.connection.transaction(() => {
      viewIds.forEach((viewId, index) => {
        this.connection.run(
          `UPDATE ${BASE_VIEWS_TABLE}
              SET position = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND table_id = ?`,
          [index + 1, viewId, tableId]
        )
      })
      setBaseMetadata(this.connection, {})
    })
    return this.listViews(tableId)
  }

  addField(
    tableId: string,
    field: CreateBaseFieldInput,
    placement?: BaseFieldPlacement
  ): BaseFieldInfo {
    const table = this.getTable(tableId)
    const columnName = assertBaseColumnName(field.columnName)
    const quotedTable = quoteIdentifier(table.rawTableName)
    const quotedColumn = quoteIdentifier(columnName)
    let property: Record<string, unknown> | null = field.property ?? null
    let dependsOn: string[] | null = null
    if (
      placement &&
      (!Number.isSafeInteger(placement.index) || placement.index < 0)
    ) {
      throw new BaseError(
        "invalid-range",
        "Base field placement index must be a non-negative integer"
      )
    }
    const placementView = placement
      ? this.connection.get<Pick<ViewRow, "id" | "order_map">>(
          `SELECT id, order_map
             FROM ${BASE_VIEWS_TABLE}
            WHERE id = ? AND table_id = ?`,
          [placement.viewId, tableId]
        )
      : undefined
    if (placement && !placementView) {
      throw new BaseError(
        "view-not-found",
        `Base view not found: ${placement.viewId}`
      )
    }
    if (field.type === "link") {
      const targetTable = this.getTable(field.property.targetTableId)
      const targetField = this.getField(
        targetTable.id,
        field.property.targetField
      )
      if (targetField.valueKind === "relation") {
        throw new BaseError(
          "invalid-schema",
          "A Base relation cannot display another relation field"
        )
      }
      if (targetField.isDerived) {
        throw new BaseError(
          "invalid-schema",
          "A Base relation display field must be stored on the target table"
        )
      }
    } else if (field.type === "formula") {
      const draft: BaseFieldInfo = {
        name: field.name,
        type: "formula",
        tableName: table.rawTableName,
        tableColumnName: columnName,
        property: field.property,
        storageCodec: "scalar",
        valueKind: "derived",
        isHidden: false,
        isDerived: true,
        sourceTableColumnName: null,
        dependsOn: null,
      }
      const fields = [...this.listFields(tableId), draft]
      const compiled = compileBaseFormula(draft, fields)
      dependsOn = compiled.dependencies
      property = { ...field.property, expression: compiled.expression }
      compileBaseFormulaFields([
        ...fields.slice(0, -1),
        { ...draft, property, dependsOn },
      ])
    } else if (field.type === "lookup") {
      const draft: BaseFieldInfo = {
        name: field.name,
        type: "lookup",
        tableName: table.rawTableName,
        tableColumnName: columnName,
        property: field.property,
        storageCodec: "scalar",
        valueKind: "derived",
        isHidden: false,
        isDerived: true,
        sourceTableColumnName: null,
        dependsOn: [field.property.relationField],
      }
      const fields = [...this.listFields(tableId), draft]
      this.lookupExpression(tableId, draft, fields, "lookup_source")
      dependsOn = [field.property.relationField]
    }
    this.connection.transaction(() => {
      if (field.type !== "formula" && field.type !== "lookup") {
        this.connection.exec(
          `ALTER TABLE ${quotedTable} ADD COLUMN ${quotedColumn} ${sqlTypeForField(field.type)} NULL`
        )
      }
      this.connection.run(
        `INSERT INTO ${BASE_COLUMNS_TABLE}
          (name, type, table_name, table_column_name, property,
           storage_codec, value_kind, is_hidden, is_derived, depends_on)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          field.name,
          field.type,
          table.rawTableName,
          columnName,
          property ? JSON.stringify(property) : null,
          field.type === "formula" || field.type === "lookup"
            ? "scalar"
            : (field.storageCodec ?? defaultStorageCodec(field.type)),
          field.type === "link"
            ? "relation"
            : field.type === "formula" || field.type === "lookup"
              ? "derived"
              : "source",
          field.type === "formula" || field.type === "lookup" ? 1 : 0,
          dependsOn ? JSON.stringify(dependsOn) : null,
        ]
      )
      if (placement && placementView) {
        const currentOrder =
          (parseJson(placementView.order_map) as Record<
            string,
            number
          > | null) ?? {}
        const fields = this.listFields(tableId)
        const createdField = fields.find(
          (candidate) => candidate.tableColumnName === columnName
        )
        const orderedFields = fields
          .filter(
            (candidate) =>
              candidate.tableColumnName !== columnName &&
              !candidate.isHidden &&
              (candidate.tableColumnName === "title" ||
                candidate.valueKind === "source" ||
                candidate.valueKind === "relation" ||
                candidate.valueKind === "derived")
          )
          .sort(
            (left, right) =>
              (currentOrder[left.tableColumnName] ?? Number.MAX_SAFE_INTEGER) -
              (currentOrder[right.tableColumnName] ?? Number.MAX_SAFE_INTEGER)
          )
        if (createdField) {
          orderedFields.splice(
            Math.min(placement.index, orderedFields.length),
            0,
            createdField
          )
        }
        this.connection.run(
          `UPDATE ${BASE_VIEWS_TABLE}
              SET order_map = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          [
            JSON.stringify(
              Object.fromEntries(
                orderedFields.map((candidate, index) => [
                  candidate.tableColumnName,
                  index,
                ])
              )
            ),
            placement.viewId,
          ]
        )
      }
      setBaseMetadata(this.connection, {})
    })
    const created = this.listFields(tableId).find(
      (candidate) => candidate.tableColumnName === columnName
    )
    if (!created) {
      throw new BaseError(
        "field-not-found",
        `Unable to create Base field: ${columnName}`
      )
    }
    return created
  }

  importField(tableId: string, field: ImportBaseFieldInput): BaseFieldInfo {
    const table = this.getTable(tableId)
    const existing = this.listFields(tableId).find(
      (candidate) => candidate.tableColumnName === field.columnName
    )
    const columnName = existing
      ? existing.tableColumnName
      : assertBaseColumnName(field.columnName)
    this.connection.transaction(() => {
      if (!existing) {
        this.connection.exec(
          `ALTER TABLE ${quoteIdentifier(table.rawTableName)}
             ADD COLUMN ${quoteIdentifier(columnName)} ${sqlTypeForField(field.type)} NULL`
        )
        this.connection.run(
          `INSERT INTO ${BASE_COLUMNS_TABLE}
            (name, type, table_name, table_column_name, property,
             storage_codec, value_kind, is_hidden, is_derived,
             source_table_column_name, depends_on)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            field.name,
            field.type,
            table.rawTableName,
            columnName,
            field.property === undefined || field.property === null
              ? null
              : JSON.stringify(field.property),
            field.storageCodec ?? defaultStorageCodec(field.type),
            field.valueKind ?? "source",
            field.isHidden ? 1 : 0,
            field.isDerived ? 1 : 0,
            field.sourceTableColumnName ?? null,
            field.dependsOn === undefined
              ? null
              : JSON.stringify(field.dependsOn),
          ]
        )
      } else {
        this.connection.run(
          `UPDATE ${BASE_COLUMNS_TABLE}
              SET name = ?, type = ?, property = ?, storage_codec = ?,
                  value_kind = ?, is_hidden = ?, is_derived = ?,
                  source_table_column_name = ?, depends_on = ?,
                  updated_at = CURRENT_TIMESTAMP
            WHERE table_name = ? AND table_column_name = ?`,
          [
            field.name,
            field.type,
            field.property === undefined || field.property === null
              ? null
              : JSON.stringify(field.property),
            field.storageCodec ?? existing.storageCodec,
            field.valueKind ?? existing.valueKind,
            field.isHidden === undefined
              ? existing.isHidden
                ? 1
                : 0
              : field.isHidden
                ? 1
                : 0,
            field.isDerived === undefined
              ? existing.isDerived
                ? 1
                : 0
              : field.isDerived
                ? 1
                : 0,
            field.sourceTableColumnName === undefined
              ? existing.sourceTableColumnName
              : field.sourceTableColumnName,
            field.dependsOn === undefined
              ? existing.dependsOn === null
                ? null
                : JSON.stringify(existing.dependsOn)
              : JSON.stringify(field.dependsOn),
            table.rawTableName,
            columnName,
          ]
        )
      }
      setBaseMetadata(this.connection, {})
    })
    return this.getField(tableId, columnName)
  }

  createReference(input: CreateBaseReferenceInput): void {
    const selfTable = this.getTable(input.selfTableId)
    const refTable = this.getTable(input.refTableId)
    const linkTable = this.getTable(input.linkTableId)
    const selfField = this.getField(input.selfTableId, input.selfColumnName)
    const refField = this.getField(input.refTableId, input.refColumnName)
    const linkField = this.getField(input.linkTableId, input.linkColumnName)
    this.connection.run(
      `INSERT INTO ${BASE_REFERENCES_TABLE}
        (self_table_name, self_table_column_name,
         ref_table_name, ref_table_column_name,
         link_table_name, link_table_column_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        selfTable.rawTableName,
        selfField.tableColumnName,
        refTable.rawTableName,
        refField.tableColumnName,
        linkTable.rawTableName,
        linkField.tableColumnName,
      ]
    )
    setBaseMetadata(this.connection, {})
  }

  private removeUnsupportedColumnStats(
    tableId: string,
    field: BaseFieldInfo
  ): void {
    for (const view of this.listViews(tableId)) {
      const properties = { ...(view.properties ?? {}) }
      const columnStats = properties.columnStats
      if (
        typeof columnStats !== "object" ||
        columnStats === null ||
        Array.isArray(columnStats)
      ) {
        continue
      }
      const nextStats: Record<string, unknown> = { ...columnStats }
      const config = nextStats[field.tableColumnName]
      if (config === undefined) continue
      const type =
        typeof config === "object" &&
        config !== null &&
        typeof (config as { type?: unknown }).type === "string"
          ? (config as { type: BaseColumnStatConfig["type"] }).type
          : null
      if (type && baseColumnStatTypesForField(field).includes(type)) continue
      delete nextStats[field.tableColumnName]
      properties.columnStats = nextStats
      this.connection.run(
        `UPDATE ${BASE_VIEWS_TABLE}
            SET properties = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [JSON.stringify(properties), view.id]
      )
    }
  }

  updateField(
    tableId: string,
    columnName: string,
    changes: UpdateBaseFieldInput
  ): BaseFieldInfo {
    const table = this.getTable(tableId)
    const field = this.getField(tableId, columnName)
    const name = changes.name === undefined ? field.name : changes.name.trim()
    if (!name) {
      throw new BaseError("invalid-identifier", "Base field name is required")
    }
    const targetType = changes.type ?? field.type
    if (targetType !== field.type) {
      if (
        field.valueKind !== "source" ||
        !isMutableBaseFieldType(field.type) ||
        !isMutableBaseFieldType(targetType)
      ) {
        throw new BaseError(
          "invalid-schema",
          `Base field “${field.name}” cannot change from ${field.type} to ${targetType}`
        )
      }
      const quotedTable = quoteIdentifier(table.rawTableName)
      const quotedColumn = quoteIdentifier(field.tableColumnName)
      const rows = this.connection.query<{
        id: string
        value: BaseSqlPrimitive
      }>(
        `SELECT CAST(_id AS TEXT) AS id, ${quotedColumn} AS value
           FROM ${quotedTable}`
      )
      const plan = planBaseFieldConversion(field, rows, targetType)
      const property =
        changes.property === undefined ? plan.property : changes.property
      const currentSqlType = sqlTypeForField(field.type)
      const targetSqlType = sqlTypeForField(targetType)
      this.connection.transaction(() => {
        this.dropViewQueryIndexes(tableId)
        let targetColumn = quotedColumn
        let backupColumn: string | null = null
        if (currentSqlType !== targetSqlType) {
          const suffix = createBaseId("migration")
          const nextName = `${field.tableColumnName}_${suffix}_next`
          const backupName = `${field.tableColumnName}_${suffix}_old`
          targetColumn = quoteIdentifier(nextName)
          backupColumn = quoteIdentifier(backupName)
          this.connection.exec(
            `ALTER TABLE ${quotedTable} ADD COLUMN ${targetColumn} ${targetSqlType}`
          )
        }
        const statement = `UPDATE ${quotedTable}
                              SET ${targetColumn} = ?
                            WHERE _id = ?`
        const parameterSets = plan.values.map(
          ({ value, id }) => [value, id] as const
        )
        if (this.connection.runMany) {
          this.connection.runMany(statement, parameterSets)
        } else {
          for (const parameters of parameterSets) {
            this.connection.run(statement, parameters)
          }
        }
        if (backupColumn) {
          this.connection.exec(`
            ALTER TABLE ${quotedTable}
              RENAME COLUMN ${quotedColumn} TO ${backupColumn};
            ALTER TABLE ${quotedTable}
              RENAME COLUMN ${targetColumn} TO ${quotedColumn};
            ALTER TABLE ${quotedTable} DROP COLUMN ${backupColumn};
          `)
        }
        this.connection.run(
          `UPDATE ${BASE_COLUMNS_TABLE}
              SET name = ?, type = ?, property = ?, storage_codec = ?,
                  value_kind = 'source', is_derived = 0,
                  source_table_column_name = NULL, depends_on = NULL,
                  updated_at = CURRENT_TIMESTAMP
            WHERE table_name = ? AND table_column_name = ?`,
          [
            name,
            targetType,
            property === null ? null : JSON.stringify(property),
            plan.storageCodec,
            table.rawTableName,
            field.tableColumnName,
          ]
        )
        const convertedField: BaseFieldInfo = {
          ...field,
          name,
          type: targetType,
          property,
          storageCodec: plan.storageCodec,
          valueKind: "source",
          isDerived: false,
          sourceTableColumnName: null,
          dependsOn: null,
        }
        this.removeUnsupportedColumnStats(tableId, convertedField)
        this.optimizeViewQueries(tableId)
        setBaseMetadata(this.connection, {})
      })
      return this.getField(tableId, field.tableColumnName)
    }
    let property =
      changes.property === undefined ? field.property : changes.property
    let dependsOn = field.dependsOn
    const removedOptionIds =
      (field.type === "select" || field.type === "multi-select") &&
      changes.property !== undefined
        ? (() => {
            const optionIds = (candidate: Record<string, unknown> | null) =>
              new Set(
                Array.isArray(candidate?.options)
                  ? candidate.options.flatMap((option) =>
                      typeof option === "object" &&
                      option !== null &&
                      "id" in option &&
                      typeof option.id === "string"
                        ? [option.id]
                        : []
                    )
                  : []
              )
            const nextIds = optionIds(property)
            return [...optionIds(field.property)].filter(
              (id) => !nextIds.has(id)
            )
          })()
        : []
    if (field.type === "formula" && changes.property !== undefined) {
      const formulaProperty = { ...(property ?? {}) }
      delete formulaProperty.expression
      const draft: BaseFieldInfo = {
        ...field,
        name,
        property: formulaProperty,
        dependsOn: null,
      }
      const fields = this.listFields(tableId).map((candidate) =>
        candidate.tableColumnName === field.tableColumnName ? draft : candidate
      )
      const compiled = compileBaseFormula(draft, fields)
      property = { ...formulaProperty, expression: compiled.expression }
      dependsOn = compiled.dependencies
      compileBaseFormulaFields(
        fields.map((candidate) =>
          candidate.tableColumnName === field.tableColumnName
            ? { ...draft, property, dependsOn }
            : candidate
        )
      )
    } else if (field.type === "lookup" && changes.property !== undefined) {
      const relationField = property?.relationField
      if (typeof relationField !== "string") {
        throw new BaseError(
          "invalid-schema",
          `Lookup field “${field.name}” requires a relation field`
        )
      }
      const draft: BaseFieldInfo = {
        ...field,
        name,
        property,
        dependsOn: [relationField],
      }
      const fields = this.listFields(tableId).map((candidate) =>
        candidate.tableColumnName === field.tableColumnName ? draft : candidate
      )
      this.lookupExpression(tableId, draft, fields, "lookup_source")
      dependsOn = [relationField]
    }
    this.connection.transaction(() => {
      if (removedOptionIds.length > 0 && field.type === "select") {
        for (const optionId of removedOptionIds) {
          this.connection.run(
            `UPDATE ${quoteIdentifier(table.rawTableName)}
                SET ${quoteIdentifier(field.tableColumnName)} = NULL
              WHERE ${quoteIdentifier(field.tableColumnName)} = ?`,
            [optionId]
          )
        }
      } else if (removedOptionIds.length > 0 && field.type === "multi-select") {
        const removed = new Set(removedOptionIds)
        const rows = this.connection.query<{
          id: string
          value: BaseSqlPrimitive
        }>(
          `SELECT CAST(_id AS TEXT) AS id,
                  ${quoteIdentifier(field.tableColumnName)} AS value
             FROM ${quoteIdentifier(table.rawTableName)}`
        )
        const statement = `UPDATE ${quoteIdentifier(table.rawTableName)}
                              SET ${quoteIdentifier(field.tableColumnName)} = ?
                            WHERE _id = ?`
        const parameterSets = rows.map(
          (row) =>
            [
              encodeBaseMultiSelectIds(
                decodeBaseMultiSelectIds(row.value).filter(
                  (id) => !removed.has(id)
                )
              ),
              row.id,
            ] as const
        )
        if (this.connection.runMany) {
          this.connection.runMany(statement, parameterSets)
        } else {
          for (const parameters of parameterSets) {
            this.connection.run(statement, parameters)
          }
        }
      }
      this.connection.run(
        `UPDATE ${BASE_COLUMNS_TABLE}
            SET name = ?, property = ?, depends_on = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE table_name = ? AND table_column_name = ?`,
        [
          name,
          property === null ? null : JSON.stringify(property),
          dependsOn === null ? null : JSON.stringify(dependsOn),
          table.rawTableName,
          field.tableColumnName,
        ]
      )
      this.removeUnsupportedColumnStats(tableId, {
        ...field,
        name,
        property,
        dependsOn,
      })
      setBaseMetadata(this.connection, {})
    })
    return this.getField(tableId, field.tableColumnName)
  }

  deleteField(tableId: string, columnName: string): boolean {
    const table = this.getTable(tableId)
    const field = this.getField(tableId, columnName)
    if (field.valueKind === "system" || field.tableColumnName === "title") {
      throw new BaseError(
        "protected-field",
        `Base system field cannot be deleted: ${field.name}`
      )
    }
    const dependentFormulas = this.listFields(tableId).filter(
      (candidate) =>
        candidate.type === "formula" &&
        candidate.tableColumnName !== field.tableColumnName &&
        Array.isArray(candidate.dependsOn) &&
        candidate.dependsOn.includes(field.tableColumnName)
    )
    if (dependentFormulas.length > 0) {
      throw new BaseError(
        "formula-in-use",
        `Base field “${field.name}” is used by ${dependentFormulas.length} formula field${dependentFormulas.length === 1 ? "" : "s"}`
      )
    }
    const dependentLookups = this.listFields(tableId).filter(
      (candidate) =>
        candidate.type === "lookup" &&
        candidate.tableColumnName !== field.tableColumnName &&
        Array.isArray(candidate.dependsOn) &&
        candidate.dependsOn.includes(field.tableColumnName)
    )
    if (dependentLookups.length > 0) {
      throw new BaseError(
        "lookup-in-use",
        `Base field “${field.name}” is used by ${dependentLookups.length} lookup field${dependentLookups.length === 1 ? "" : "s"}`
      )
    }
    const targetLookups = this.listTables().flatMap((sourceTable) => {
      const sourceFields = this.listFields(sourceTable.id)
      return sourceFields.filter((candidate) => {
        if (
          candidate.type !== "lookup" ||
          candidate.property?.targetField !== columnName
        ) {
          return false
        }
        const relationColumn = candidate.property?.relationField
        const relation = sourceFields.find(
          (sourceField) => sourceField.tableColumnName === relationColumn
        )
        return relation
          ? this.relationTarget(relation)?.tableId === tableId
          : false
      })
    })
    if (targetLookups.length > 0) {
      throw new BaseError(
        "lookup-in-use",
        `Base field “${field.name}” is used as a lookup target`
      )
    }
    const inboundRelations = this.listTables().flatMap((sourceTable) =>
      this.listFields(sourceTable.id).filter((candidate) => {
        const target = this.relationTarget(candidate)
        return target?.tableId === tableId && target.columnName === columnName
      })
    )
    if (inboundRelations.length > 0) {
      throw new BaseError(
        "relation-in-use",
        `Base field “${field.name}” is used as a relation display field`
      )
    }
    return this.connection.transaction(() => {
      this.dropViewQueryIndexes(tableId)
      this.connection.run(
        `DELETE FROM ${BASE_REFERENCES_TABLE}
          WHERE (self_table_name = ? AND self_table_column_name = ?)
             OR (ref_table_name = ? AND ref_table_column_name = ?)
             OR (link_table_name = ? AND link_table_column_name = ?)`,
        [
          table.rawTableName,
          field.tableColumnName,
          table.rawTableName,
          field.tableColumnName,
          table.rawTableName,
          field.tableColumnName,
        ]
      )
      if (
        !(
          (field.type === "formula" || field.type === "lookup") &&
          field.valueKind === "derived"
        )
      ) {
        this.connection.exec(
          `ALTER TABLE ${quoteIdentifier(table.rawTableName)}
            DROP COLUMN ${quoteIdentifier(field.tableColumnName)}`
        )
      }
      this.connection.run(
        `DELETE FROM ${BASE_COLUMNS_TABLE}
          WHERE table_name = ? AND table_column_name = ?`,
        [table.rawTableName, field.tableColumnName]
      )
      for (const view of this.listViews(tableId)) {
        const orderMap = Object.fromEntries(
          Object.entries(view.orderMap ?? {})
            .filter(([columnName]) => columnName !== field.tableColumnName)
            .sort((left, right) => left[1] - right[1])
            .map(([columnName], index) => [columnName, index])
        )
        const properties = { ...(view.properties ?? {}) }
        properties.sorts = view.sorts.filter(
          (sort) => sort.field !== field.tableColumnName
        )
        const fieldWidthMap = properties.fieldWidthMap
        if (
          typeof fieldWidthMap === "object" &&
          fieldWidthMap !== null &&
          !Array.isArray(fieldWidthMap)
        ) {
          const nextWidths: Record<string, unknown> = { ...fieldWidthMap }
          delete nextWidths[field.tableColumnName]
          properties.fieldWidthMap = nextWidths
        }
        const columnStats = properties.columnStats
        if (
          typeof columnStats === "object" &&
          columnStats !== null &&
          !Array.isArray(columnStats)
        ) {
          const nextStats: Record<string, unknown> = { ...columnStats }
          delete nextStats[field.tableColumnName]
          properties.columnStats = nextStats
        }
        this.connection.run(
          `UPDATE ${BASE_VIEWS_TABLE}
              SET properties = ?, filter = ?, order_map = ?, hidden_fields = ?,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          [
            JSON.stringify(properties),
            JSON.stringify(
              removeBaseFilterField(view.filter, field.tableColumnName)
            ),
            JSON.stringify(orderMap),
            JSON.stringify(
              view.hiddenFields.filter(
                (candidate) => candidate !== field.tableColumnName
              )
            ),
            view.id,
          ]
        )
      }
      this.optimizeViewQueries(tableId)
      setBaseMetadata(this.connection, {})
      return true
    })
  }

  private getField(tableId: string, columnName: string): BaseFieldInfo {
    const safeColumnName = assertKnownFieldColumnName(columnName)
    const field = this.listFields(tableId).find(
      (candidate) => candidate.tableColumnName === safeColumnName
    )
    if (!field) {
      throw new BaseError(
        "field-not-found",
        `Base field not found: ${safeColumnName}`
      )
    }
    return field
  }

  listRows(
    tableId: string,
    limit = 200,
    offset = 0,
    query: BaseRowQuery = {}
  ): BaseRow[] {
    const fields = this.listFields(tableId)
    const compiled = compileBaseRowQuery(fields, query)
    const rows = this.connection.query<BaseRow>(
      `SELECT * FROM ${this.rowSourceSql(tableId, fields)}
        ${compiled.whereSql} ${compiled.orderSql} LIMIT ? OFFSET ?`,
      [...compiled.params, Math.max(0, limit), Math.max(0, offset)]
    )
    rows.forEach((row) => delete row.__base_rowid)
    return this.hydrateRelationRows(rows, fields)
  }

  private hydrateRelationRows(
    rows: BaseRow[],
    fields: BaseFieldInfo[]
  ): BaseRow[] {
    if (rows.length === 0) return rows
    const relationFields = fields.filter(
      (field) => field.type === "link" && field.valueKind === "relation"
    )
    if (relationFields.length === 0) return rows

    const hydrated = rows.map((row) => ({ ...row }))
    for (const field of relationFields) {
      const target = this.relationTarget(field)
      if (!target) continue
      const targetTable = this.getTable(target.tableId)
      this.getField(target.tableId, target.columnName)
      const ids = Array.from(
        new Set(
          hydrated.flatMap((row) =>
            decodeBaseRelationIds(row[field.tableColumnName])
          )
        )
      )
      const titles = new Map<string, string>()
      for (let start = 0; start < ids.length; start += 400) {
        const batch = ids.slice(start, start + 400)
        if (batch.length === 0) continue
        const records = this.connection.query<{
          _id: BaseSqlParams[number]
          display_value: BaseSqlParams[number]
        }>(
          `SELECT _id, ${quoteIdentifier(target.columnName)} AS display_value
             FROM ${quoteIdentifier(targetTable.rawTableName)}
            WHERE _id IN (${batch.map(() => "?").join(", ")})`,
          batch
        )
        for (const record of records) {
          titles.set(
            String(record._id),
            record.display_value === null
              ? "Untitled"
              : String(record.display_value)
          )
        }
      }
      for (const row of hydrated) {
        const values = decodeBaseRelationIds(row[field.tableColumnName]).map(
          (id) => ({ id, title: titles.get(id) ?? "Missing record" })
        )
        row[`${field.tableColumnName}__display`] = JSON.stringify(values)
      }
    }
    return hydrated
  }

  countRows(tableId: string, query: BaseRowQuery = {}): number {
    const fields = this.listFields(tableId)
    const compiled = compileBaseRowQuery(fields, query)
    return (
      this.connection.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${this.rowSourceSql(tableId, fields)}
          ${compiled.whereSql}`,
        compiled.params
      )?.count ?? 0
    )
  }

  countRowsByField(
    tableId: string,
    columnName: string,
    query: BaseRowQuery = {}
  ): BaseRowGroupCount[] {
    const fields = this.listFields(tableId)
    const field = this.getField(tableId, columnName)
    const compiled = compileBaseRowQuery(fields, query)
    const column = quoteIdentifier(field.tableColumnName)
    return this.connection
      .query<{ value: BaseSqlPrimitive; total: number }>(
        `SELECT ${column} AS value, COUNT(*) AS total
           FROM ${this.rowSourceSql(tableId, fields)}
           ${compiled.whereSql}
          GROUP BY ${column}`,
        compiled.params
      )
      .map((group) => ({
        value: group.value,
        total: Number(group.total),
      }))
  }

  calculateColumnStats(
    tableId: string,
    configs: BaseColumnStatConfig[],
    query: BaseRowQuery = {}
  ): BaseColumnStatResult[] {
    const fields = this.listFields(tableId)
    const normalized = normalizeBaseColumnStatConfigs(configs, fields)
    if (normalized.length === 0) return []
    const byColumn = new Map(
      fields.map((field) => [field.tableColumnName, field])
    )
    const compiled = compileBaseRowQuery(fields, query)
    const aliases = normalized.map((_, index) => `__base_stat_${index}`)
    const select = normalized.map((config, index) => {
      const field = byColumn.get(config.columnName)
      if (!field) {
        throw new BaseError(
          "field-not-found",
          `Base field not found: ${config.columnName}`
        )
      }
      return `${compileBaseColumnStatExpression(field, config.type)} AS ${quoteIdentifier(aliases[index])}`
    })
    const result = this.connection.get<Record<string, BaseSqlPrimitive>>(
      `SELECT ${select.join(", ")}
         FROM ${this.rowSourceSql(tableId, fields)}
         ${compiled.whereSql}`,
      compiled.params
    )
    return normalized.map((config, index) => {
      const value = result?.[aliases[index]] ?? null
      if (value instanceof Uint8Array) {
        throw new BaseError(
          "invalid-query",
          `Column stat returned binary data for ${config.columnName}`
        )
      }
      return {
        ...config,
        value: typeof value === "bigint" ? Number(value) : value,
      }
    })
  }

  getRowPage(
    tableId: string,
    offset = 0,
    limit = 100,
    query: BaseRowQuery = {},
    totalHint?: number
  ): BaseRowPage {
    const safeOffset = Math.max(0, Math.trunc(offset))
    const safeLimit = Math.min(500, Math.max(1, Math.trunc(limit)))
    const safeTotalHint =
      typeof totalHint === "number" &&
      Number.isSafeInteger(totalHint) &&
      totalHint >= 0
        ? totalHint
        : null
    return {
      tableId,
      offset: safeOffset,
      limit: safeLimit,
      total: safeTotalHint ?? this.countRows(tableId, query),
      rows: this.listRows(tableId, safeLimit, safeOffset, query),
    }
  }

  insertRow(tableId: string, row: BaseRow): BaseRow {
    const table = this.getTable(tableId)
    const fields = this.listFields(tableId)
    const fieldsByColumn = new Map(
      fields.map((field) => [field.tableColumnName, field])
    )
    const allowedColumns = new Set([
      "_id",
      ...fields
        .filter(
          (field) =>
            field.tableColumnName === "title" ||
            field.valueKind === "source" ||
            field.valueKind === "relation"
        )
        .map((field) => field.tableColumnName),
    ])
    const record: BaseRow = {
      ...Object.fromEntries(
        Object.entries(row).map(([column, value]) => [
          column,
          writableFieldValue(fieldsByColumn.get(column), value),
        ])
      ),
      _id: row._id ?? createBaseId("row"),
    }
    const columns = Object.keys(record)
    for (const column of columns) {
      if (!allowedColumns.has(column)) {
        throw new BaseError(
          "field-not-found",
          `Base field cannot be written: ${column}`
        )
      }
    }
    const placeholders = columns.map(() => "?").join(", ")
    this.connection.run(
      `INSERT INTO ${quoteIdentifier(table.rawTableName)}
        (${columns.map(quoteIdentifier).join(", ")}) VALUES (${placeholders})`,
      columns.map((column) => sqliteParameter(record[column]))
    )
    setBaseMetadata(this.connection, {})
    const inserted = this.getComputedRow(
      tableId,
      sqliteParameter(record._id),
      fields
    )!
    return this.hydrateRelationRows([inserted], fields)[0]
  }

  insertImportedRow(tableId: string, row: BaseRow): BaseRow {
    const record = this.insertImportedRows(tableId, [row])[0]
    const table = this.getTable(tableId)
    return this.connection.get<BaseRow>(
      `SELECT * FROM ${quoteIdentifier(table.rawTableName)} WHERE _id = ?`,
      [sqliteParameter(record._id)]
    )!
  }

  insertImportedRows(tableId: string, rows: BaseRow[]): BaseRow[] {
    if (rows.length === 0) return []
    const table = this.getTable(tableId)
    const writableColumns = new Set(
      this.connection
        .query<{ name: string; hidden: number }>(
          `PRAGMA table_xinfo(${quoteIdentifier(table.rawTableName)})`
        )
        .filter((column) => column.hidden === 0)
        .map((column) => column.name)
    )
    const records: BaseRow[] = rows.map((row) => ({
      ...row,
      _id: row._id ?? createBaseId("row"),
    }))
    this.connection.transaction(() => {
      const batches = new Map<
        string,
        { columns: string[]; parameterSets: BaseSqlParams[] }
      >()
      for (const record of records) {
        const columns = Object.keys(record)
        for (const column of columns) {
          if (!writableColumns.has(column)) {
            throw new BaseError(
              "field-not-found",
              `Base field cannot be imported: ${column}`
            )
          }
        }
        const signature = columns.join("\u0000")
        const batch = batches.get(signature) ?? {
          columns,
          parameterSets: [],
        }
        batch.parameterSets.push(
          columns.map((column) => sqliteParameter(record[column]))
        )
        batches.set(signature, batch)
      }
      for (const batch of batches.values()) {
        const sql = `INSERT INTO ${quoteIdentifier(table.rawTableName)}
            (${batch.columns.map(quoteIdentifier).join(", ")})
           VALUES (${batch.columns.map(() => "?").join(", ")})`
        if (this.connection.runMany) {
          this.connection.runMany(sql, batch.parameterSets)
        } else {
          for (const params of batch.parameterSets) {
            this.connection.run(sql, params)
          }
        }
      }
    })
    setBaseMetadata(this.connection, {})
    return records
  }

  updateRow(tableId: string, rowId: string, changes: BaseRow): BaseRow {
    return this.updateRows(tableId, [{ rowId, changes }])[0]
  }

  updateRows(tableId: string, updates: BaseRowUpdate[]): BaseRow[] {
    const table = this.getTable(tableId)
    const fields = this.listFields(tableId)
    const fieldsByColumn = new Map(
      fields.map((field) => [field.tableColumnName, field])
    )
    const allowedColumns = new Set(
      fields
        .filter(
          (field) =>
            field.tableColumnName === "title" ||
            field.valueKind === "source" ||
            field.valueKind === "relation"
        )
        .map((field) => field.tableColumnName)
    )
    const prepared = updates.map(({ rowId, changes }) => {
      const columns = Object.keys(changes).filter((column) => column !== "_id")
      for (const column of columns) {
        if (!allowedColumns.has(column)) {
          throw new BaseError(
            "field-not-found",
            `Base field not found: ${column}`
          )
        }
      }
      return { rowId, changes, columns }
    })
    if (prepared.length === 0) return []

    const rows = this.connection.transaction(() => {
      let mutated = false
      for (const { rowId, changes, columns } of prepared) {
        if (columns.length > 0) {
          const assignments = columns
            .map((column) => `${quoteIdentifier(column)} = ?`)
            .join(", ")
          const result = this.connection.run(
            `UPDATE ${quoteIdentifier(table.rawTableName)}
                SET ${assignments}, _last_edited_time = CURRENT_TIMESTAMP
              WHERE _id = ?`,
            [
              ...columns.map((column) =>
                sqliteParameter(
                  writableFieldValue(
                    fieldsByColumn.get(column),
                    changes[column]
                  )
                )
              ),
              rowId,
            ]
          )
          if (result.changes === 0) {
            throw new BaseError("row-not-found", `Row not found: ${rowId}`)
          }
          mutated = true
        }
      }
      if (mutated) setBaseMetadata(this.connection, {})

      return prepared.map(({ rowId }) => {
        const updated = this.getComputedRow(tableId, rowId, fields)
        if (!updated) {
          throw new BaseError("row-not-found", `Row not found: ${rowId}`)
        }
        return updated
      })
    })
    return this.hydrateRelationRows(rows, fields)
  }

  deleteRow(tableId: string, rowId: string): boolean {
    return this.deleteRows(tableId, [rowId]).length === 1
  }

  deleteRows(tableId: string, rowIds: string[]): string[] {
    const table = this.getTable(tableId)
    const uniqueIds = [...new Set(rowIds)]
    if (uniqueIds.length === 0) return []
    return this.connection.transaction(() =>
      this.deleteRowsInTransaction(table.rawTableName, uniqueIds)
    )
  }

  deleteRowRanges(
    tableId: string,
    ranges: BaseRowRange[],
    query: BaseRowQuery = {}
  ): number {
    const table = this.getTable(tableId)
    const fields = this.listFields(tableId)
    const compiled = compileBaseRowQuery(fields, query)
    const normalized = this.normalizeRowRanges(ranges)
    if (normalized.length === 0) return 0
    return this.connection.transaction(() => {
      let deletedCount = 0
      for (const { startIndex, endIndex } of normalized.reverse()) {
        const result = this.connection.run(
          `DELETE FROM ${quoteIdentifier(table.rawTableName)}
            WHERE _id IN (
              SELECT _id FROM ${this.rowSourceSql(tableId, fields)}
              ${compiled.whereSql} ${compiled.orderSql} LIMIT ? OFFSET ?
            )`,
          [...compiled.params, endIndex - startIndex, startIndex]
        )
        deletedCount += result.changes
      }
      if (deletedCount > 0) setBaseMetadata(this.connection, {})
      return deletedCount
    })
  }

  private normalizeRowRanges(ranges: BaseRowRange[]): BaseRowRange[] {
    const sorted = ranges
      .map(({ startIndex, endIndex }) => {
        if (
          !Number.isSafeInteger(startIndex) ||
          !Number.isSafeInteger(endIndex) ||
          startIndex < 0 ||
          endIndex <= startIndex
        ) {
          throw new BaseError(
            "invalid-range",
            `Invalid Base row range: ${startIndex}..${endIndex}`
          )
        }
        return { startIndex, endIndex }
      })
      .sort((left, right) => left.startIndex - right.startIndex)
    const merged: BaseRowRange[] = []
    for (const range of sorted) {
      const previous = merged.at(-1)
      if (!previous || range.startIndex > previous.endIndex) {
        merged.push({ ...range })
      } else {
        previous.endIndex = Math.max(previous.endIndex, range.endIndex)
      }
    }
    return merged
  }

  private deleteRowsInTransaction(
    rawTableName: string,
    rowIds: string[]
  ): string[] {
    const deleted: string[] = []
    for (const rowId of new Set(rowIds)) {
      const result = this.connection.run(
        `DELETE FROM ${quoteIdentifier(rawTableName)} WHERE _id = ?`,
        [rowId]
      )
      if (result.changes > 0) deleted.push(rowId)
    }
    if (deleted.length > 0) setBaseMetadata(this.connection, {})
    return deleted
  }
}
