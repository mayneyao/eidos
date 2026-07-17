import type {
  EidosFileConnection,
  EidosFileSqlParams,
  EidosFileSqlPrimitive,
} from "./connection"
import {
  EIDOS_FILE_COLUMNS_TABLE,
  EIDOS_FILE_META_TABLE,
  EIDOS_FILE_REFERENCES_TABLE,
  EIDOS_FILE_TABLES_TABLE,
  EIDOS_FILE_VIEWS_TABLE,
} from "./constants"
import {
  EIDOS_FILE_SORTED_CURSOR_MAX_FIELDS,
  appendEidosFileCursorWhere,
  eidosFileCursorQuerySignature,
  eidosFileCursorSorts,
  eidosFileSortedCursorBranches,
  decodeEidosFileRowCursor,
  decodeEidosFileSortedCursor,
  encodeEidosFileRowCursor,
  encodeEidosFileSortedCursor,
} from "./cursor-paging"
import { EidosFileError } from "./errors"
import {
  decodeEidosFileMultiSelectValues,
  encodeEidosFileMultiSelectValues,
  isMutableEidosFileFieldType,
  planEidosFileFieldConversion,
} from "./field-conversion"
import {
  decodeEidosFileAttachmentPaths,
  encodeEidosFileAttachmentPaths,
} from "./file-values"
import {
  compileEidosFileFormula,
  compileEidosFileFormulaFields,
  type CompiledEidosFileFormula,
} from "./formula"
import {
  decodeEidosFileRelationIds,
  encodeEidosFileRelationIds,
} from "./relation-values"
import {
  assertEidosFileColumnName,
  assertEidosFileTableId,
  createEidosFileIdentifier,
  createEidosFileUuid,
  quoteIdentifier,
  rawTableNameForId,
} from "./identifiers"
import {
  eidosFileFieldStoresJsonArray,
  eidosFileLookupAggregateSupportsTarget,
  eidosFileLookupDisplayType,
  eidosFileLookupStorageCodec,
} from "./lookup"
import { setEidosFileMetadata } from "./schema"
import {
  eidosFileRowQueryPredicateColumns,
  compileEidosFileRowQuery,
  normalizeEidosFileFilter,
  normalizeEidosFileRowQuery,
  normalizeEidosFileSorts,
  removeEidosFileFilterField,
} from "./query"
import type {
  EidosFileColumnStatConfig,
  EidosFileColumnStatResult,
  EidosFileFieldInfo,
  EidosFileFieldPlacement,
  EidosFileFieldType,
  EidosFileFormulaPreview,
  EidosFileFormulaPreviewInput,
  EidosFileMetadata,
  EidosFileLookupAggregate,
  EidosFileRow,
  EidosFileRowGroupCount,
  EidosFileRowPage,
  EidosFileRowPageProjection,
  EidosFileRowQuery,
  EidosFileRowRange,
  EidosFileRowUpdate,
  EidosFileStorageCodec,
  EidosFileTableInfo,
  EidosFileViewInfo,
  CreateEidosFileFieldInput,
  CreateEidosFileReferenceInput,
  CreateEidosFileTableInput,
  CreateEidosFileViewInput,
  ImportEidosFileFieldInput,
  UpdateEidosFileFieldInput,
  UpdateEidosFileTableInput,
  UpdateEidosFileViewInput,
} from "./types"
import {
  eidosFileColumnStatTypesForField,
  compileEidosFileColumnStatExpression,
  normalizeEidosFileColumnStatConfigs,
} from "./column-stats"
import { validateEidosFile } from "./validation"
import {
  assertEidosFileSelectOptions,
  parseEidosFileSelectOptions,
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

const EIDOS_FILE_VIEW_QUERY_INDEX_PREFIX = "eidos__view_query_"
const EIDOS_FILE_NOCASE_SORT_TYPES = new Set([
  "title",
  "text",
  "url",
  "select",
  "multi-select",
  "file",
])

function eidosFileViewQueryIndexName(viewId: string): string {
  return `${EIDOS_FILE_VIEW_QUERY_INDEX_PREFIX}${viewId}`
}

function eidosFileFieldUsesNoCaseSort(field: EidosFileFieldInfo): boolean {
  const displayType =
    (field.type === "formula" || field.type === "lookup") &&
    typeof field.property?.displayType === "string"
      ? field.property.displayType
      : field.type
  return EIDOS_FILE_NOCASE_SORT_TYPES.has(displayType)
}

function normalizedSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim()
}

interface FieldRow {
  name: string
  type: EidosFileFieldType
  table_name: string
  table_column_name: string
  property: string | null
  storage_codec: EidosFileStorageCodec
  value_kind: EidosFileFieldInfo["valueKind"]
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

interface EidosFileRowReadSchema {
  table: EidosFileTableInfo
  fields: EidosFileFieldInfo[]
}

interface EidosFileLookupCompilationNode {
  key: string
  label: string
}

interface EidosFileLookupCompilationContext {
  path: EidosFileLookupCompilationNode[]
  overrides?: ReadonlyMap<string, EidosFileFieldInfo>
}

const EMPTY_LOOKUP_COMPILATION_CONTEXT: EidosFileLookupCompilationContext = {
  path: [],
}

function eidosFileLookupFieldKey(tableId: string, columnName: string): string {
  return `${tableId}\u0000${columnName}`
}

const SYSTEM_FIELDS: Array<{
  name: string
  type: EidosFileFieldType
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
    : assertEidosFileColumnName(columnName)
}

function isEmptyProjectedFieldValue(value: EidosFileRow[string]): boolean {
  return value === null || value === undefined || value === ""
}

function tableInfoFromRow(row: RegistryRow): EidosFileTableInfo {
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

function sqlTypeForField(type: EidosFileFieldType): string {
  if (type === "checkbox") return "BOOLEAN"
  if (type === "number") return "REAL"
  if (type === "rating") return "INT"
  return "TEXT"
}

function defaultStorageCodec(type: EidosFileFieldType): EidosFileStorageCodec {
  if (type === "multi-select" || type === "file") return "json_array"
  if (type === "link") return "relation"
  if (type === "formula" || type === "lookup") return "scalar"
  return "scalar"
}

function sqliteParameter(
  value: EidosFileRow[string]
): EidosFileSqlParams[number] {
  return typeof value === "boolean" ? (value ? 1 : 0) : value
}

function writableFieldValue(
  field: EidosFileFieldInfo | undefined,
  value: EidosFileRow[string]
): EidosFileRow[string] {
  if (value === null) return value
  if (field?.type === "file") {
    return encodeEidosFileAttachmentPaths(decodeEidosFileAttachmentPaths(value))
  }
  if (field?.type === "multi-select") {
    return encodeEidosFileMultiSelectValues(
      decodeEidosFileMultiSelectValues(
        typeof value === "boolean" ? null : value
      )
    )
  }
  if (field?.type === "link") {
    return encodeEidosFileRelationIds(decodeEidosFileRelationIds(value))
  }
  return value
}

export class EidosFileRuntime {
  private readonly formulaCompilationCache = new Map<
    string,
    { signature: string; formulas: CompiledEidosFileFormula[] }
  >()
  private readonly rowReadSchemaCache = new Map<
    string,
    EidosFileRowReadSchema
  >()
  private rowReadDataVersion: number | null = null

  constructor(
    readonly connection: EidosFileConnection,
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
    setEidosFileMetadata(this.connection, entries)
    this.invalidateRowReadSchema()
  }

  private rowReadSchema(tableId: string): EidosFileRowReadSchema {
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
    fields: EidosFileFieldInfo[]
  ): CompiledEidosFileFormula[] {
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
    const formulas = compileEidosFileFormulaFields(fields)
    this.formulaCompilationCache.set(tableId, { signature, formulas })
    return formulas
  }

  private relationTarget(
    field: EidosFileFieldInfo
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
    fields: EidosFileFieldInfo[],
    requestedDerivedColumns?: ReadonlySet<string>,
    table = this.getTable(tableId),
    lookupContext = EMPTY_LOOKUP_COMPILATION_CONTEXT
  ): string {
    const requiredDerivedColumns = requestedDerivedColumns
      ? this.requiredDerivedColumns(fields, requestedDerivedColumns)
      : null
    const includesDerivedColumn = (field: EidosFileFieldInfo) =>
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
    fields: EidosFileFieldInfo[],
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
    fields: EidosFileFieldInfo[],
    query: EidosFileRowQuery,
    projectedColumns: Iterable<string> = [],
    table = this.getTable(tableId)
  ): string {
    const requestedColumns = eidosFileRowQueryPredicateColumns(fields, query)
    for (const columnName of projectedColumns) {
      requestedColumns.add(columnName)
    }
    return this.rowSourceSql(tableId, fields, requestedColumns, table)
  }

  private viewQueryIndexSql(view: EidosFileViewInfo): string | null {
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
          eidosFileFieldUsesNoCaseSort(field) ? " COLLATE NOCASE" : ""
        } ${sort.direction === "desc" ? "DESC" : "ASC"}`
      )
      seen.add(field.tableColumnName)
    }

    if (columns.length === 0) return null
    return `CREATE INDEX ${quoteIdentifier(
      eidosFileViewQueryIndexName(view.id)
    )} ON ${quoteIdentifier(table.rawTableName)} (${columns.join(", ")})`
  }

  private syncViewQueryIndex(view: EidosFileViewInfo): void {
    const indexName = eidosFileViewQueryIndexName(view.id)
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
      [table.rawTableName, `${EIDOS_FILE_VIEW_QUERY_INDEX_PREFIX}*`]
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
        views.map((view) => eidosFileViewQueryIndexName(view.id))
      )
      const indexes = this.connection.query<{ name: string }>(
        `SELECT name FROM sqlite_master
          WHERE type = 'index' AND tbl_name = ? AND name GLOB ?`,
        [table.rawTableName, `${EIDOS_FILE_VIEW_QUERY_INDEX_PREFIX}*`]
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
    field: EidosFileFieldInfo,
    fields: EidosFileFieldInfo[],
    sourceAlias: string,
    context: EidosFileLookupCompilationContext = EMPTY_LOOKUP_COMPILATION_CONTEXT
  ): string {
    const fieldKey = eidosFileLookupFieldKey(tableId, field.tableColumnName)
    const cycleStart = context.path.findIndex((node) => node.key === fieldKey)
    if (cycleStart >= 0) {
      const cycle = [
        ...context.path.slice(cycleStart).map((node) => node.label),
        field.name,
      ].join(" → ")
      throw new EidosFileError(
        "invalid-schema",
        `Circular Eidos File lookup dependency: ${cycle}`
      )
    }
    if (context.path.length >= 32) {
      throw new EidosFileError(
        "invalid-schema",
        "Eidos File lookup dependency depth cannot exceed 32 fields"
      )
    }
    const nextContext: EidosFileLookupCompilationContext = {
      ...context,
      path: [...context.path, { key: fieldKey, label: field.name }],
    }
    const relationColumn = field.property?.relationField
    const targetColumn = field.property?.targetField
    const aggregate = field.property?.aggregate
    const aggregates = new Set<EidosFileLookupAggregate>([
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
      !aggregates.has(aggregate as EidosFileLookupAggregate)
    ) {
      throw new EidosFileError(
        "invalid-schema",
        `Lookup field “${field.name}” has incomplete settings`
      )
    }
    const lookupAggregate = aggregate as EidosFileLookupAggregate
    const relation = fields.find(
      (candidate) => candidate.tableColumnName === relationColumn
    )
    if (!relation || relation.type !== "link") {
      throw new EidosFileError(
        "field-not-found",
        `Lookup relation field not found: ${relationColumn}`
      )
    }
    const target = this.relationTarget(relation)
    if (!target) {
      throw new EidosFileError(
        "invalid-schema",
        `Relation field “${relation.name}” has no target table`
      )
    }
    const targetTable = this.getTable(target.tableId)
    const targetFields = this.queryFields(targetTable).map(
      (candidate) =>
        context.overrides?.get(
          eidosFileLookupFieldKey(target.tableId, candidate.tableColumnName)
        ) ?? candidate
    )
    const targetField = targetFields.find(
      (candidate) => candidate.tableColumnName === targetColumn
    )
    if (!targetField) {
      throw new EidosFileError(
        "field-not-found",
        `Lookup target field not found: ${targetColumn}`
      )
    }
    const nestedLookup =
      targetField.type === "lookup" &&
      targetField.valueKind === "derived" &&
      targetField.isDerived
    if (targetField.isDerived && !nestedLookup) {
      throw new EidosFileError(
        "invalid-schema",
        "An Eidos File lookup target must be stored or another Lookup field"
      )
    }
    if (this.getTable(tableId).rawTableName !== field.tableName) {
      throw new EidosFileError(
        "invalid-schema",
        "Lookup field belongs to another table"
      )
    }
    const outerRelation = `${quoteIdentifier(sourceAlias)}.${quoteIdentifier(relationColumn)}`
    const targetAlias = quoteIdentifier("lookup_target")
    const targetValue = `${targetAlias}.${quoteIdentifier(targetColumn)}`
    if (!eidosFileLookupAggregateSupportsTarget(lookupAggregate, targetField)) {
      throw new EidosFileError(
        "invalid-schema",
        `${lookupAggregate} lookup requires a number or rating target field`
      )
    }
    const expectedDisplayType = eidosFileLookupDisplayType(
      lookupAggregate,
      targetField
    )
    if (field.property?.displayType !== expectedDisplayType) {
      throw new EidosFileError(
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
    const stream = eidosFileFieldStoresJsonArray(targetField)
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
    overrides: ReadonlyMap<string, EidosFileFieldInfo>
  ): void {
    for (const sourceTable of this.listTables()) {
      const sourceFields = this.queryFields(sourceTable).map(
        (candidate) =>
          overrides.get(
            eidosFileLookupFieldKey(sourceTable.id, candidate.tableColumnName)
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
    rowId: EidosFileSqlParams[number],
    fields: EidosFileFieldInfo[],
    table = this.getTable(tableId)
  ): EidosFileRow | undefined {
    const row = this.connection.get<EidosFileRow>(
      `SELECT * FROM ${this.rowSourceSql(tableId, fields, undefined, table)} WHERE _id = ?`,
      [rowId]
    )
    if (row) delete row.__base_rowid
    return row
  }

  previewFormula(
    tableId: string,
    input: EidosFileFormulaPreviewInput
  ): EidosFileFormulaPreview {
    const table = this.getTable(tableId)
    const columnName = assertEidosFileColumnName(input.columnName)
    const fields = this.listFields(tableId)
    const existing = fields.find(
      (field) => field.tableColumnName === columnName
    )
    if (existing && existing.type !== "formula") {
      throw new EidosFileError(
        "invalid-schema",
        `Eidos File field “${existing.name}” is not a formula`
      )
    }
    const draft: EidosFileFieldInfo = existing
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
    const compiled = compileEidosFileFormula(draft, draftFields)
    const resolvedDraft: EidosFileFieldInfo = {
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
    compileEidosFileFormulaFields(previewFields)
    const samples = this.connection.query<{
      row_id: EidosFileRow[string]
      title: EidosFileRow[string]
      value: EidosFileRow[string]
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

  info(): EidosFileMetadata {
    const result = validateEidosFile(this.connection)
    if (!result.valid || !result.metadata) {
      throw new EidosFileError(
        "invalid-schema",
        result.errors.map((issue) => issue.message).join("; ") ||
          "Invalid Eidos File"
      )
    }
    return result.metadata
  }

  listTables(): EidosFileTableInfo[] {
    return this.connection
      .query<RegistryRow>(
        `SELECT id, name, raw_table_name, position, icon, description,
                created_at, updated_at
           FROM ${EIDOS_FILE_TABLES_TABLE}
          ORDER BY position, created_at, id`
      )
      .map(tableInfoFromRow)
  }

  getTable(tableId: string): EidosFileTableInfo {
    assertEidosFileTableId(tableId)
    const row = this.connection.get<RegistryRow>(
      `SELECT id, name, raw_table_name, position, icon, description,
              created_at, updated_at
         FROM ${EIDOS_FILE_TABLES_TABLE}
        WHERE id = ?`,
      [tableId]
    )
    if (!row) {
      throw new EidosFileError(
        "table-not-found",
        `Eidos File table not found: ${tableId}`
      )
    }
    return tableInfoFromRow(row)
  }

  createTable(input: CreateEidosFileTableInput): EidosFileTableInfo {
    const tableId = assertEidosFileTableId(
      input.id ?? createEidosFileIdentifier()
    )
    const rawTableName = rawTableNameForId(tableId)
    const quotedTable = quoteIdentifier(rawTableName)
    const position =
      this.connection.get<{ position: number }>(
        `SELECT COALESCE(MAX(position), 0) + 1 AS position FROM ${EIDOS_FILE_TABLES_TABLE}`
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
        `INSERT INTO ${EIDOS_FILE_TABLES_TABLE}
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
          `INSERT INTO ${EIDOS_FILE_COLUMNS_TABLE}
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
          `INSERT INTO ${EIDOS_FILE_VIEWS_TABLE}
            (id, name, type, table_id, query, position)
           VALUES (?, 'Grid', 'grid', ?, ?, 1)`,
          [createEidosFileUuid(), tableId, `SELECT * FROM ${quotedTable}`]
        )
      }
      const currentDefault = this.connection.get<{ value: string }>(
        `SELECT value FROM ${EIDOS_FILE_META_TABLE} WHERE key = 'default_table_id'`
      )
      if (!currentDefault) {
        this.touchMetadata({ default_table_id: tableId })
      }
    })
    return this.getTable(tableId)
  }

  updateTable(
    tableId: string,
    changes: UpdateEidosFileTableInput
  ): EidosFileTableInfo {
    const table = this.getTable(tableId)
    const name = changes.name === undefined ? table.name : changes.name.trim()
    if (!name) {
      throw new EidosFileError(
        "invalid-identifier",
        "Eidos File table name is required"
      )
    }
    this.connection.transaction(() => {
      this.connection.run(
        `UPDATE ${EIDOS_FILE_TABLES_TABLE}
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
      throw new EidosFileError(
        "relation-in-use",
        `Eidos File table “${table.name}” is used by ${inboundRelations.length} relation field${inboundRelations.length === 1 ? "" : "s"}`
      )
    }
    return this.connection.transaction(() => {
      this.connection.run(
        `DELETE FROM ${EIDOS_FILE_REFERENCES_TABLE}
          WHERE self_table_name = ? OR ref_table_name = ? OR link_table_name = ?`,
        [table.rawTableName, table.rawTableName, table.rawTableName]
      )
      this.connection.run(
        `DELETE FROM ${EIDOS_FILE_VIEWS_TABLE} WHERE table_id = ?`,
        [tableId]
      )
      this.connection.run(
        `DELETE FROM ${EIDOS_FILE_COLUMNS_TABLE} WHERE table_name = ?`,
        [table.rawTableName]
      )
      this.connection.run(
        `DELETE FROM ${EIDOS_FILE_TABLES_TABLE} WHERE id = ?`,
        [tableId]
      )
      this.connection.exec(`DROP TABLE ${quoteIdentifier(table.rawTableName)}`)

      const currentDefault = this.connection.get<{ value: string }>(
        `SELECT value FROM ${EIDOS_FILE_META_TABLE} WHERE key = 'default_table_id'`
      )
      if (currentDefault?.value === tableId) {
        const nextDefault = this.connection.get<{ id: string }>(
          `SELECT id FROM ${EIDOS_FILE_TABLES_TABLE}
            ORDER BY position, created_at, id LIMIT 1`
        )
        if (nextDefault) {
          this.connection.run(
            `UPDATE ${EIDOS_FILE_META_TABLE} SET value = ? WHERE key = 'default_table_id'`,
            [nextDefault.id]
          )
        } else {
          this.connection.run(
            `DELETE FROM ${EIDOS_FILE_META_TABLE} WHERE key = 'default_table_id'`
          )
        }
      }
      this.touchMetadata({})
      return true
    })
  }

  private queryFields(table: EidosFileTableInfo): EidosFileFieldInfo[] {
    return this.connection
      .query<FieldRow>(
        `SELECT name, type, table_name, table_column_name, property,
                storage_codec, value_kind, is_hidden, is_derived,
                source_table_column_name, depends_on
           FROM ${EIDOS_FILE_COLUMNS_TABLE}
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

  listFields(tableId: string): EidosFileFieldInfo[] {
    return this.queryFields(this.getTable(tableId))
  }

  listViews(tableId: string): EidosFileViewInfo[] {
    this.getTable(tableId)
    return this.connection
      .query<ViewRow>(
        `SELECT id, name, type, table_id, query, properties, filter,
                order_map, hidden_fields, position, created_at, updated_at
           FROM ${EIDOS_FILE_VIEWS_TABLE}
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
          filter: normalizeEidosFileFilter(parseJson(view.filter)),
          sorts: normalizeEidosFileSorts(properties?.sorts),
          orderMap: parseJson(view.order_map) as Record<string, number> | null,
          hiddenFields:
            (parseJson(view.hidden_fields) as string[] | null) ?? [],
          position: view.position,
          createdAt: view.created_at,
          updatedAt: view.updated_at,
        }
      })
  }

  updateView(
    viewId: string,
    changes: UpdateEidosFileViewInput
  ): EidosFileViewInfo {
    const existing = this.connection.get<ViewRow>(
      `SELECT id, name, type, table_id, query, properties, filter,
              order_map, hidden_fields, position, created_at, updated_at
         FROM ${EIDOS_FILE_VIEWS_TABLE}
        WHERE id = ?`,
      [viewId]
    )
    if (!existing) {
      throw new EidosFileError(
        "view-not-found",
        `Eidos File view not found: ${viewId}`
      )
    }
    const name =
      changes.name === undefined ? existing.name : changes.name.trim()
    if (!name) {
      throw new EidosFileError(
        "invalid-identifier",
        "Eidos File view name is required"
      )
    }
    const type =
      changes.type === undefined ? existing.type : changes.type.trim()
    if (!type) {
      throw new EidosFileError(
        "invalid-identifier",
        "Eidos File view type is required"
      )
    }
    if (
      changes.position !== undefined &&
      changes.position !== null &&
      (!Number.isSafeInteger(changes.position) || changes.position < 0)
    ) {
      throw new EidosFileError(
        "invalid-range",
        "Eidos File view position must be a non-negative integer"
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
            sorts: normalizeEidosFileSorts(changes.sorts),
          }
    this.connection.transaction(() => {
      this.connection.run(
        `UPDATE ${EIDOS_FILE_VIEWS_TABLE}
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
              ? normalizeEidosFileFilter(parseJson(existing.filter))
              : normalizeEidosFileFilter(changes.filter)
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
        throw new EidosFileError(
          "view-not-found",
          `Eidos File view not found: ${viewId}`
        )
      }
      this.syncViewQueryIndex(updated)
      this.touchMetadata({})
    })
    const updated = this.listViews(existing.table_id).find(
      (view) => view.id === viewId
    )
    if (!updated) {
      throw new EidosFileError(
        "view-not-found",
        `Eidos File view not found: ${viewId}`
      )
    }
    return updated
  }

  createView(
    tableId: string,
    input: CreateEidosFileViewInput
  ): EidosFileViewInfo {
    const table = this.getTable(tableId)
    const name = input.name.trim()
    const type = input.type.trim()
    if (!name || !type) {
      throw new EidosFileError(
        "invalid-identifier",
        "Eidos File view name and type are required"
      )
    }
    if (
      input.position !== undefined &&
      input.position !== null &&
      (!Number.isSafeInteger(input.position) || input.position < 0)
    ) {
      throw new EidosFileError(
        "invalid-range",
        "Eidos File view position must be a non-negative integer"
      )
    }
    const viewId = input.id ?? createEidosFileUuid()
    const position =
      input.position ??
      this.connection.get<{ position: number }>(
        `SELECT COALESCE(MAX(position), 0) + 1 AS position
           FROM ${EIDOS_FILE_VIEWS_TABLE} WHERE table_id = ?`,
        [tableId]
      )?.position ??
      1
    this.connection.transaction(() => {
      this.connection.run(
        `INSERT INTO ${EIDOS_FILE_VIEWS_TABLE}
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
                  : { sorts: normalizeEidosFileSorts(input.sorts) }),
              }),
          input.filter === undefined
            ? null
            : JSON.stringify(normalizeEidosFileFilter(input.filter)),
          input.orderMap === undefined ? null : JSON.stringify(input.orderMap),
          JSON.stringify(input.hiddenFields ?? []),
          position,
        ]
      )
      const created = this.listViews(tableId).find((view) => view.id === viewId)
      if (!created) {
        throw new EidosFileError(
          "view-not-found",
          `Unable to create Eidos File view: ${viewId}`
        )
      }
      this.syncViewQueryIndex(created)
      this.touchMetadata({})
    })
    const created = this.listViews(tableId).find((view) => view.id === viewId)
    if (!created) {
      throw new EidosFileError(
        "view-not-found",
        `Unable to create Eidos File view: ${viewId}`
      )
    }
    return created
  }

  duplicateView(viewId: string, name?: string): EidosFileViewInfo {
    const existing = this.connection.get<ViewRow>(
      `SELECT id, name, type, table_id, query, properties, filter,
              order_map, hidden_fields, position, created_at, updated_at
         FROM ${EIDOS_FILE_VIEWS_TABLE}
        WHERE id = ?`,
      [viewId]
    )
    if (!existing) {
      throw new EidosFileError(
        "view-not-found",
        `Eidos File view not found: ${viewId}`
      )
    }
    const view = this.listViews(existing.table_id).find(
      (candidate) => candidate.id === viewId
    )
    if (!view) {
      throw new EidosFileError(
        "view-not-found",
        `Eidos File view not found: ${viewId}`
      )
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
      `SELECT table_id FROM ${EIDOS_FILE_VIEWS_TABLE} WHERE id = ?`,
      [viewId]
    )
    if (!existing) {
      throw new EidosFileError(
        "view-not-found",
        `Eidos File view not found: ${viewId}`
      )
    }
    const count =
      this.connection.get<{ count: number }>(
        `SELECT COUNT(*) AS count FROM ${EIDOS_FILE_VIEWS_TABLE} WHERE table_id = ?`,
        [existing.table_id]
      )?.count ?? 0
    if (count <= 1) {
      throw new EidosFileError(
        "protected-view",
        "An Eidos File table must keep at least one view"
      )
    }
    return this.connection.transaction(() => {
      this.connection.exec(
        `DROP INDEX IF EXISTS ${quoteIdentifier(eidosFileViewQueryIndexName(viewId))}`
      )
      const result = this.connection.run(
        `DELETE FROM ${EIDOS_FILE_VIEWS_TABLE} WHERE id = ?`,
        [viewId]
      )
      if (result.changes > 0) this.touchMetadata({})
      return result.changes > 0
    })
  }

  reorderViews(tableId: string, viewIds: string[]): EidosFileViewInfo[] {
    const current = this.listViews(tableId)
    const expected = new Set(current.map((view) => view.id))
    if (
      viewIds.length !== current.length ||
      new Set(viewIds).size !== viewIds.length ||
      viewIds.some((viewId) => !expected.has(viewId))
    ) {
      throw new EidosFileError(
        "invalid-range",
        "Eidos File view order must contain every table view exactly once"
      )
    }
    this.connection.transaction(() => {
      viewIds.forEach((viewId, index) => {
        this.connection.run(
          `UPDATE ${EIDOS_FILE_VIEWS_TABLE}
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
    field: CreateEidosFileFieldInput,
    placement?: EidosFileFieldPlacement
  ): EidosFileFieldInfo {
    const table = this.getTable(tableId)
    const columnName = assertEidosFileColumnName(field.columnName)
    const quotedTable = quoteIdentifier(table.rawTableName)
    const quotedColumn = quoteIdentifier(columnName)
    let property: Record<string, unknown> | null = field.property ?? null
    let dependsOn: string[] | null = null
    let storageCodec = defaultStorageCodec(field.type)
    if (
      placement &&
      (!Number.isSafeInteger(placement.index) || placement.index < 0)
    ) {
      throw new EidosFileError(
        "invalid-range",
        "Eidos File field placement index must be a non-negative integer"
      )
    }
    const placementView = placement
      ? this.connection.get<Pick<ViewRow, "id" | "order_map">>(
          `SELECT id, order_map
             FROM ${EIDOS_FILE_VIEWS_TABLE}
            WHERE id = ? AND table_id = ?`,
          [placement.viewId, tableId]
        )
      : undefined
    if (placement && !placementView) {
      throw new EidosFileError(
        "view-not-found",
        `Eidos File view not found: ${placement.viewId}`
      )
    }
    if (
      (field.type === "select" || field.type === "multi-select") &&
      property === null
    ) {
      property = { options: [] }
    }
    if (field.type === "select" || field.type === "multi-select") {
      assertEidosFileSelectOptions(property)
    }
    if (field.type === "link") {
      const targetTable = this.getTable(field.property.targetTableId)
      const targetField = this.getField(
        targetTable.id,
        field.property.targetField
      )
      if (targetField.valueKind === "relation") {
        throw new EidosFileError(
          "invalid-schema",
          "An Eidos File relation cannot display another relation field"
        )
      }
      if (targetField.isDerived) {
        throw new EidosFileError(
          "invalid-schema",
          "An Eidos File relation display field must be stored on the target table"
        )
      }
    } else if (field.type === "formula") {
      const draft: EidosFileFieldInfo = {
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
      const compiled = compileEidosFileFormula(draft, fields)
      dependsOn = compiled.dependencies
      property = { ...field.property, expression: compiled.expression }
      compileEidosFileFormulaFields([
        ...fields.slice(0, -1),
        { ...draft, property, dependsOn },
      ])
    } else if (field.type === "lookup") {
      storageCodec = eidosFileLookupStorageCodec(field.property.aggregate)
      const draft: EidosFileFieldInfo = {
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
        overrides: new Map([
          [eidosFileLookupFieldKey(tableId, columnName), draft],
        ]),
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
        `INSERT INTO ${EIDOS_FILE_COLUMNS_TABLE}
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
          `UPDATE ${EIDOS_FILE_VIEWS_TABLE}
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
      throw new EidosFileError(
        "field-not-found",
        `Unable to create Eidos File field: ${columnName}`
      )
    }
    return created
  }

  importField(
    tableId: string,
    field: ImportEidosFileFieldInput
  ): EidosFileFieldInfo {
    const table = this.getTable(tableId)
    const existing = this.listFields(tableId).find(
      (candidate) => candidate.tableColumnName === field.columnName
    )
    const columnName = existing
      ? existing.tableColumnName
      : assertEidosFileColumnName(field.columnName)
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
          `INSERT INTO ${EIDOS_FILE_COLUMNS_TABLE}
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
          `UPDATE ${EIDOS_FILE_COLUMNS_TABLE}
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

  createReference(input: CreateEidosFileReferenceInput): void {
    const selfTable = this.getTable(input.selfTableId)
    const refTable = this.getTable(input.refTableId)
    const linkTable = this.getTable(input.linkTableId)
    const selfField = this.getField(input.selfTableId, input.selfColumnName)
    const refField = this.getField(input.refTableId, input.refColumnName)
    const linkField = this.getField(input.linkTableId, input.linkColumnName)
    this.connection.run(
      `INSERT INTO ${EIDOS_FILE_REFERENCES_TABLE}
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
    field: EidosFileFieldInfo
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
          ? (config as { type: EidosFileColumnStatConfig["type"] }).type
          : null
      if (type && eidosFileColumnStatTypesForField(field).includes(type))
        continue
      delete nextStats[field.tableColumnName]
      properties.columnStats = nextStats
      this.connection.run(
        `UPDATE ${EIDOS_FILE_VIEWS_TABLE}
            SET properties = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [JSON.stringify(properties), view.id]
      )
    }
  }

  updateField(
    tableId: string,
    columnName: string,
    changes: UpdateEidosFileFieldInput
  ): EidosFileFieldInfo {
    const table = this.getTable(tableId)
    const field = this.getField(tableId, columnName)
    const name = changes.name === undefined ? field.name : changes.name.trim()
    if (!name) {
      throw new EidosFileError(
        "invalid-identifier",
        "Eidos File field name is required"
      )
    }
    const targetType = changes.type ?? field.type
    if (targetType !== field.type) {
      if (
        field.valueKind !== "source" ||
        !isMutableEidosFileFieldType(field.type) ||
        !isMutableEidosFileFieldType(targetType)
      ) {
        throw new EidosFileError(
          "invalid-schema",
          `Eidos File field “${field.name}” cannot change from ${field.type} to ${targetType}`
        )
      }
      const quotedTable = quoteIdentifier(table.rawTableName)
      const quotedColumn = quoteIdentifier(field.tableColumnName)
      const rows = this.connection.query<{
        id: string
        value: EidosFileSqlPrimitive
      }>(
        `SELECT CAST(_id AS TEXT) AS id, ${quotedColumn} AS value
           FROM ${quotedTable}`
      )
      const plan = planEidosFileFieldConversion(field, rows, targetType)
      const property =
        changes.property === undefined ? plan.property : changes.property
      const convertedField: EidosFileFieldInfo = {
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
          [
            eidosFileLookupFieldKey(tableId, field.tableColumnName),
            convertedField,
          ],
        ])
      )
      const currentSqlType = sqlTypeForField(field.type)
      const targetSqlType = sqlTypeForField(targetType)
      this.connection.transaction(() => {
        this.dropViewQueryIndexes(tableId)
        let targetColumn = quotedColumn
        let backupColumn: string | null = null
        if (currentSqlType !== targetSqlType) {
          const suffix = createEidosFileIdentifier()
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
          `UPDATE ${EIDOS_FILE_COLUMNS_TABLE}
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
        ? parseEidosFileSelectOptions(field.property)
        : []
    const nextOptions =
      field.type === "select" || field.type === "multi-select"
        ? changes.property !== undefined
          ? assertEidosFileSelectOptions(property)
          : previousOptions
        : []
    if (
      changes.optionValueChanges !== undefined &&
      (changes.property === undefined ||
        (field.type !== "select" && field.type !== "multi-select"))
    ) {
      throw new EidosFileError(
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
        throw new EidosFileError(
          "invalid-schema",
          "Invalid select option rename"
        )
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
      const draft: EidosFileFieldInfo = {
        ...field,
        name,
        property: formulaProperty,
        dependsOn: null,
      }
      const fields = this.listFields(tableId).map((candidate) =>
        candidate.tableColumnName === field.tableColumnName ? draft : candidate
      )
      const compiled = compileEidosFileFormula(draft, fields)
      property = { ...formulaProperty, expression: compiled.expression }
      dependsOn = compiled.dependencies
      compileEidosFileFormulaFields(
        fields.map((candidate) =>
          candidate.tableColumnName === field.tableColumnName
            ? { ...draft, property, dependsOn }
            : candidate
        )
      )
    } else if (field.type === "lookup" && changes.property !== undefined) {
      const relationField = property?.relationField
      if (typeof relationField !== "string") {
        throw new EidosFileError(
          "invalid-schema",
          `Lookup field “${field.name}” requires a relation field`
        )
      }
      const draft: EidosFileFieldInfo = {
        ...field,
        name,
        property,
        storageCodec: eidosFileLookupStorageCodec(
          property?.aggregate as EidosFileLookupAggregate
        ),
        dependsOn: [relationField],
      }
      const fields = this.listFields(tableId).map((candidate) =>
        candidate.tableColumnName === field.tableColumnName ? draft : candidate
      )
      const overrides = new Map([
        [eidosFileLookupFieldKey(tableId, field.tableColumnName), draft],
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
            value: EidosFileSqlPrimitive
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
            const nextValues = decodeEidosFileMultiSelectValues(
              row.value
            ).flatMap((value) => {
              const renamed = optionValueChanges.get(value)
              if (renamed) return [renamed]
              return removedOptionValues.has(value) ? [] : [value]
            })
            return [
              encodeEidosFileMultiSelectValues(nextValues),
              row.id,
            ] as const
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
        `UPDATE ${EIDOS_FILE_COLUMNS_TABLE}
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
      throw new EidosFileError(
        "protected-field",
        `Eidos File system field cannot be deleted: ${field.name}`
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
      throw new EidosFileError(
        "formula-in-use",
        `Eidos File field “${field.name}” is used by ${dependentFormulas.length} formula field${dependentFormulas.length === 1 ? "" : "s"}`
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
      throw new EidosFileError(
        "lookup-in-use",
        `Eidos File field “${field.name}” is used by ${dependentLookups.length} lookup field${dependentLookups.length === 1 ? "" : "s"}`
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
      throw new EidosFileError(
        "lookup-in-use",
        `Eidos File field “${field.name}” is used as a lookup target`
      )
    }
    const inboundRelations = this.listTables().flatMap((sourceTable) =>
      this.listFields(sourceTable.id).filter((candidate) => {
        const target = this.relationTarget(candidate)
        return target?.tableId === tableId && target.columnName === columnName
      })
    )
    if (inboundRelations.length > 0) {
      throw new EidosFileError(
        "relation-in-use",
        `Eidos File field “${field.name}” is used as a relation display field`
      )
    }
    return this.connection.transaction(() => {
      this.dropViewQueryIndexes(tableId)
      this.connection.run(
        `DELETE FROM ${EIDOS_FILE_REFERENCES_TABLE}
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
        `DELETE FROM ${EIDOS_FILE_COLUMNS_TABLE}
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
          `UPDATE ${EIDOS_FILE_VIEWS_TABLE}
              SET properties = ?, filter = ?, order_map = ?, hidden_fields = ?,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          [
            JSON.stringify(properties),
            JSON.stringify(
              removeEidosFileFilterField(view.filter, field.tableColumnName)
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

  private getField(tableId: string, columnName: string): EidosFileFieldInfo {
    const safeColumnName = assertKnownFieldColumnName(columnName)
    const field = this.listFields(tableId).find(
      (candidate) => candidate.tableColumnName === safeColumnName
    )
    if (!field) {
      throw new EidosFileError(
        "field-not-found",
        `Eidos File field not found: ${safeColumnName}`
      )
    }
    return field
  }

  listRows(
    tableId: string,
    limit = 200,
    offset = 0,
    query: EidosFileRowQuery = {}
  ): EidosFileRow[] {
    return this.listRowPage(tableId, limit, offset, query).rows
  }

  getRow(tableId: string, rowId: string): EidosFileRow | null {
    const { table, fields } = this.rowReadSchema(tableId)
    const row = this.getComputedRow(tableId, rowId, fields, table)
    if (!row) return null
    return this.hydrateRelationRows([row], fields)[0] ?? null
  }

  private listRowPage(
    tableId: string,
    limit: number,
    offset: number,
    query: EidosFileRowQuery,
    cursor?: string,
    projection?: EidosFileRowPageProjection
  ): { rows: EidosFileRow[]; nextCursor?: string } {
    const { table, fields } = this.rowReadSchema(tableId)
    const fieldsByColumn = new Map(
      fields.map((field) => [field.tableColumnName, field])
    )
    const normalizedQuery = normalizeEidosFileRowQuery(query)
    const compiled = compileEidosFileRowQuery(fields, normalizedQuery)
    const sorts = eidosFileCursorSorts(fields, normalizedQuery)
    const sortedCursorEligible =
      sorts.length > 0 &&
      sorts.length <= EIDOS_FILE_SORTED_CURSOR_MAX_FIELDS &&
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
      throw new EidosFileError(
        "invalid-query",
        "Eidos File row page projection field limit must be a non-negative integer"
      )
    }
    const outputColumns = projection
      ? new Set(["_id", "title", ...candidateColumns, ...preservedColumns])
      : null
    if (outputColumns) {
      for (const columnName of outputColumns) {
        const safeColumnName = assertKnownFieldColumnName(columnName)
        if (!fieldsByColumn.has(safeColumnName)) {
          throw new EidosFileError(
            "field-not-found",
            `Eidos File field not found: ${safeColumnName}`
          )
        }
      }
    }
    const queryColumns = outputColumns
      ? eidosFileRowQueryPredicateColumns(fields, normalizedQuery)
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
    let rows: EidosFileRow[]

    if (cursor && sorts.length === 0) {
      const afterRowId = decodeEidosFileRowCursor(cursor)
      const cursorWhere = appendEidosFileCursorWhere(
        compiled.whereSql,
        '"__base_rowid" > ?'
      )
      rows = this.connection.query<EidosFileRow>(
        `SELECT ${selectedColumns} FROM ${rowSource}
          ${cursorWhere} ${compiled.orderSql} LIMIT ?`,
        [...compiled.params, afterRowId, safeLimit]
      )
    } else if (cursor && sortedCursorEligible) {
      const querySignature = eidosFileCursorQuerySignature(normalizedQuery)
      const decodedCursor = decodeEidosFileSortedCursor(
        cursor,
        querySignature,
        sorts.length
      )
      rows = []
      for (const branch of eidosFileSortedCursorBranches(
        sorts,
        decodedCursor
      )) {
        const remaining = safeLimit - rows.length
        if (remaining <= 0) break
        const cursorWhere = appendEidosFileCursorWhere(
          compiled.whereSql,
          branch.sql
        )
        rows.push(
          ...this.connection.query<EidosFileRow>(
            `SELECT ${selectedColumns} FROM ${rowSource}
              ${cursorWhere} ${compiled.orderSql} LIMIT ?`,
            [...compiled.params, ...branch.params, remaining]
          )
        )
      }
    } else if (cursor) {
      throw new EidosFileError(
        "invalid-query",
        "Invalid Eidos File row page cursor"
      )
    } else {
      rows = this.connection.query<EidosFileRow>(
        `SELECT ${selectedColumns} FROM ${rowSource}
          ${compiled.whereSql} ${compiled.orderSql} LIMIT ? OFFSET ?`,
        [...compiled.params, safeLimit, Math.max(0, offset)]
      )
    }

    const nextCursor =
      sorts.length === 0
        ? encodeEidosFileRowCursor(rows.at(-1)?.__base_rowid)
        : sortedCursorEligible
          ? encodeEidosFileSortedCursor(
              rows.at(-1),
              sorts,
              eidosFileCursorQuerySignature(normalizedQuery)
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
        const projectedRow: EidosFileRow = {}
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
    rows: EidosFileRow[],
    fields: EidosFileFieldInfo[]
  ): EidosFileRow[] {
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
              ? decodeEidosFileRelationIds(row[field.tableColumnName])
              : []
          )
        )
      )
      const titles = new Map<string, string>()
      for (let start = 0; start < ids.length; start += 400) {
        const batch = ids.slice(start, start + 400)
        if (batch.length === 0) continue
        const records = this.connection.query<{
          _id: EidosFileSqlParams[number]
          display_value: EidosFileSqlParams[number]
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
        const values = decodeEidosFileRelationIds(
          row[field.tableColumnName]
        ).map((id) => ({ id, title: titles.get(id) ?? "Missing record" }))
        row[`${field.tableColumnName}__display`] = JSON.stringify(values)
      }
    }
    return hydrated
  }

  countRows(tableId: string, query: EidosFileRowQuery = {}): number {
    const { table, fields } = this.rowReadSchema(tableId)
    const compiled = compileEidosFileRowQuery(fields, query)
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
    query: EidosFileRowQuery = {}
  ): EidosFileRowGroupCount[] {
    const { table, fields } = this.rowReadSchema(tableId)
    const safeColumnName = assertKnownFieldColumnName(columnName)
    const field = fields.find(
      (candidate) => candidate.tableColumnName === safeColumnName
    )
    if (!field) {
      throw new EidosFileError(
        "field-not-found",
        `Eidos File field not found: ${safeColumnName}`
      )
    }
    const compiled = compileEidosFileRowQuery(fields, query)
    const column = quoteIdentifier(field.tableColumnName)
    return this.connection
      .query<{ value: EidosFileSqlPrimitive; total: number }>(
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
    configs: EidosFileColumnStatConfig[],
    query: EidosFileRowQuery = {}
  ): EidosFileColumnStatResult[] {
    const { table, fields } = this.rowReadSchema(tableId)
    const normalized = normalizeEidosFileColumnStatConfigs(configs, fields)
    if (normalized.length === 0) return []
    const byColumn = new Map(
      fields.map((field) => [field.tableColumnName, field])
    )
    const compiled = compileEidosFileRowQuery(fields, query)
    const aliases = normalized.map((_, index) => `__base_stat_${index}`)
    const select = normalized.map((config, index) => {
      const field = byColumn.get(config.columnName)
      if (!field) {
        throw new EidosFileError(
          "field-not-found",
          `Eidos File field not found: ${config.columnName}`
        )
      }
      return `${compileEidosFileColumnStatExpression(field, config.type)} AS ${quoteIdentifier(aliases[index])}`
    })
    const result = this.connection.get<Record<string, EidosFileSqlPrimitive>>(
      `SELECT ${select.join(", ")}
         FROM ${this.rowSourceSql(tableId, fields, undefined, table)}
         ${compiled.whereSql}`,
      compiled.params
    )
    return normalized.map((config, index) => {
      const value = result?.[aliases[index]] ?? null
      if (value instanceof Uint8Array) {
        throw new EidosFileError(
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
    query: EidosFileRowQuery = {},
    totalHint?: number,
    cursor?: string,
    projection?: EidosFileRowPageProjection
  ): EidosFileRowPage {
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

  insertRow(tableId: string, row: EidosFileRow): EidosFileRow {
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
    const record: EidosFileRow = {
      ...Object.fromEntries(
        Object.entries(row).map(([column, value]) => [
          column,
          writableFieldValue(fieldsByColumn.get(column), value),
        ])
      ),
      _id: row._id ?? createEidosFileUuid(),
    }
    const columns = Object.keys(record)
    for (const column of columns) {
      if (!allowedColumns.has(column)) {
        throw new EidosFileError(
          "field-not-found",
          `Eidos File field cannot be written: ${column}`
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

  insertImportedRow(tableId: string, row: EidosFileRow): EidosFileRow {
    const record = this.insertImportedRows(tableId, [row])[0]
    const table = this.getTable(tableId)
    return this.connection.get<EidosFileRow>(
      `SELECT * FROM ${quoteIdentifier(table.rawTableName)} WHERE _id = ?`,
      [sqliteParameter(record._id)]
    )!
  }

  insertImportedRows(tableId: string, rows: EidosFileRow[]): EidosFileRow[] {
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
    const records: EidosFileRow[] = rows.map((row) => ({
      ...row,
      _id: row._id ?? createEidosFileUuid(),
    }))
    this.connection.transaction(() => {
      const batches = new Map<
        string,
        { columns: string[]; parameterSets: EidosFileSqlParams[] }
      >()
      for (const record of records) {
        const columns = Object.keys(record)
        for (const column of columns) {
          if (!writableColumns.has(column)) {
            throw new EidosFileError(
              "field-not-found",
              `Eidos File field cannot be imported: ${column}`
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

  updateRow(
    tableId: string,
    rowId: string,
    changes: EidosFileRow
  ): EidosFileRow {
    return this.updateRows(tableId, [{ rowId, changes }])[0]
  }

  updateRows(tableId: string, updates: EidosFileRowUpdate[]): EidosFileRow[] {
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
          throw new EidosFileError(
            "field-not-found",
            `Eidos File field not found: ${column}`
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
            throw new EidosFileError("row-not-found", `Row not found: ${rowId}`)
          }
          mutated = true
        }
      }
      if (mutated) this.touchMetadata({})

      return prepared.map(({ rowId }) => {
        const updated = this.getComputedRow(tableId, rowId, fields)
        if (!updated) {
          throw new EidosFileError("row-not-found", `Row not found: ${rowId}`)
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
    ranges: EidosFileRowRange[],
    query: EidosFileRowQuery = {}
  ): number {
    const table = this.getTable(tableId)
    const fields = this.listFields(tableId)
    const compiled = compileEidosFileRowQuery(fields, query)
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

  private normalizeRowRanges(ranges: EidosFileRowRange[]): EidosFileRowRange[] {
    const sorted = ranges
      .map(({ startIndex, endIndex }) => {
        if (
          !Number.isSafeInteger(startIndex) ||
          !Number.isSafeInteger(endIndex) ||
          startIndex < 0 ||
          endIndex <= startIndex
        ) {
          throw new EidosFileError(
            "invalid-range",
            `Invalid Eidos File row range: ${startIndex}..${endIndex}`
          )
        }
        return { startIndex, endIndex }
      })
      .sort((left, right) => left.startIndex - right.startIndex)
    const merged: EidosFileRowRange[] = []
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
