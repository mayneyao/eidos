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
import {
  BASE_SORTED_CURSOR_MAX_FIELDS,
  appendBaseCursorWhere,
  baseCursorQuerySignature,
  baseCursorSorts,
  baseSortedCursorBranches,
  decodeBaseRowCursor,
  decodeBaseSortedCursor,
  encodeBaseRowCursor,
  encodeBaseSortedCursor,
} from "./cursor-paging"
import { BaseError } from "./errors"
import {
  decodeBaseMultiSelectValues,
  encodeBaseMultiSelectValues,
  isMutableBaseFieldType,
  planBaseFieldConversion,
} from "./field-conversion"
import { decodeBaseFilePaths, encodeBaseFilePaths } from "./file-values"
import {
  compileBaseFormula,
  compileBaseFormulaFields,
  type CompiledBaseFormula,
} from "./formula"
import { decodeBaseRelationIds, encodeBaseRelationIds } from "./relation-values"
import {
  assertBaseColumnName,
  assertBaseTableId,
  createBaseIdentifier,
  createBaseUuid,
  quoteIdentifier,
  rawTableNameForId,
} from "./identifiers"
import {
  baseFieldStoresJsonArray,
  baseLookupAggregateSupportsTarget,
  baseLookupDisplayType,
  baseLookupStorageCodec,
} from "./lookup"
import { setBaseMetadata } from "./schema"
import {
  baseRowQueryPredicateColumns,
  compileBaseRowQuery,
  normalizeBaseFilter,
  normalizeBaseRowQuery,
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
  BaseRowPageProjection,
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
import {
  assertBaseSelectOptions,
  parseBaseSelectOptions,
} from "./select-options"

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

interface BaseRowReadSchema {
  table: BaseTableInfo
  fields: BaseFieldInfo[]
}

interface BaseLookupCompilationNode {
  key: string
  label: string
}

interface BaseLookupCompilationContext {
  path: BaseLookupCompilationNode[]
  overrides?: ReadonlyMap<string, BaseFieldInfo>
}

const EMPTY_LOOKUP_COMPILATION_CONTEXT: BaseLookupCompilationContext = {
  path: [],
}

function baseLookupFieldKey(tableId: string, columnName: string): string {
  return `${tableId}\u0000${columnName}`
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

function isEmptyProjectedFieldValue(value: BaseRow[string]): boolean {
  return value === null || value === undefined || value === ""
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
  if (type === "multi-select" || type === "file") return "json_array"
  if (type === "link") return "relation"
  if (type === "formula" || type === "lookup") return "scalar"
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
  if (field?.type === "multi-select") {
    return encodeBaseMultiSelectValues(
      decodeBaseMultiSelectValues(typeof value === "boolean" ? null : value)
    )
  }
  if (field?.type === "link") {
    return encodeBaseRelationIds(decodeBaseRelationIds(value))
  }
  return value
}

export class BaseRuntime {
  private readonly formulaCompilationCache = new Map<
    string,
    { signature: string; formulas: CompiledBaseFormula[] }
  >()
  private readonly rowReadSchemaCache = new Map<string, BaseRowReadSchema>()
  private rowReadDataVersion: number | null = null

  constructor(
    readonly connection: BaseConnection,
    private readonly closeConnection = false
  ) {}

  close(): void {
    this.formulaCompilationCache.clear()
    this.rowReadSchemaCache.clear()
    if (this.closeConnection) this.connection.close?.()
  }

  private invalidateRowReadSchema(): void {
    this.rowReadSchemaCache.clear()
    this.rowReadDataVersion = null
  }

  private touchMetadata(entries: Record<string, string | undefined>): void {
    setBaseMetadata(this.connection, entries)
    this.invalidateRowReadSchema()
  }

  private rowReadSchema(tableId: string): BaseRowReadSchema {
    const observed = this.connection.get<{ data_version: number | bigint }>(
      "PRAGMA data_version"
    )?.data_version
    const dataVersion =
      (typeof observed === "number" || typeof observed === "bigint") &&
      Number.isSafeInteger(Number(observed))
        ? Number(observed)
        : null
    if (
      this.rowReadDataVersion !== null &&
      dataVersion !== null &&
      dataVersion !== this.rowReadDataVersion
    ) {
      this.rowReadSchemaCache.clear()
    }
    this.rowReadDataVersion = dataVersion

    const cached = this.rowReadSchemaCache.get(tableId)
    if (cached) return cached
    const table = this.getTable(tableId)
    const schema = { table, fields: this.queryFields(table) }
    this.rowReadSchemaCache.set(tableId, schema)
    return schema
  }

  private compiledFormulaFields(
    tableId: string,
    fields: BaseFieldInfo[]
  ): CompiledBaseFormula[] {
    const signature = JSON.stringify(
      fields.map((field) => [
        field.name,
        field.tableColumnName,
        field.type,
        field.valueKind,
        field.isDerived,
        field.type === "formula" ? field.property?.formula : null,
      ])
    )
    const cached = this.formulaCompilationCache.get(tableId)
    if (cached?.signature === signature) return cached.formulas
    const formulas = compileBaseFormulaFields(fields)
    this.formulaCompilationCache.set(tableId, { signature, formulas })
    return formulas
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
    return null
  }

  private rowSourceSql(
    tableId: string,
    fields: BaseFieldInfo[],
    requestedDerivedColumns?: ReadonlySet<string>,
    table = this.getTable(tableId),
    lookupContext = EMPTY_LOOKUP_COMPILATION_CONTEXT
  ): string {
    const requiredDerivedColumns = requestedDerivedColumns
      ? this.requiredDerivedColumns(fields, requestedDerivedColumns)
      : null
    const includesDerivedColumn = (field: BaseFieldInfo) =>
      requiredDerivedColumns === null ||
      requiredDerivedColumns.has(field.tableColumnName)
    let alias = "base_rows"
    let source = `(SELECT rowid AS "__base_rowid", *
                     FROM ${quoteIdentifier(table.rawTableName)}) AS ${quoteIdentifier(alias)}`
    fields
      .filter(
        (field) =>
          field.type === "lookup" &&
          field.valueKind === "derived" &&
          field.isDerived &&
          includesDerivedColumn(field)
      )
      .forEach((field, index) => {
        const expression = this.lookupExpression(
          tableId,
          field,
          fields,
          alias,
          lookupContext
        )
        const nextAlias = `lookup_layer_${index + 1}`
        source = `(SELECT ${quoteIdentifier(alias)}.*, (${expression}) AS ${quoteIdentifier(field.tableColumnName)}
                     FROM ${source}) AS ${quoteIdentifier(nextAlias)}`
        alias = nextAlias
      })
    const compiledFormulas =
      requiredDerivedColumns?.size === 0
        ? []
        : this.compiledFormulaFields(tableId, fields)
    compiledFormulas
      .filter((formula) => includesDerivedColumn(formula.field))
      .forEach((formula, index) => {
        const nextAlias = `formula_layer_${index + 1}`
        source = `(SELECT *, (${formula.expression}) AS ${quoteIdentifier(formula.field.tableColumnName)}
                     FROM ${source}) AS ${quoteIdentifier(nextAlias)}`
        alias = nextAlias
      })
    return source
  }

  private requiredDerivedColumns(
    fields: BaseFieldInfo[],
    requestedColumns: ReadonlySet<string>
  ): Set<string> {
    const fieldsByColumn = new Map(
      fields.map((field) => [field.tableColumnName, field])
    )
    const required = new Set<string>()
    const visit = (columnName: string) => {
      const field = fieldsByColumn.get(columnName)
      if (!field?.isDerived || required.has(columnName)) return
      required.add(columnName)
      if (typeof field.sourceTableColumnName === "string") {
        visit(field.sourceTableColumnName)
      }
      if (!Array.isArray(field.dependsOn)) return
      for (const dependency of field.dependsOn) {
        if (typeof dependency === "string") visit(dependency)
      }
    }
    requestedColumns.forEach(visit)
    return required
  }

  private countRowSourceSql(
    tableId: string,
    fields: BaseFieldInfo[],
    query: BaseRowQuery,
    projectedColumns: Iterable<string> = [],
    table = this.getTable(tableId)
  ): string {
    const requestedColumns = baseRowQueryPredicateColumns(fields, query)
    for (const columnName of projectedColumns) {
      requestedColumns.add(columnName)
    }
    return this.rowSourceSql(tableId, fields, requestedColumns, table)
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
    sourceAlias: string,
    context: BaseLookupCompilationContext = EMPTY_LOOKUP_COMPILATION_CONTEXT
  ): string {
    const fieldKey = baseLookupFieldKey(tableId, field.tableColumnName)
    const cycleStart = context.path.findIndex((node) => node.key === fieldKey)
    if (cycleStart >= 0) {
      const cycle = [
        ...context.path.slice(cycleStart).map((node) => node.label),
        field.name,
      ].join(" → ")
      throw new BaseError(
        "invalid-schema",
        `Circular Base lookup dependency: ${cycle}`
      )
    }
    if (context.path.length >= 32) {
      throw new BaseError(
        "invalid-schema",
        "Base lookup dependency depth cannot exceed 32 fields"
      )
    }
    const nextContext: BaseLookupCompilationContext = {
      ...context,
      path: [...context.path, { key: fieldKey, label: field.name }],
    }
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
    const lookupAggregate = aggregate as BaseLookupAggregate
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
    const targetFields = this.queryFields(targetTable).map(
      (candidate) =>
        context.overrides?.get(
          baseLookupFieldKey(target.tableId, candidate.tableColumnName)
        ) ?? candidate
    )
    const targetField = targetFields.find(
      (candidate) => candidate.tableColumnName === targetColumn
    )
    if (!targetField) {
      throw new BaseError(
        "field-not-found",
        `Lookup target field not found: ${targetColumn}`
      )
    }
    const nestedLookup =
      targetField.type === "lookup" &&
      targetField.valueKind === "derived" &&
      targetField.isDerived
    if (targetField.isDerived && !nestedLookup) {
      throw new BaseError(
        "invalid-schema",
        "A Base lookup target must be stored or another Lookup field"
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
    if (!baseLookupAggregateSupportsTarget(lookupAggregate, targetField)) {
      throw new BaseError(
        "invalid-schema",
        `${lookupAggregate} lookup requires a number or rating target field`
      )
    }
    const expectedDisplayType = baseLookupDisplayType(
      lookupAggregate,
      targetField
    )
    if (field.property?.displayType !== expectedDisplayType) {
      throw new BaseError(
        "invalid-schema",
        `Lookup field “${field.name}” must use ${expectedDisplayType} display values`
      )
    }
    const relationAlias = quoteIdentifier("lookup_relation")
    const relationRows = `json_each(
      CASE
        WHEN json_valid(${outerRelation})
         AND json_type(${outerRelation}) = 'array'
          THEN ${outerRelation}
        ELSE '[]'
      END
    ) AS ${relationAlias}`
    const from = nestedLookup
      ? `(SELECT * FROM ${this.rowSourceSql(
          targetTable.id,
          targetFields,
          new Set([targetField.tableColumnName]),
          targetTable,
          nextContext
        )}) AS ${targetAlias}`
      : `${quoteIdentifier(targetTable.rawTableName)} AS ${targetAlias}`
    const targetJoin = `JOIN ${from}
      ON CAST(${targetAlias}._id AS TEXT) = CAST(${relationAlias}.value AS TEXT)`
    const valueAlias = quoteIdentifier("lookup_value")
    const stream = baseFieldStoresJsonArray(targetField)
      ? `SELECT CAST(${relationAlias}.key AS INTEGER) AS record_order,
                CAST(${valueAlias}.key AS INTEGER) AS value_order,
                ${valueAlias}.value AS value
           FROM ${relationRows}
           ${targetJoin}
           JOIN json_each(
             CASE
               WHEN json_valid(${targetValue})
                AND json_type(${targetValue}) = 'array'
                 THEN ${targetValue}
               ELSE '[]'
             END
           ) AS ${valueAlias} ON TRUE`
      : `SELECT CAST(${relationAlias}.key AS INTEGER) AS record_order,
                0 AS value_order,
                ${targetValue} AS value
           FROM ${relationRows}
           ${targetJoin}
          WHERE ${targetValue} IS NOT NULL`
    if (lookupAggregate === "first") {
      return `SELECT value FROM (${stream})
               ORDER BY record_order, value_order LIMIT 1`
    }
    if (lookupAggregate === "values") {
      return `SELECT COALESCE(json_group_array(value), '[]')
                FROM (
                  SELECT value FROM (${stream})
                   ORDER BY record_order, value_order
                )`
    }
    if (lookupAggregate === "count") {
      return `SELECT COUNT(*) FROM (${stream})`
    }
    const functionName =
      lookupAggregate === "average" ? "AVG" : lookupAggregate.toUpperCase()
    return `SELECT ${functionName}(CAST(value AS REAL))
              FROM (${stream})`
  }

  private validateLookupTargetDependents(
    targetTableId: string,
    targetColumnName: string,
    overrides: ReadonlyMap<string, BaseFieldInfo>
  ): void {
    for (const sourceTable of this.listTables()) {
      const sourceFields = this.queryFields(sourceTable).map(
        (candidate) =>
          overrides.get(
            baseLookupFieldKey(sourceTable.id, candidate.tableColumnName)
          ) ?? candidate
      )
      for (const candidate of sourceFields) {
        if (
          candidate.type !== "lookup" ||
          candidate.valueKind !== "derived" ||
          !candidate.isDerived ||
          candidate.property?.targetField !== targetColumnName
        ) {
          continue
        }
        const relation = sourceFields.find(
          (field) => field.tableColumnName === candidate.property?.relationField
        )
        if (
          relation &&
          this.relationTarget(relation)?.tableId === targetTableId
        ) {
          this.lookupExpression(
            sourceTable.id,
            candidate,
            sourceFields,
            "lookup_source",
            { path: [], overrides }
          )
        }
      }
    }
  }

  private getComputedRow(
    tableId: string,
    rowId: BaseSqlParams[number],
    fields: BaseFieldInfo[],
    table = this.getTable(tableId)
  ): BaseRow | undefined {
    const row = this.connection.get<BaseRow>(
      `SELECT * FROM ${this.rowSourceSql(tableId, fields, undefined, table)} WHERE _id = ?`,
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
    const tableId = assertBaseTableId(input.id ?? createBaseIdentifier())
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
          [createBaseUuid(), tableId, `SELECT * FROM ${quotedTable}`]
        )
      }
      const currentDefault = this.connection.get<{ value: string }>(
        `SELECT value FROM ${BASE_META_TABLE} WHERE key = 'default_table_id'`
      )
      if (!currentDefault) {
        this.touchMetadata({ default_table_id: tableId })
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
      this.touchMetadata({})
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
      this.touchMetadata({})
      return true
    })
  }

  private queryFields(table: BaseTableInfo): BaseFieldInfo[] {
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

  listFields(tableId: string): BaseFieldInfo[] {
    return this.queryFields(this.getTable(tableId))
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
    const type =
      changes.type === undefined ? existing.type : changes.type.trim()
    if (!type) {
      throw new BaseError("invalid-identifier", "Base view type is required")
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
            SET name = ?, type = ?, position = ?, properties = ?, filter = ?,
                order_map = ?, hidden_fields = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [
          name,
          type,
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
      this.touchMetadata({})
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
    const viewId = input.id ?? createBaseUuid()
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
      this.touchMetadata({})
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
      if (result.changes > 0) this.touchMetadata({})
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
      this.touchMetadata({})
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
    let storageCodec = defaultStorageCodec(field.type)
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
    if (
      (field.type === "select" || field.type === "multi-select") &&
      property === null
    ) {
      property = { options: [] }
    }
    if (field.type === "select" || field.type === "multi-select") {
      assertBaseSelectOptions(property)
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
      storageCodec = baseLookupStorageCodec(field.property.aggregate)
      const draft: BaseFieldInfo = {
        name: field.name,
        type: "lookup",
        tableName: table.rawTableName,
        tableColumnName: columnName,
        property: field.property,
        storageCodec,
        valueKind: "derived",
        isHidden: false,
        isDerived: true,
        sourceTableColumnName: null,
        dependsOn: [field.property.relationField],
      }
      const fields = [...this.listFields(tableId), draft]
      this.lookupExpression(tableId, draft, fields, "lookup_source", {
        path: [],
        overrides: new Map([[baseLookupFieldKey(tableId, columnName), draft]]),
      })
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
          storageCodec,
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
      this.touchMetadata({})
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
    const importAsLiveDerived =
      !existing &&
      (field.type === "formula" || field.type === "lookup") &&
      field.valueKind === "derived" &&
      field.isDerived === true
    this.connection.transaction(() => {
      if (!existing) {
        if (!importAsLiveDerived) {
          this.connection.exec(
            `ALTER TABLE ${quoteIdentifier(table.rawTableName)}
               ADD COLUMN ${quoteIdentifier(columnName)} ${sqlTypeForField(field.type)} NULL`
          )
        }
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
      this.touchMetadata({})
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
    this.touchMetadata({})
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
      this.validateLookupTargetDependents(
        tableId,
        field.tableColumnName,
        new Map([
          [baseLookupFieldKey(tableId, field.tableColumnName), convertedField],
        ])
      )
      const currentSqlType = sqlTypeForField(field.type)
      const targetSqlType = sqlTypeForField(targetType)
      this.connection.transaction(() => {
        this.dropViewQueryIndexes(tableId)
        let targetColumn = quotedColumn
        let backupColumn: string | null = null
        if (currentSqlType !== targetSqlType) {
          const suffix = createBaseIdentifier()
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
        this.removeUnsupportedColumnStats(tableId, convertedField)
        this.optimizeViewQueries(tableId)
        this.touchMetadata({})
      })
      return this.getField(tableId, field.tableColumnName)
    }
    let property =
      changes.property === undefined ? field.property : changes.property
    let dependsOn = field.dependsOn
    let storageCodec = field.storageCodec
    const previousOptions =
      field.type === "select" || field.type === "multi-select"
        ? parseBaseSelectOptions(field.property)
        : []
    const nextOptions =
      field.type === "select" || field.type === "multi-select"
        ? changes.property !== undefined
          ? assertBaseSelectOptions(property)
          : previousOptions
        : []
    if (
      changes.optionValueChanges !== undefined &&
      (changes.property === undefined ||
        (field.type !== "select" && field.type !== "multi-select"))
    ) {
      throw new BaseError(
        "invalid-schema",
        "Option value changes require updated select options"
      )
    }
    const previousOptionValues = new Set(
      previousOptions.map((option) => option.value)
    )
    const nextOptionValues = new Set(nextOptions.map((option) => option.value))
    const optionValueChanges = new Map<string, string>()
    for (const change of changes.optionValueChanges ?? []) {
      if (
        !change.from ||
        !change.to ||
        change.from === change.to ||
        !previousOptionValues.has(change.from) ||
        !nextOptionValues.has(change.to) ||
        optionValueChanges.has(change.from)
      ) {
        throw new BaseError("invalid-schema", "Invalid select option rename")
      }
      optionValueChanges.set(change.from, change.to)
    }
    const removedOptionValues = new Set(
      [...previousOptionValues].filter(
        (value) =>
          !nextOptionValues.has(value) && !optionValueChanges.has(value)
      )
    )
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
        storageCodec: baseLookupStorageCodec(
          property?.aggregate as BaseLookupAggregate
        ),
        dependsOn: [relationField],
      }
      const fields = this.listFields(tableId).map((candidate) =>
        candidate.tableColumnName === field.tableColumnName ? draft : candidate
      )
      const overrides = new Map([
        [baseLookupFieldKey(tableId, field.tableColumnName), draft],
      ])
      this.lookupExpression(tableId, draft, fields, "lookup_source", {
        path: [],
        overrides,
      })
      this.validateLookupTargetDependents(
        tableId,
        field.tableColumnName,
        overrides
      )
      dependsOn = [relationField]
      storageCodec = draft.storageCodec
    }
    this.connection.transaction(() => {
      if (
        (removedOptionValues.size > 0 || optionValueChanges.size > 0) &&
        (field.type === "select" || field.type === "multi-select")
      ) {
        const quotedTable = quoteIdentifier(table.rawTableName)
        const quotedField = quoteIdentifier(field.tableColumnName)
        if (field.type === "select") {
          const renamedValues = [...optionValueChanges]
          const affectedValues = [
            ...optionValueChanges.keys(),
            ...removedOptionValues,
          ]
          const cases = renamedValues.map(() => "WHEN ? THEN ?").join(" ")
          const nextValue = cases
            ? `CASE ${quotedField} ${cases} ELSE NULL END`
            : "NULL"
          this.connection.run(
            `UPDATE ${quotedTable}
                SET ${quotedField} = ${nextValue}
              WHERE ${quotedField} IN (${affectedValues.map(() => "?").join(", ")})`,
            [
              ...renamedValues.flatMap(([from, to]) => [from, to]),
              ...affectedValues,
            ]
          )
        } else {
          const affectedValues = [
            ...removedOptionValues,
            ...optionValueChanges.keys(),
          ]
          const rows = this.connection.query<{
            id: string
            value: BaseSqlPrimitive
          }>(
            `SELECT CAST(_id AS TEXT) AS id,
                    ${quotedField} AS value
               FROM ${quotedTable}
              WHERE EXISTS (
                SELECT 1
                  FROM json_each(
                    CASE
                      WHEN json_valid(${quotedField})
                       AND json_type(${quotedField}) = 'array'
                        THEN ${quotedField}
                      ELSE '[]'
                    END
                  )
                 WHERE CAST(value AS TEXT) IN (${affectedValues.map(() => "?").join(", ")})
              )`,
            affectedValues
          )
          const statement = `UPDATE ${quotedTable}
                              SET ${quotedField} = ?
                            WHERE _id = ?`
          const parameterSets = rows.map((row) => {
            const nextValues = decodeBaseMultiSelectValues(row.value).flatMap(
              (value) => {
                const renamed = optionValueChanges.get(value)
                if (renamed) return [renamed]
                return removedOptionValues.has(value) ? [] : [value]
              }
            )
            return [encodeBaseMultiSelectValues(nextValues), row.id] as const
          })
          if (this.connection.runMany) {
            this.connection.runMany(statement, parameterSets)
          } else {
            for (const parameters of parameterSets) {
              this.connection.run(statement, parameters)
            }
          }
        }
      }
      this.connection.run(
        `UPDATE ${BASE_COLUMNS_TABLE}
            SET name = ?, property = ?, storage_codec = ?, depends_on = ?,
                updated_at = CURRENT_TIMESTAMP
          WHERE table_name = ? AND table_column_name = ?`,
        [
          name,
          property === null ? null : JSON.stringify(property),
          storageCodec,
          dependsOn === null ? null : JSON.stringify(dependsOn),
          table.rawTableName,
          field.tableColumnName,
        ]
      )
      this.removeUnsupportedColumnStats(tableId, {
        ...field,
        name,
        property,
        storageCodec,
        dependsOn,
      })
      this.touchMetadata({})
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
      this.touchMetadata({})
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
    return this.listRowPage(tableId, limit, offset, query).rows
  }

  getRow(tableId: string, rowId: string): BaseRow | null {
    const { table, fields } = this.rowReadSchema(tableId)
    const row = this.getComputedRow(tableId, rowId, fields, table)
    if (!row) return null
    return this.hydrateRelationRows([row], fields)[0] ?? null
  }

  private listRowPage(
    tableId: string,
    limit: number,
    offset: number,
    query: BaseRowQuery,
    cursor?: string,
    projection?: BaseRowPageProjection
  ): { rows: BaseRow[]; nextCursor?: string } {
    const { table, fields } = this.rowReadSchema(tableId)
    const fieldsByColumn = new Map(
      fields.map((field) => [field.tableColumnName, field])
    )
    const normalizedQuery = normalizeBaseRowQuery(query)
    const compiled = compileBaseRowQuery(fields, normalizedQuery)
    const sorts = baseCursorSorts(fields, normalizedQuery)
    const sortedCursorEligible =
      sorts.length > 0 &&
      sorts.length <= BASE_SORTED_CURSOR_MAX_FIELDS &&
      sorts.every((sort) => !sort.field.isDerived)
    const safeLimit = Math.max(0, limit)
    const candidateColumns = projection
      ? Array.from(new Set(projection.columns))
      : []
    const preservedColumns = projection
      ? Array.from(new Set(projection.preservedColumns ?? []))
      : []
    if (
      projection?.fieldLimit !== undefined &&
      (!Number.isSafeInteger(projection.fieldLimit) ||
        projection.fieldLimit < 0)
    ) {
      throw new BaseError(
        "invalid-query",
        "Base row page projection field limit must be a non-negative integer"
      )
    }
    const outputColumns = projection
      ? new Set(["_id", "title", ...candidateColumns, ...preservedColumns])
      : null
    if (outputColumns) {
      for (const columnName of outputColumns) {
        const safeColumnName = assertKnownFieldColumnName(columnName)
        if (!fieldsByColumn.has(safeColumnName)) {
          throw new BaseError(
            "field-not-found",
            `Base field not found: ${safeColumnName}`
          )
        }
      }
    }
    const queryColumns = outputColumns
      ? baseRowQueryPredicateColumns(fields, normalizedQuery)
      : null
    if (queryColumns) {
      for (const columnName of outputColumns ?? []) {
        queryColumns.add(columnName)
      }
      for (const sort of sorts) {
        queryColumns.add(sort.field.tableColumnName)
      }
    }
    const rowSource = this.rowSourceSql(
      tableId,
      fields,
      queryColumns ?? undefined,
      table
    )
    const selectedColumns = outputColumns
      ? Array.from(
          new Set([
            "__base_rowid",
            ...outputColumns,
            ...sorts.map((sort) => sort.field.tableColumnName),
          ])
        )
          .map(quoteIdentifier)
          .join(", ")
      : "*"
    let rows: BaseRow[]

    if (cursor && sorts.length === 0) {
      const afterRowId = decodeBaseRowCursor(cursor)
      const cursorWhere = appendBaseCursorWhere(
        compiled.whereSql,
        '"__base_rowid" > ?'
      )
      rows = this.connection.query<BaseRow>(
        `SELECT ${selectedColumns} FROM ${rowSource}
          ${cursorWhere} ${compiled.orderSql} LIMIT ?`,
        [...compiled.params, afterRowId, safeLimit]
      )
    } else if (cursor && sortedCursorEligible) {
      const querySignature = baseCursorQuerySignature(normalizedQuery)
      const decodedCursor = decodeBaseSortedCursor(
        cursor,
        querySignature,
        sorts.length
      )
      rows = []
      for (const branch of baseSortedCursorBranches(sorts, decodedCursor)) {
        const remaining = safeLimit - rows.length
        if (remaining <= 0) break
        const cursorWhere = appendBaseCursorWhere(compiled.whereSql, branch.sql)
        rows.push(
          ...this.connection.query<BaseRow>(
            `SELECT ${selectedColumns} FROM ${rowSource}
              ${cursorWhere} ${compiled.orderSql} LIMIT ?`,
            [...compiled.params, ...branch.params, remaining]
          )
        )
      }
    } else if (cursor) {
      throw new BaseError("invalid-query", "Invalid Base row page cursor")
    } else {
      rows = this.connection.query<BaseRow>(
        `SELECT ${selectedColumns} FROM ${rowSource}
          ${compiled.whereSql} ${compiled.orderSql} LIMIT ? OFFSET ?`,
        [...compiled.params, safeLimit, Math.max(0, offset)]
      )
    }

    const nextCursor =
      sorts.length === 0
        ? encodeBaseRowCursor(rows.at(-1)?.__base_rowid)
        : sortedCursorEligible
          ? encodeBaseSortedCursor(
              rows.at(-1),
              sorts,
              baseCursorQuerySignature(normalizedQuery)
            )
          : undefined
    rows.forEach((row) => {
      delete row.__base_rowid
      if (!outputColumns) return
      for (const sort of sorts) {
        const columnName = sort.field.tableColumnName
        if (!outputColumns.has(columnName)) delete row[columnName]
      }
    })
    if (projection) {
      const preserved = new Set(["_id", "title", ...preservedColumns])
      const fieldLimit = projection.fieldLimit
      rows = rows.map((row) => {
        const projectedRow: BaseRow = {}
        for (const columnName of preserved) {
          if (Object.prototype.hasOwnProperty.call(row, columnName)) {
            projectedRow[columnName] = row[columnName]
          }
        }
        let fieldCount = 0
        for (const columnName of candidateColumns) {
          if (preserved.has(columnName)) continue
          if (fieldLimit !== undefined && fieldCount >= fieldLimit) break
          const value = row[columnName]
          if (projection.omitEmptyFields && isEmptyProjectedFieldValue(value)) {
            continue
          }
          projectedRow[columnName] = value
          fieldCount += 1
        }
        return projectedRow
      })
    }
    const projectedResultColumns = outputColumns
      ? new Set(rows.flatMap((row) => Object.keys(row)))
      : null
    const hydratedFields = projectedResultColumns
      ? fields.filter((field) =>
          projectedResultColumns.has(field.tableColumnName)
        )
      : fields
    return {
      rows: this.hydrateRelationRows(rows, hydratedFields),
      ...(nextCursor ? { nextCursor } : {}),
    }
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
            Object.prototype.hasOwnProperty.call(row, field.tableColumnName)
              ? decodeBaseRelationIds(row[field.tableColumnName])
              : []
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
        if (!Object.prototype.hasOwnProperty.call(row, field.tableColumnName)) {
          continue
        }
        const values = decodeBaseRelationIds(row[field.tableColumnName]).map(
          (id) => ({ id, title: titles.get(id) ?? "Missing record" })
        )
        row[`${field.tableColumnName}__display`] = JSON.stringify(values)
      }
    }
    return hydrated
  }

  countRows(tableId: string, query: BaseRowQuery = {}): number {
    const { table, fields } = this.rowReadSchema(tableId)
    const compiled = compileBaseRowQuery(fields, query)
    return (
      this.connection.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${this.countRowSourceSql(tableId, fields, query, [], table)}
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
    const { table, fields } = this.rowReadSchema(tableId)
    const safeColumnName = assertKnownFieldColumnName(columnName)
    const field = fields.find(
      (candidate) => candidate.tableColumnName === safeColumnName
    )
    if (!field) {
      throw new BaseError(
        "field-not-found",
        `Base field not found: ${safeColumnName}`
      )
    }
    const compiled = compileBaseRowQuery(fields, query)
    const column = quoteIdentifier(field.tableColumnName)
    return this.connection
      .query<{ value: BaseSqlPrimitive; total: number }>(
        `SELECT ${column} AS value, COUNT(*) AS total
           FROM ${this.countRowSourceSql(tableId, fields, query, [field.tableColumnName], table)}
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
    const { table, fields } = this.rowReadSchema(tableId)
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
         FROM ${this.rowSourceSql(tableId, fields, undefined, table)}
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
    totalHint?: number,
    cursor?: string,
    projection?: BaseRowPageProjection
  ): BaseRowPage {
    const safeOffset = Math.max(0, Math.trunc(offset))
    const safeLimit = Math.min(500, Math.max(1, Math.trunc(limit)))
    const safeTotalHint =
      typeof totalHint === "number" &&
      Number.isSafeInteger(totalHint) &&
      totalHint >= 0
        ? totalHint
        : null
    const page = this.listRowPage(
      tableId,
      safeLimit,
      safeOffset,
      query,
      cursor,
      projection
    )
    return {
      tableId,
      offset: safeOffset,
      limit: safeLimit,
      total: safeTotalHint ?? this.countRows(tableId, query),
      rows: page.rows,
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
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
      _id: row._id ?? createBaseUuid(),
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
    this.touchMetadata({})
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
      _id: row._id ?? createBaseUuid(),
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
    this.touchMetadata({})
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
      if (mutated) this.touchMetadata({})

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
      if (deletedCount > 0) this.touchMetadata({})
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
    if (deleted.length > 0) this.touchMetadata({})
    return deleted
  }
}
