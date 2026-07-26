import {
  assertEidosFileValues,
  canonicalizeEidosFileJson,
  decodeEidosFileMultiSelectValues,
  decodeEidosFileRelationIds,
  parseEidosFileJson,
  planEidosFileCsvImport,
  prepareEidosFileCsvImport,
  type AggregateItem,
  type CreateEidosFileFieldInput,
  type CreateEidosFileTableInput,
  type CreateEidosFileViewInput,
  type ConversionPolicy,
  type EidosFileColumnStatConfig,
  type EidosFileColumnStatResult,
  type EidosFileCsvImportOptions,
  type EidosFileCsvImportPlan,
  type EidosFileCsvImportResult,
  type EidosFileFieldInfo,
  type EidosFileFieldPlacement,
  type EidosFileFilterGroup,
  type EidosFileFilterOperator,
  type EidosFileFormulaPreview,
  type EidosFileFormulaPreviewInput,
  type EidosFileLogicalValue,
  type EidosFileMetadata,
  type EidosFileRow,
  type EidosFileRowGroupCount,
  type EidosFileRowMutationResult,
  type EidosFileRowPage,
  type EidosFileRowPageProjection,
  type EidosFileRowQuery,
  type EidosFileRowRange,
  type EidosFileRowsDeleteResult,
  type EidosFileSnapshot,
  type EidosFileTableInfo,
  type EidosFileTableSnapshot,
  type EidosFileViewInfo,
  type FieldDescriptor,
  type FilterNode,
  type FormulaDefinition,
  type JsonObject,
  type LogicalValue,
  type LookupDefinition,
  type NewField,
  type ProjectedRow,
  type ProjectionSpec,
  type RelationDefinition,
  type RowPage,
  type RowQuery,
  type RuntimeClient,
  type RuntimeSnapshot,
  type SavedViewQuery,
  type SchemaChange,
  type SchemaDescriptor,
  type SchemaLeafChange,
  type TableDescriptor,
  type TypeRef,
  type UpdateEidosFileFieldInput,
  type UpdateEidosFileTableInput,
  type UpdateEidosFileViewInput,
  type ViewDescriptor,
} from "@eidos.space/eidos-file"

import type { EidosFileEditorDataSource } from "./data-source"

const DEFAULT_PAGE_SIZE = 250

function conversionPolicies(from: string, to: string): ConversionPolicy[] {
  const policies: ConversionPolicy[] = []
  if (from === "json" && to !== "json" && to !== "text") {
    policies.push("json-null-to-sql-null")
  }
  if (from === "integer" && (to === "number" || to === "json")) {
    policies.push("round-binary64")
  }
  if ((from === "integer" || from === "number") && to === "checkbox") {
    policies.push("zero-false-nonzero-true")
  }
  if (from === "datetime" && to === "date") policies.push("utc-date")
  if (from === "multi-select" && to === "select") policies.push("first")
  if (
    !["multi-select", "file", "relation"].includes(from) &&
    ["multi-select", "file", "relation"].includes(to)
  ) {
    policies.push("null-to-empty-list")
  }
  return policies
}

function conversionTargetNullable(
  from: string,
  to: string,
  sourceNullable: boolean
): boolean {
  return (
    sourceNullable ||
    (from === "multi-select" && to === "select") ||
    (from === "json" && to !== "json" && to !== "text")
  )
}

/**
 * Presents the established rich editor contract over the normative Runtime
 * 1.0 boundary. It owns presentation-shape conversion only: every read and
 * mutation still crosses RuntimeClient and never receives SQL or file bytes.
 */
export class EidosRuntimeEditorDataSource implements EidosFileEditorDataSource {
  private sequence = 0
  private runtimeSnapshot: RuntimeSnapshot | null = null
  private schema: SchemaDescriptor[] = []
  private tables = new Map<string, TableDescriptor>()
  private fields = new Map<string, FieldDescriptor>()
  private fieldsByTable = new Map<string, FieldDescriptor[]>()
  private views = new Map<string, ViewDescriptor>()
  private cursorCache = new Map<string, Map<number, string | undefined>>()

  constructor(
    readonly runtime: RuntimeClient,
    readonly path: string
  ) {}

  async initialize(): Promise<EidosFileSnapshot> {
    await this.runtime.negotiate(
      { protocol: "eidos-runtime", versions: ["1.0"] },
      this.context("negotiate")
    )
    return this.getSnapshot()
  }

  async getSnapshot(): Promise<EidosFileSnapshot> {
    const snapshot = await this.runtime.getSnapshot(
      {},
      this.context("snapshot")
    )
    const objects: SchemaDescriptor[] = []
    let cursor: string | undefined
    do {
      const page = await this.runtime.getSchemaPage(
        {
          revision: snapshot.revision,
          limit: 1_000,
          ...(cursor ? { cursor } : {}),
        },
        this.context("schema")
      )
      objects.push(...page.objects)
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    this.runtimeSnapshot = snapshot
    this.schema = objects
    this.indexSchema()
    this.cursorCache.clear()
    return this.hydrateRowCounts(this.editorSnapshot(snapshot))
  }

  async getPage(
    tableId: string,
    offset: number,
    limit: number,
    query: EidosFileRowQuery,
    totalHint?: number,
    cursor?: string,
    projection?: EidosFileRowPageProjection
  ): Promise<EidosFileRowPage> {
    this.assertTable(tableId)
    const fields = this.fieldsByTable.get(tableId) ?? []
    const selected = this.projectionFields(fields, projection)
    const runtimeProjection: ProjectionSpec = {
      fields: selected.map((field) => field.id),
      resolveRelations:
        projection?.includeRelationDisplays !== false
          ? selected
              .filter((field) => field.kind === "relation")
              .map((field) => field.id)
          : [],
    }
    const runtimeQuery = this.runtimeQuery(tableId, query)
    const queryKey = canonicalizeEidosFileJson({
      tableId,
      query: runtimeQuery,
      projection: runtimeProjection,
      limit,
    })
    const cursors = this.cursorCache.get(queryKey) ?? new Map([[0, undefined]])
    this.cursorCache.set(queryKey, cursors)
    if (cursor) cursors.set(offset, cursor)
    let start =
      [...cursors.keys()]
        .filter((candidate) => candidate <= offset)
        .sort((left, right) => right - left)[0] ?? 0
    let nextCursor = cursors.get(start)
    while (start < offset) {
      const step = Math.min(1_000, offset - start)
      const skipped = await this.runtime.queryRows(
        {
          tableId,
          query: runtimeQuery,
          projection: runtimeProjection,
          limit: step,
          ...(nextCursor ? { cursor: nextCursor } : {}),
        },
        this.context("seek")
      )
      if (skipped.rows.length === 0 || !skipped.nextCursor) break
      start += skipped.rows.length
      nextCursor = skipped.nextCursor
      cursors.set(start, nextCursor)
    }
    const page = await this.runtime.queryRows(
      {
        tableId,
        query: runtimeQuery,
        projection: runtimeProjection,
        limit,
        ...(nextCursor ? { cursor: nextCursor } : {}),
      },
      this.context("rows")
    )
    if (page.nextCursor) cursors.set(offset + page.rows.length, page.nextCursor)
    const total = totalHint ?? (await this.countRows(tableId, runtimeQuery))
    return {
      tableId,
      offset,
      limit,
      total,
      rows: page.rows.map((row) => this.editorRow(row, page, selected)),
      ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
    }
  }

  async getRow(tableId: string, rowId: string): Promise<EidosFileRow | null> {
    const fields = this.fieldsByTable.get(tableId) ?? []
    const projection = this.projection(fields)
    const batch = await this.runtime.getRowsById(
      { tableId, rowIds: [rowId], projection },
      this.context("row")
    )
    return batch.rows[0] ? this.editorRow(batch.rows[0], batch, fields) : null
  }

  async getGroupCounts(
    tableId: string,
    fieldId: string,
    query: EidosFileRowQuery
  ): Promise<EidosFileRowGroupCount[]> {
    const field = this.assertField(fieldId, tableId)
    const label =
      (this.fieldsByTable.get(tableId) ?? []).find(
        (candidate) => candidate.id === this.tables.get(tableId)?.labelFieldId
      ) ?? field
    const results: EidosFileRowGroupCount[] = []
    let cursor: string | undefined
    do {
      const page = await this.runtime.groupRows(
        {
          tableId,
          query: this.runtimeQuery(tableId, query),
          groupBy: [fieldId],
          aggregates: [],
          projection: { fields: [label.id], resolveRelations: [] },
          groupLimit: 256,
          rowsPerGroup: 1,
          ...(cursor ? { cursor } : {}),
        },
        this.context("groups")
      )
      results.push(
        ...page.groups.map((group) => ({
          value: this.editorSqlValue(group.key[0] ?? null, field.valueType),
          total: Number(group.count),
        }))
      )
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    return results
  }

  async calculateColumnStats(
    tableId: string,
    configs: EidosFileColumnStatConfig[],
    query: EidosFileRowQuery
  ): Promise<EidosFileColumnStatResult[]> {
    const structuredConfigs = configs.filter((config) =>
      this.requiresStructuredColumnStat(config)
    )
    const aggregateConfigs = configs.filter(
      (config) => !this.requiresStructuredColumnStat(config)
    )
    const results: EidosFileColumnStatResult[] = []
    const items: AggregateItem[] = []
    for (const [index, config] of aggregateConfigs.entries()) {
      if (config.type === "count-all")
        items.push({ key: String(index), op: "count-all" })
      else if (config.type === "count-empty") {
        items.push({ key: `${index}:all`, op: "count-all" })
        items.push({
          key: `${index}:present`,
          op: "count",
          fieldId: config.fieldId,
        })
      } else {
        const operations = {
          "count-non-null": "count",
          "count-distinct": "distinct-count",
          sum: "sum",
          average: "average",
          min: "min",
          max: "max",
        } as const
        items.push({
          key: String(index),
          op: operations[config.type as keyof typeof operations],
          fieldId: config.fieldId,
        })
      }
    }
    if (items.length > 0) {
      const response = await this.runtime.aggregate(
        { tableId, query: this.runtimeQuery(tableId, query), items },
        this.context("aggregate")
      )
      const values = new Map(
        response.results.map((result) => [
          result.key,
          "value" in result ? result.value : null,
        ])
      )
      results.push(
        ...aggregateConfigs.map((config, index) => {
          const value =
            config.type === "count-empty"
              ? Number(values.get(`${index}:all`) ?? 0) -
                Number(values.get(`${index}:present`) ?? 0)
              : (values.get(String(index)) ?? null)
          return { ...config, value: this.statValue(value) }
        })
      )
    }
    if (structuredConfigs.length > 0) {
      results.push(
        ...(await this.calculateStructuredColumnStats(
          tableId,
          structuredConfigs,
          query
        ))
      )
    }
    return configs.map(
      (config) =>
        results.find(
          (result) =>
            result.fieldId === config.fieldId && result.type === config.type
        ) ?? { ...config, value: null }
    )
  }

  async previewFormula(
    tableId: string,
    input: EidosFileFormulaPreviewInput
  ): Promise<EidosFileFormulaPreview> {
    const existing = (this.fieldsByTable.get(tableId) ?? []).find(
      (field) => field.id === input.columnName
    )
    const result = await this.runtime.previewFormula(
      {
        tableId,
        ...(existing
          ? { fieldId: existing.id }
          : { candidateName: input.name }),
        sourceText: input.formula,
        declaredResultType: input.displayType,
      },
      this.context("formula-preview")
    )
    if (!result.valid) {
      throw new Error(
        result.diagnostics
          .map((diagnostic) => diagnostic.message)
          .filter(Boolean)
          .join("; ") || "Formula is invalid"
      )
    }
    const dependencies = (result.dependencies ?? []).map((id) => {
      const field = this.fields.get(id)
      return { name: field?.name ?? id, columnName: id }
    })
    const table = this.assertTable(tableId)
    const labelField = this.fields.get(table.labelFieldId)
    const previewRows = result.rows ?? []
    const labels =
      labelField && previewRows.length > 0
        ? await this.runtime.getRowsById(
            {
              tableId,
              rowIds: previewRows.map((row) => row.rowId),
              projection: {
                fields: [labelField.id],
                resolveRelations: [],
              },
            },
            this.context("formula-preview-labels")
          )
        : null
    const titleByRow = new Map(
      (labels?.rows ?? []).map((row) => [
        row.id,
        String(row.values[0] ?? row.id),
      ])
    )
    return {
      expression: input.formula,
      dependencies,
      samples: previewRows.map((row) => ({
        rowId: row.rowId,
        title: titleByRow.get(row.rowId) ?? null,
        value: this.editorValue(row.value ?? null, input.displayType),
      })),
    }
  }

  async insertRow(
    tableId: string,
    fields: Record<string, EidosFileLogicalValue>
  ): Promise<EidosFileRowMutationResult> {
    const clientKey = this.id("row")
    const projection = this.projection(this.fieldsByTable.get(tableId) ?? [])
    const result = await this.runtime.mutateRows(
      {
        tableId,
        expectedRevision: this.revision(),
        returning: projection,
        changes: [
          {
            kind: "create",
            clientKey,
            values: this.runtimeValues(tableId, fields),
          },
        ],
      },
      this.context("insert-row")
    )
    this.acceptRevision(result.revision)
    const rowId = result.created.find(
      (entry) => entry.clientKey === clientKey
    )?.rowId
    const row = result.returnedRows?.rows[0]
    const loaded = rowId ? await this.getRow(tableId, rowId) : null
    return this.rowMutationResult(
      tableId,
      row
        ? this.editorRow(
            row,
            result.returnedRows!,
            this.fieldsByTable.get(tableId) ?? []
          )
        : (loaded ?? { _id: rowId ?? "" }),
      result.revision
    )
  }

  async updateRow(
    tableId: string,
    rowId: string,
    fields: Record<string, EidosFileLogicalValue>
  ): Promise<EidosFileRowMutationResult> {
    const projection = this.projection(this.fieldsByTable.get(tableId) ?? [])
    const result = await this.runtime.mutateRows(
      {
        tableId,
        expectedRevision: this.revision(),
        returning: projection,
        changes: [
          {
            kind: "update",
            rowId,
            values: this.runtimeValues(tableId, fields),
          },
        ],
      },
      this.context("update-row")
    )
    this.acceptRevision(result.revision)
    const projected = result.returnedRows?.rows[0]
    const row = projected
      ? this.editorRow(
          projected,
          result.returnedRows!,
          this.fieldsByTable.get(tableId) ?? []
        )
      : ((await this.getRow(tableId, rowId)) ?? { _id: rowId })
    return this.rowMutationResult(tableId, row, result.revision)
  }

  async deleteRows(
    tableId: string,
    rowIds: string[]
  ): Promise<EidosFileRowsDeleteResult> {
    const ids = [...new Set(rowIds)]
    if (ids.length > 500) {
      throw new Error(
        "deleteRows accepts at most 500 Row IDs per atomic operation"
      )
    }
    if (ids.length > 0) {
      const result = await this.runtime.mutateRows(
        {
          tableId,
          expectedRevision: this.revision(),
          changes: ids.map((rowId) => ({ kind: "delete" as const, rowId })),
        },
        this.context("delete-rows")
      )
      this.acceptRevision(result.revision)
    }
    return {
      tableId,
      deletedCount: ids.length,
      rowCount: await this.countRows(tableId, {}),
      revision: this.editorRevision(),
    }
  }

  async deleteRowRanges(
    tableId: string,
    ranges: EidosFileRowRange[],
    query: EidosFileRowQuery
  ): Promise<EidosFileRowsDeleteResult> {
    const ids: string[] = []
    for (const range of ranges) {
      let offset = range.startIndex
      while (offset < range.endIndex) {
        const page = await this.getPage(
          tableId,
          offset,
          Math.min(500, range.endIndex - offset),
          query,
          undefined,
          undefined,
          { columns: [], preservedColumns: ["_id"], fieldLimit: 0 }
        )
        const next = page.rows.flatMap((row) =>
          row._id === null || row._id === undefined ? [] : [String(row._id)]
        )
        ids.push(...next)
        if (next.length === 0) break
        offset += next.length
      }
    }
    return this.deleteRows(tableId, [...new Set(ids)])
  }

  async addField(
    tableId: string,
    field: CreateEidosFileFieldInput,
    placement?: EidosFileFieldPlacement
  ): Promise<EidosFileSnapshot> {
    const clientKey = this.id("field")
    const current = this.fieldsByTable.get(tableId) ?? []
    const result = await this.commitSchema({
      kind: "create-field",
      tableId,
      field: this.newField(
        field,
        clientKey,
        String(this.nextPosition(current))
      ),
    })
    const createdId = result.createdObjects.find(
      (entry) =>
        entry.object === "field" &&
        "clientKey" in entry &&
        entry.clientKey === clientKey
    )?.id
    let snapshot = await this.getSnapshot()
    if (placement && createdId) {
      const view = this.views.get(placement.viewId)
      if (view) {
        const order = this.completeVisibleFieldOrder(view, tableId).filter(
          (fieldId) => fieldId !== createdId
        )
        order.splice(
          Math.max(0, Math.min(placement.index, order.length)),
          0,
          createdId
        )
        snapshot = await this.updateView(view.id, {
          orderMap: Object.fromEntries(
            order.map((fieldId, index) => [fieldId, index])
          ),
        })
      }
    }
    return snapshot
  }

  async updateField(
    tableId: string,
    fieldId: string,
    changes: UpdateEidosFileFieldInput
  ): Promise<EidosFileSnapshot> {
    const field = this.assertField(fieldId, tableId)
    const leaves: SchemaLeafChange[] = []
    if (changes.name !== undefined && changes.name !== field.name) {
      leaves.push({ kind: "rename-field", fieldId, name: changes.name })
    }
    if (
      changes.type !== undefined &&
      changes.type !== this.editorFieldType(field)
    ) {
      const target = changes.type === "rating" ? "integer" : changes.type
      if (["formula", "lookup"].includes(target)) {
        throw new Error(
          "Convert a stored Field before defining a derived Field"
        )
      }
      if (target === "relation") {
        const definition = this.relationDefinition(changes.property ?? {})
        leaves.push({
          kind: "convert-field",
          fieldId,
          to: "relation",
          definition:
            definition.direction === "forward"
              ? definition
              : {
                  direction: "forward",
                  targetTableId: definition.targetTableId,
                  cardinality: "many",
                  onDelete: "restrict",
                },
          policies: conversionPolicies(field.kind, target),
        })
      } else if (
        [
          "text",
          "number",
          "integer",
          "checkbox",
          "date",
          "datetime",
          "url",
          "json",
          "select",
          "multi-select",
          "file",
        ].includes(target)
      ) {
        leaves.push({
          kind: "convert-field",
          fieldId,
          to: target as
            | "text"
            | "number"
            | "integer"
            | "checkbox"
            | "date"
            | "datetime"
            | "url"
            | "json"
            | "select"
            | "multi-select"
            | "file",
          toNullable: conversionTargetNullable(
            field.kind,
            target,
            field.nullable
          ),
          policies: conversionPolicies(field.kind, target),
        })
      } else {
        throw new Error(`Field type cannot be converted: ${target}`)
      }
    }
    if (changes.property !== undefined) {
      const property = changes.property ?? {}
      const kind =
        changes.type === "rating" ? "integer" : (changes.type ?? field.kind)
      const settings = {
        ...property,
        ...(changes.type === "rating"
          ? {
              display: {
                ...(typeof property.display === "object" &&
                property.display !== null &&
                !Array.isArray(property.display)
                  ? property.display
                  : {}),
                kind: "rating",
              },
            }
          : {}),
      } as JsonObject
      leaves.push({ kind: "set-field-settings", fieldId, settings })
      if (kind === "formula") {
        leaves.push({
          kind: "set-formula",
          fieldId,
          definition: this.formulaDefinition(property),
        })
      } else if (kind === "lookup") {
        leaves.push({
          kind: "set-lookup",
          fieldId,
          definition: this.lookupDefinition(property),
        })
      } else if (kind === "relation") {
        leaves.push({
          kind: "set-relation",
          fieldId,
          definition: this.relationDefinition(property),
        })
      }
    }
    for (const rename of changes.optionValueChanges ?? []) {
      leaves.push({
        kind: "rename-option",
        fieldId,
        from: rename.from,
        to: rename.to,
        collision: "merge",
      })
    }
    if (leaves.length > 0) {
      await this.commitSchema(
        leaves.length === 1 ? leaves[0]! : { kind: "batch", changes: leaves }
      )
    }
    return this.getSnapshot()
  }

  async deleteField(
    tableId: string,
    fieldId: string
  ): Promise<EidosFileSnapshot> {
    const field = this.assertField(fieldId, tableId)
    const replacement =
      field.id === this.tables.get(tableId)?.labelFieldId
        ? (this.fieldsByTable.get(tableId) ?? []).find(
            (candidate) =>
              candidate.id !== fieldId &&
              candidate.writable &&
              candidate.kind === "text"
          )?.id
        : undefined
    await this.commitSchema(
      {
        kind: "delete-field",
        fieldId,
        ...(replacement ? { replacementLabelFieldId: replacement } : {}),
      },
      true
    )
    return this.getSnapshot()
  }

  async createTable(
    input: CreateEidosFileTableInput
  ): Promise<EidosFileSnapshot> {
    const tableKey = this.id("table")
    const supplied = input.fields?.length
      ? input.fields
      : [
          {
            name: "Name",
            type: "text",
            isRecordLabel: true,
          } as CreateEidosFileFieldInput,
        ]
    const fieldKeys = supplied.map(() => this.id("field"))
    const labelIndex = supplied.findIndex(
      (field) => "isRecordLabel" in field && field.isRecordLabel === true
    )
    const result = await this.commitSchema({
      kind: "create-table",
      clientKey: tableKey,
      name: input.name,
      position: String(this.nextPosition([...this.tables.values()])),
      settings: {
        ...(input.icon ? { icon: input.icon } : {}),
        ...(input.description ? { description: input.description } : {}),
      },
      fields: supplied.map((field, index) =>
        this.newField(field, fieldKeys[index]!, String(index + 1))
      ),
      labelFieldClientKey: fieldKeys[labelIndex < 0 ? 0 : labelIndex],
    })
    const tableId = result.createdObjects.find(
      (entry) => entry.object === "table" && entry.clientKey === tableKey
    )?.id
    const snapshot = await this.getSnapshot()
    if (tableId && input.createDefaultView !== false) {
      return this.createView(tableId, { name: "Grid", type: "grid" })
    }
    return snapshot
  }

  async updateTable(
    tableId: string,
    changes: UpdateEidosFileTableInput
  ): Promise<EidosFileSnapshot> {
    const table = this.assertTable(tableId)
    const leaves: SchemaLeafChange[] = []
    if (changes.name !== undefined)
      leaves.push({ kind: "rename-table", tableId, name: changes.name })
    if (changes.icon !== undefined || changes.description !== undefined) {
      leaves.push({
        kind: "set-table-settings",
        tableId,
        settings: {
          ...table.settings,
          ...(changes.icon !== undefined ? { icon: changes.icon } : {}),
          ...(changes.description !== undefined
            ? { description: changes.description }
            : {}),
        },
      })
    }
    if (leaves.length > 0) {
      await this.commitSchema(
        leaves.length === 1 ? leaves[0]! : { kind: "batch", changes: leaves }
      )
    }
    return this.getSnapshot()
  }

  async deleteTable(tableId: string): Promise<EidosFileSnapshot> {
    await this.commitSchema({ kind: "delete-table", tableId }, true)
    return this.getSnapshot()
  }

  async reorderTables(tableIds: string[]): Promise<EidosFileSnapshot> {
    const currentIds = [...this.tables.values()].map((table) => table.id)
    if (
      currentIds.length !== tableIds.length ||
      currentIds.some((tableId) => !tableIds.includes(tableId)) ||
      new Set(tableIds).size !== tableIds.length
    ) {
      throw new Error("Table reorder must contain every Table exactly once")
    }
    await this.commitSchema({
      kind: "batch",
      changes: tableIds.map((tableId, index) => ({
        kind: "set-table-position" as const,
        tableId,
        position: String(index + 1),
      })),
    })
    return this.getSnapshot()
  }

  async createView(
    tableId: string,
    input: CreateEidosFileViewInput
  ): Promise<EidosFileSnapshot> {
    const clientKey = this.id("view")
    const current = [...this.views.values()].filter(
      (view) => view.tableId === tableId
    )
    const result = await this.runtime.mutateView(
      {
        expectedRevision: this.revision(),
        changes: [
          {
            kind: "create-view",
            clientKey,
            tableId,
            name: input.name,
            type: input.type,
            query: this.savedViewQuery(input.filter ?? null, input.sorts ?? []),
            layout: this.viewLayout(
              input.properties,
              input.orderMap,
              input.hiddenFields
            ),
            position: String(input.position ?? this.nextPosition(current)),
          },
        ],
      },
      this.context("create-view")
    )
    this.acceptRevision(result.revision)
    return this.getSnapshot()
  }

  async duplicateView(
    viewId: string,
    name?: string
  ): Promise<EidosFileSnapshot> {
    const view = this.assertView(viewId)
    return this.createView(view.tableId, {
      name: name ?? `${view.name} copy`,
      type: view.type,
      properties: view.layout,
      filter: this.editorFilter(view.query.filter),
      sorts: (view.query.sort ?? []).map((sort) => ({
        field: sort.fieldId,
        direction: sort.direction,
        nulls: sort.nulls,
      })),
    })
  }

  async deleteView(viewId: string): Promise<EidosFileSnapshot> {
    const result = await this.runtime.mutateView(
      {
        expectedRevision: this.revision(),
        changes: [{ kind: "delete-view", viewId }],
      },
      this.context("delete-view")
    )
    this.acceptRevision(result.revision)
    return this.getSnapshot()
  }

  async reorderViews(
    tableId: string,
    viewIds: string[]
  ): Promise<EidosFileSnapshot> {
    const result = await this.runtime.mutateView(
      {
        expectedRevision: this.revision(),
        changes: viewIds.map((viewId, index) => ({
          kind: "update-view" as const,
          viewId,
          patch: { position: String(index + 1) },
        })),
      },
      this.context("reorder-views")
    )
    this.acceptRevision(result.revision)
    return this.getSnapshot()
  }

  async updateView(
    viewId: string,
    changes: UpdateEidosFileViewInput
  ): Promise<EidosFileSnapshot> {
    const view = this.assertView(viewId)
    const queryChanged =
      changes.filter !== undefined || changes.sorts !== undefined
    const layoutChanged =
      changes.properties !== undefined ||
      changes.orderMap !== undefined ||
      changes.hiddenFields !== undefined
    const result = await this.runtime.mutateView(
      {
        expectedRevision: this.revision(),
        changes: [
          {
            kind: "update-view",
            viewId,
            patch: {
              ...(changes.name !== undefined ? { name: changes.name } : {}),
              ...(changes.type !== undefined ? { type: changes.type } : {}),
              ...(changes.position !== undefined
                ? { position: String(changes.position ?? 0) }
                : {}),
              ...(queryChanged
                ? {
                    query: this.savedViewQuery(
                      changes.filter === undefined
                        ? this.editorFilter(view.query.filter)
                        : changes.filter,
                      changes.sorts === undefined
                        ? (view.query.sort ?? []).map((sort) => ({
                            field: sort.fieldId,
                            direction: sort.direction,
                            nulls: sort.nulls,
                          }))
                        : changes.sorts
                    ),
                  }
                : {}),
              ...(layoutChanged
                ? {
                    layout: this.viewLayout(
                      changes.properties === undefined
                        ? view.layout
                        : changes.properties,
                      changes.orderMap === undefined
                        ? this.editorOrderMap(view.layout)
                        : changes.orderMap,
                      changes.hiddenFields === undefined
                        ? this.editorHiddenFields(view.layout)
                        : changes.hiddenFields
                    ),
                  }
                : {}),
            },
          },
        ],
      },
      this.context("update-view")
    )
    this.acceptRevision(result.revision)
    return this.getSnapshot()
  }

  previewCsv(
    fileName: string,
    bytes: ArrayBuffer,
    options: EidosFileCsvImportOptions = {}
  ): Promise<EidosFileCsvImportPlan> {
    return Promise.resolve(
      planEidosFileCsvImport(
        {
          name: fileName,
          content: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        },
        options
      )
    )
  }

  async importCsv(
    fileName: string,
    bytes: ArrayBuffer,
    options: EidosFileCsvImportOptions = {}
  ): Promise<{
    snapshot: EidosFileSnapshot
    result: EidosFileCsvImportResult
  }> {
    const prepared = prepareEidosFileCsvImport(
      {
        name: fileName,
        content: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      },
      options
    )
    const before = new Set(this.tables.keys())
    let snapshot = await this.createTable({
      name: prepared.plan.tableName,
      fields: prepared.plan.columns.map((column) => ({
        name: column.name,
        type: column.type === "record-label" ? "text" : column.type,
        isRecordLabel: column.type === "record-label",
      })),
    })
    const table = snapshot.tables.find(
      (candidate) => !before.has(candidate.table.id)
    )
    if (!table) throw new Error("CSV destination table was not created")
    const fieldByName = new Map(
      table.fields.map((field) => [field.name, field])
    )
    for (let offset = 0; offset < prepared.rows.length; offset += 500) {
      const rows = prepared.rows.slice(offset, offset + 500)
      const result = await this.runtime.mutateRows(
        {
          tableId: table.table.id,
          expectedRevision: this.revision(),
          changes: rows.map((row, index) => ({
            kind: "create" as const,
            clientKey: `${offset + index + 1}`,
            values: Object.fromEntries(
              prepared.plan.columns.flatMap((column) => {
                const field = fieldByName.get(column.name)
                const value = row[column.columnName]
                return field && value !== undefined
                  ? [
                      [
                        field.id,
                        this.runtimeValue(this.fields.get(field.id)!, value),
                      ] as const,
                    ]
                  : []
              })
            ),
          })),
        },
        this.context("csv-import")
      )
      this.acceptRevision(result.revision)
    }
    snapshot = await this.getSnapshot()
    return {
      snapshot,
      result: {
        table: snapshot.tables.find(
          (candidate) => candidate.table.id === table.table.id
        )!.table,
        importedRowCount: prepared.plan.rowCount,
        skippedRowCount: prepared.plan.skippedRowCount,
      },
    }
  }

  private async commitSchema(change: SchemaChange, confirmLossy = false) {
    const expectedRevision = this.revision()
    const plan = await this.runtime.preflightSchema(
      { change, expectedRevision },
      this.context("schema-preflight")
    )
    if (plan.classification === "forbidden") {
      throw new Error(
        plan.warnings
          .map((warning) => warning.message)
          .filter(Boolean)
          .join("; ") || "Schema change is forbidden"
      )
    }
    if (plan.classification === "explicit-lossy" && !confirmLossy) {
      throw new Error(
        plan.warnings
          .map((warning) => warning.message)
          .filter(Boolean)
          .join("; ") ||
          "Schema change would discard data and requires explicit confirmation"
      )
    }
    const result = await this.runtime.mutateSchema(
      {
        planToken: plan.planToken,
        expectedRevision,
        actionsHash: plan.actionsHash,
        ...(plan.classification === "explicit-lossy" && confirmLossy
          ? { confirmLossy: true as const }
          : {}),
      },
      this.context("schema-mutate")
    )
    this.acceptRevision(result.revision)
    return result
  }

  private editorSnapshot(snapshot: RuntimeSnapshot): EidosFileSnapshot {
    const tableDescriptors = [...this.tables.values()].sort(this.positionSort)
    const metadata: EidosFileMetadata = {
      format: "eidos-file",
      fileId: snapshot.fileId,
      formatVersion: "1.0",
      schemaVersion: 1,
      revision: BigInt(snapshot.revision),
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z",
      title: snapshot.title,
      ...(snapshot.defaultTableId
        ? { defaultTableId: snapshot.defaultTableId }
        : {}),
    }
    return {
      path: this.path,
      metadata,
      tables: tableDescriptors.map((table) => {
        const fields = (this.fieldsByTable.get(table.id) ?? []).map((field) =>
          this.editorField(field, table)
        )
        const views = [...this.views.values()]
          .filter((view) => view.tableId === table.id)
          .sort(this.positionSort)
          .map((view) => this.editorView(view))
        return {
          table: this.editorTable(table),
          fields,
          views,
          rowCount: 0,
        }
      }),
    }
  }

  async hydrateRowCounts(
    snapshot: EidosFileSnapshot
  ): Promise<EidosFileSnapshot> {
    const counts = await Promise.all(
      snapshot.tables.map((table) => this.countRows(table.table.id, {}))
    )
    return {
      ...snapshot,
      tables: snapshot.tables.map((table, index) => ({
        ...table,
        rowCount: counts[index]!,
      })),
    }
  }

  private editorTable(table: TableDescriptor): EidosFileTableInfo {
    return {
      id: table.id,
      name: table.name,
      rawTableName: table.id,
      position: Number(table.position),
      icon:
        typeof table.settings.icon === "string" ? table.settings.icon : null,
      description:
        typeof table.settings.description === "string"
          ? table.settings.description
          : null,
      createdAt: "",
      updatedAt: "",
    }
  }

  private editorField(
    field: FieldDescriptor,
    table: TableDescriptor
  ): EidosFileFieldInfo {
    const property = this.editorFieldProperty(field)
    const derived = field.kind === "formula" || field.kind === "lookup"
    return {
      id: field.id,
      tableId: field.tableId,
      name: field.name,
      type: this.editorFieldType(field),
      tableName: table.name,
      tableColumnName: field.id,
      physicalName: null,
      systemRole: field.systemRole,
      nullable: field.nullable,
      isRecordLabel: table.labelFieldId === field.id,
      position: Number(field.position),
      settings: field.settings,
      property,
      storageCodec:
        field.kind === "relation"
          ? "relation"
          : typeof field.valueType === "object"
            ? "json_array"
            : "scalar",
      valueKind: field.systemRole
        ? "system"
        : derived
          ? "derived"
          : field.kind === "relation"
            ? "relation"
            : "source",
      isHidden: field.settings.hidden === true,
      isDerived: derived,
      sourceTableColumnName: derived ? null : field.id,
      dependsOn: field.definition ?? null,
    }
  }

  private editorView(view: ViewDescriptor): EidosFileViewInfo {
    return {
      id: view.id,
      name: view.name,
      type: view.type,
      tableId: view.tableId,
      query: canonicalizeEidosFileJson(view.query),
      properties: { ...view.layout },
      filter: this.editorFilter(view.query.filter),
      sorts: (view.query.sort ?? []).map((sort) => ({
        field: sort.fieldId,
        direction: sort.direction,
        nulls: sort.nulls,
      })),
      orderMap: this.editorOrderMap(view.layout),
      hiddenFields: this.editorHiddenFields(view.layout),
      position: Number(view.position),
      createdAt: "",
      updatedAt: "",
    }
  }

  private editorFieldProperty(field: FieldDescriptor): Record<string, unknown> {
    if (field.kind === "formula") {
      const definition = field.definition as FormulaDefinition
      return {
        ...field.settings,
        formula: definition.sourceText,
        displayType: definition.resultType,
      }
    }
    if (field.kind === "lookup") {
      const definition = field.definition as LookupDefinition
      return {
        ...field.settings,
        relationField: definition.relationFieldId,
        targetField: definition.targetFieldId,
        aggregate: definition.aggregate,
        distinct: definition.distinctValues,
        displayType: this.displayType(field.valueType),
      }
    }
    if (field.kind === "relation") {
      const definition = field.definition as RelationDefinition
      return definition.direction === "forward"
        ? {
            ...field.settings,
            direction: "forward",
            targetTableId: definition.targetTableId,
            cardinality: definition.cardinality,
            multiple: definition.cardinality === "many",
            onDelete: definition.onDelete,
          }
        : {
            ...field.settings,
            direction: "inverse",
            targetTableId: definition.targetTableId,
            sourceFieldId: definition.inverseOfFieldId,
            cardinality: "many",
            multiple: true,
          }
    }
    return { ...field.settings }
  }

  private editorFieldType(field: FieldDescriptor): EidosFileFieldInfo["type"] {
    if (field.systemRole === "row-id") return "row-id"
    if (field.systemRole === "created-time") return "created-time"
    if (field.systemRole === "updated-time") return "last-edited-time"
    const display =
      typeof field.settings.display === "object" &&
      field.settings.display !== null &&
      !Array.isArray(field.settings.display)
        ? field.settings.display
        : null
    if (
      field.kind === "integer" &&
      (field.settings.control === "rating" || display?.kind === "rating")
    )
      return "rating"
    return field.kind
  }

  private editorRow(
    row: ProjectedRow,
    page: Pick<RowPage, "columns">,
    fields: FieldDescriptor[]
  ) {
    const result: EidosFileRow = { _id: row.id }
    row.values.forEach((value, index) => {
      const column = page.columns[index]
      const field = fields.find((candidate) => candidate.id === column?.fieldId)
      if (!column || !field) return
      result[column.fieldId] = this.editorValue(value, column.valueType)
    })
    for (const relation of row.resolvedRelations ?? []) {
      const fieldId = page.columns[relation.column]?.fieldId
      if (!fieldId) continue
      result[`${fieldId}__display`] = JSON.stringify(
        relation.items.flatMap((item) =>
          item.state === "resolved"
            ? [{ id: item.id, title: String(item.label ?? "") }]
            : []
        )
      )
    }
    return result
  }

  private editorValue(
    value: LogicalValue,
    type: TypeRef
  ): EidosFileRow[string] {
    if (Array.isArray(value) || (value && typeof value === "object")) {
      return canonicalizeEidosFileJson(value)
    }
    if (type === "checkbox" && typeof value === "boolean") return value
    return value
  }

  private editorSqlValue(value: LogicalValue, type: TypeRef) {
    const converted = this.editorValue(value, type)
    return typeof converted === "boolean" ? (converted ? 1 : 0) : converted
  }

  private runtimeValues(
    tableId: string,
    values: Record<string, EidosFileLogicalValue>
  ): Record<string, LogicalValue> {
    return Object.fromEntries(
      Object.entries(values).map(([fieldId, value]) => [
        fieldId,
        this.runtimeValue(this.assertField(fieldId, tableId), value),
      ])
    )
  }

  private runtimeValue(field: FieldDescriptor, value: unknown): LogicalValue {
    if (value === null || value === undefined || value === "") {
      if (
        field.valueType === "multi-select" ||
        field.valueType === "relation" ||
        field.valueType === "file"
      ) {
        return []
      }
      return value === "" &&
        ["text", "url", "select"].includes(String(field.valueType))
        ? ""
        : null
    }
    if (typeof field.valueType === "object") {
      if (Array.isArray(value)) return value as LogicalValue[]
      if (typeof value === "string") return JSON.parse(value) as LogicalValue
    }
    if (field.valueType === "relation") {
      if (Array.isArray(value)) return value as LogicalValue[]
      if (typeof value === "string") return decodeEidosFileRelationIds(value)
    }
    if (field.valueType === "multi-select") {
      if (Array.isArray(value)) {
        return value.filter(
          (entry): entry is string => typeof entry === "string"
        )
      }
      if (typeof value === "string") {
        return decodeEidosFileMultiSelectValues(value)
      }
    }
    if (field.valueType === "file") {
      const parsed =
        typeof value === "string" ? parseEidosFileJson(value) : value
      return assertEidosFileValues(parsed) as LogicalValue[]
    }
    if (field.valueType === "integer") return String(value)
    if (field.valueType === "number") {
      const number = typeof value === "number" ? value : Number(value)
      if (!Number.isFinite(number)) {
        throw new Error(`${field.name} requires a finite Number`)
      }
      return number
    }
    if (field.valueType === "checkbox")
      return value === true || value === 1 || value === "1"
    if (field.valueType === "json" && typeof value !== "string") {
      return canonicalizeEidosFileJson(value)
    }
    return value as LogicalValue
  }

  private projection(fields: FieldDescriptor[]): ProjectionSpec {
    return {
      fields: fields.map((field) => field.id),
      resolveRelations: fields
        .filter((field) => field.kind === "relation")
        .map((field) => field.id),
    }
  }

  private projectionFields(
    fields: FieldDescriptor[],
    projection?: EidosFileRowPageProjection
  ): FieldDescriptor[] {
    if (!projection) return fields
    const labelField =
      projection.includeRecordLabel !== false
        ? fields.find(
            (field) => field.id === this.tables.get(field.tableId)?.labelFieldId
          )
        : undefined
    const requested = [
      ...(projection.preservedColumns ?? []),
      ...(labelField ? [labelField.id] : []),
      ...projection.columns,
    ].filter((id) => id !== "_id")
    const unique = [...new Set(requested)]
    const selected = unique.flatMap((id) => {
      const field = fields.find((candidate) => candidate.id === id)
      return field ? [field] : []
    })
    return projection.fieldLimit === undefined
      ? selected
      : selected.slice(
          0,
          Math.max(
            0,
            projection.fieldLimit +
              (projection.preservedColumns?.length ?? 0) +
              (labelField ? 1 : 0)
          )
        )
  }

  private runtimeQuery(tableId: string, query: EidosFileRowQuery): RowQuery {
    const fields = this.fieldsByTable.get(tableId) ?? []
    const searchable = fields
      .filter(
        (field) =>
          typeof field.valueType === "string" &&
          ["text", "url", "select", "row-id"].includes(field.valueType)
      )
      .map((field) => field.id)
    return {
      ...(query.search
        ? {
            search: {
              text: query.search,
              fields:
                query.searchFields?.filter((id) => searchable.includes(id)) ??
                searchable,
            },
          }
        : {}),
      ...(query.filter ? { filter: this.runtimeFilter(query.filter) } : {}),
      ...(query.sorts?.length
        ? {
            sort: query.sorts.map((sort) => ({
              fieldId: sort.field,
              direction: sort.direction,
              ...(sort.nulls ? { nulls: sort.nulls } : {}),
            })),
          }
        : {}),
    }
  }

  private runtimeFilter(group: EidosFileFilterGroup): FilterNode {
    const node: FilterNode = {
      op: group.conjunction,
      args: group.children.map((child) =>
        child.type === "group"
          ? this.runtimeFilter(child)
          : this.runtimeFilterRule(child.field, child.operator, child.value)
      ),
    }
    return group.negated ? { op: "not", arg: node } : node
  }

  private runtimeFilterRule(
    fieldId: string,
    operator: EidosFileFilterOperator,
    raw: unknown
  ): FilterNode {
    const field = this.fields.get(fieldId)
    const list =
      typeof field?.valueType === "object" ||
      field?.valueType === "multi-select" ||
      field?.valueType === "relation" ||
      field?.valueType === "file"
    const elementField = field
      ? {
          ...field,
          valueType:
            typeof field.valueType === "object"
              ? field.valueType.element
              : field.valueType === "multi-select"
                ? ("select" as const)
                : field.valueType === "relation"
                  ? ("row-id" as const)
                  : field.valueType === "file"
                    ? ("file-entry" as const)
                    : field.valueType,
        }
      : undefined
    const values = (Array.isArray(raw) ? raw : [raw ?? null]).map((value) =>
      elementField
        ? this.runtimeValue(elementField, value)
        : (value as LogicalValue)
    )
    const scalar = values[0] ?? null
    switch (operator) {
      case "is-empty":
        return { op: "is-null", fieldId }
      case "is-not-empty":
        return { op: "is-not-null", fieldId }
      case "equals":
        return { op: "eq", fieldId, value: scalar }
      case "not-equals":
        return { op: "ne", fieldId, value: scalar }
      case "contains":
        return { op: "contains", fieldId, value: String(scalar ?? "") }
      case "not-contains":
        return {
          op: "not",
          arg: { op: "contains", fieldId, value: String(scalar ?? "") },
        }
      case "starts-with":
        return { op: "starts-with", fieldId, value: String(scalar ?? "") }
      case "ends-with":
        return { op: "ends-with", fieldId, value: String(scalar ?? "") }
      case "greater-than":
        return { op: "gt", fieldId, value: scalar }
      case "greater-than-or-equal":
        return { op: "gte", fieldId, value: scalar }
      case "less-than":
        return { op: "lt", fieldId, value: scalar }
      case "less-than-or-equal":
        return { op: "lte", fieldId, value: scalar }
      case "is-all-of":
        return { op: "has-all", fieldId, values }
      case "is-any-of":
        return list
          ? { op: "has-any", fieldId, values }
          : { op: "in", fieldId, values }
      case "is-none-of": {
        const arg: FilterNode = list
          ? { op: "has-any", fieldId, values }
          : { op: "in", fieldId, values }
        return { op: "not", arg }
      }
    }
  }

  private editorFilter(node?: FilterNode): EidosFileFilterGroup | null {
    if (!node) return null
    if (node.op === "not") {
      const group = this.editorFilter(node.arg) ?? {
        type: "group",
        conjunction: "and",
        children: [],
      }
      return { ...group, negated: !group.negated }
    }
    if (node.op === "and" || node.op === "or") {
      return {
        type: "group",
        conjunction: node.op,
        children: node.args.flatMap((child) => {
          const group = this.editorFilter(child)
          return group ? [group] : []
        }),
      }
    }
    const operators: Partial<
      Record<FilterNode["op"], EidosFileFilterOperator>
    > = {
      "is-null": "is-empty",
      "is-not-null": "is-not-empty",
      eq: "equals",
      ne: "not-equals",
      gt: "greater-than",
      gte: "greater-than-or-equal",
      lt: "less-than",
      lte: "less-than-or-equal",
      contains: "contains",
      "starts-with": "starts-with",
      "ends-with": "ends-with",
      in: "is-any-of",
      "has-any": "is-any-of",
      "has-all": "is-all-of",
      "relation-has": "is-any-of",
    }
    const operator = operators[node.op]
    if (!operator || !("fieldId" in node)) return null
    const value =
      "values" in node
        ? node.values
        : "value" in node
          ? node.value
          : "rowId" in node
            ? [node.rowId]
            : undefined
    return {
      type: "group",
      conjunction: "and",
      children: [
        {
          type: "rule",
          field: node.fieldId,
          operator,
          ...(value === undefined ? {} : { value: value as never }),
        },
      ],
    }
  }

  private savedViewQuery(
    filter: EidosFileFilterGroup | null,
    sorts: NonNullable<CreateEidosFileViewInput["sorts"]>
  ): SavedViewQuery {
    return {
      ...(filter ? { filter: this.runtimeFilter(filter) } : {}),
      ...(sorts.length
        ? {
            sort: sorts.map((sort) => ({
              fieldId: sort.field,
              direction: sort.direction,
              ...(sort.nulls ? { nulls: sort.nulls } : {}),
            })),
          }
        : {}),
    }
  }

  private viewLayout(
    properties: Record<string, unknown> | null | undefined,
    orderMap: Record<string, number> | null | undefined,
    hiddenFields: string[] | undefined
  ): JsonObject {
    const entries = orderMap
      ? Object.entries(orderMap)
          .sort((left, right) => left[1] - right[1])
          .map(([id]) => id)
      : undefined
    return {
      ...(properties ?? {}),
      ...(entries ? { fieldOrder: entries } : {}),
      ...(hiddenFields ? { hiddenFields } : {}),
    } as JsonObject
  }

  private editorOrderMap(layout: JsonObject): Record<string, number> | null {
    const order = this.layoutFieldOrder({ layout } as ViewDescriptor)
    return order.length
      ? Object.fromEntries(order.map((id, index) => [id, index]))
      : null
  }

  private layoutFieldOrder(view: Pick<ViewDescriptor, "layout">): string[] {
    return Array.isArray(view.layout.fieldOrder)
      ? view.layout.fieldOrder.filter(
          (value): value is string => typeof value === "string"
        )
      : []
  }

  private completeVisibleFieldOrder(
    view: Pick<ViewDescriptor, "layout">,
    tableId: string
  ): string[] {
    const hidden = new Set(this.editorHiddenFields(view.layout))
    const visible = (this.fieldsByTable.get(tableId) ?? []).filter(
      (field) =>
        field.systemRole === null &&
        field.settings.hidden !== true &&
        !hidden.has(field.id)
    )
    const visibleIds = new Set(visible.map((field) => field.id))
    const stored = this.layoutFieldOrder(view).filter((fieldId) =>
      visibleIds.has(fieldId)
    )
    const storedIds = new Set(stored)
    return [
      ...stored,
      ...visible
        .map((field) => field.id)
        .filter((fieldId) => !storedIds.has(fieldId)),
    ]
  }

  private editorHiddenFields(layout: JsonObject): string[] {
    return Array.isArray(layout.hiddenFields)
      ? layout.hiddenFields.filter(
          (value): value is string => typeof value === "string"
        )
      : []
  }

  private newField(
    field: CreateEidosFileFieldInput,
    clientKey: string,
    position: string
  ): NewField {
    const kind = field.type === "rating" ? "integer" : field.type
    const settings = {
      ...(field.property ?? {}),
      ...(field.type === "rating"
        ? {
            display: {
              ...(typeof field.property?.display === "object" &&
              field.property.display !== null &&
              !Array.isArray(field.property.display)
                ? field.property.display
                : {}),
              kind: "rating",
            },
          }
        : {}),
    } as JsonObject
    return {
      clientKey,
      name: field.name,
      kind,
      position,
      ...(!("nullable" in field) || field.nullable === undefined
        ? {}
        : { nullable: field.nullable }),
      settings,
      ...(kind === "formula"
        ? { definition: this.formulaDefinition(field.property) }
        : {}),
      ...(kind === "lookup"
        ? { definition: this.lookupDefinition(field.property) }
        : {}),
      ...(kind === "relation"
        ? { definition: this.relationDefinition(field.property) }
        : {}),
    } as NewField
  }

  private formulaDefinition(
    property: Record<string, unknown> | null | undefined
  ): FormulaDefinition {
    return {
      sourceText: String(property?.formula ?? ""),
      resultType: String(
        property?.displayType ?? "text"
      ) as FormulaDefinition["resultType"],
    }
  }

  private lookupDefinition(
    property: Record<string, unknown> | null | undefined
  ): LookupDefinition {
    return {
      relationFieldId: String(property?.relationField ?? ""),
      targetFieldId: String(property?.targetField ?? ""),
      aggregate: String(
        property?.aggregate ?? "values"
      ) as LookupDefinition["aggregate"],
      distinctValues: property?.distinct === true,
    }
  }

  private relationDefinition(
    property: Record<string, unknown> | null | undefined
  ): RelationDefinition {
    if (property?.direction === "inverse") {
      return {
        direction: "inverse",
        targetTableId: String(property.targetTableId ?? ""),
        cardinality: "many",
        inverseOfFieldId: String(property.sourceFieldId ?? ""),
      }
    }
    return {
      direction: "forward",
      targetTableId: String(property?.targetTableId ?? ""),
      cardinality:
        property?.cardinality === "one" || property?.multiple === false
          ? "one"
          : "many",
      onDelete: ["restrict", "detach", "preserve"].includes(
        String(property?.onDelete)
      )
        ? (property?.onDelete as "restrict" | "detach" | "preserve")
        : "restrict",
    }
  }

  private displayType(type: TypeRef): string {
    return typeof type === "object" ? type.element : type
  }

  private async countRows(tableId: string, query: RowQuery): Promise<number> {
    const result = await this.runtime.aggregate(
      { tableId, query, items: [{ key: "count", op: "count-all" }] },
      this.context("count")
    )
    const count = result.results[0]
    return Number(count && "value" in count ? count.value : 0)
  }

  private requiresStructuredColumnStat(
    config: EidosFileColumnStatConfig
  ): boolean {
    if (config.type.startsWith("relation-")) return true
    if (
      config.type === "percent-checked" ||
      config.type === "percent-unchecked"
    ) {
      return true
    }
    if (config.type !== "count-empty") return false
    const valueType = this.fields.get(config.fieldId)?.valueType
    return (
      typeof valueType === "object" ||
      valueType === "file" ||
      valueType === "multi-select" ||
      valueType === "relation"
    )
  }

  private async calculateStructuredColumnStats(
    tableId: string,
    configs: EidosFileColumnStatConfig[],
    query: EidosFileRowQuery
  ): Promise<EidosFileColumnStatResult[]> {
    const values = new Map(
      configs.map((config) => [config.fieldId, [] as unknown[]])
    )
    let cursor: string | undefined
    do {
      const selected = [...values.keys()]
      const page = await this.runtime.queryRows(
        {
          tableId,
          query: this.runtimeQuery(tableId, query),
          projection: { fields: selected, resolveRelations: [] },
          limit: DEFAULT_PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        },
        this.context("relation-stats")
      )
      page.rows.forEach((row) => {
        row.values.forEach((value, index) => {
          const bucket = values.get(selected[index]!)!
          bucket.push(value)
        })
      })
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    return configs.map((config) => {
      const rows = values.get(config.fieldId) ?? []
      const lists = rows.map((value) => (Array.isArray(value) ? value : []))
      const targets = lists.flat().map(String)
      const nonEmptyRows = lists.filter((value) => value.length > 0).length
      const checkedRows = rows.filter(
        (value) => value === true || value === 1 || value === "1"
      ).length
      const percentage = (count: number) =>
        rows.length === 0 ? 0 : Math.round((count / rows.length) * 10_000) / 100
      const value =
        config.type === "relation-value-count"
          ? targets.length
          : config.type === "relation-row-count"
            ? nonEmptyRows
            : config.type === "relation-distinct-target-count"
              ? new Set(targets).size
              : config.type === "percent-checked"
                ? percentage(checkedRows)
                : config.type === "percent-unchecked"
                  ? percentage(rows.length - checkedRows)
                  : config.type === "count-empty"
                    ? rows.length - nonEmptyRows
                    : null
      return { ...config, value }
    })
  }

  private rowMutationResult(
    tableId: string,
    row: EidosFileRow,
    revision: string
  ): Promise<EidosFileRowMutationResult> {
    return this.countRows(tableId, {}).then((rowCount) => ({
      tableId,
      row,
      rowCount,
      revision: BigInt(revision),
    }))
  }

  private statValue(value: LogicalValue): string | number | null {
    if (value === null) return null
    if (typeof value === "number") return value
    if (typeof value === "string") {
      const numeric = Number(value)
      return Number.isFinite(numeric) ? numeric : value
    }
    return String(value)
  }

  private indexSchema(): void {
    this.tables = new Map(
      this.schema
        .filter(
          (object): object is TableDescriptor => object.object === "table"
        )
        .map((table) => [table.id, table])
    )
    this.fields = new Map(
      this.schema
        .filter(
          (object): object is FieldDescriptor => object.object === "field"
        )
        .map((field) => [field.id, field])
    )
    this.fieldsByTable = new Map()
    for (const field of this.fields.values()) {
      const list = this.fieldsByTable.get(field.tableId) ?? []
      list.push(field)
      this.fieldsByTable.set(field.tableId, list)
    }
    for (const list of this.fieldsByTable.values()) list.sort(this.positionSort)
    this.views = new Map(
      this.schema
        .filter((object): object is ViewDescriptor => object.object === "view")
        .map((view) => [view.id, view])
    )
  }

  private acceptRevision(revision: string): void {
    if (this.runtimeSnapshot)
      this.runtimeSnapshot = { ...this.runtimeSnapshot, revision }
    this.cursorCache.clear()
  }

  private revision(): string {
    if (!this.runtimeSnapshot)
      throw new Error("Editor Runtime is not initialized")
    return this.runtimeSnapshot.revision
  }

  private editorRevision(): bigint {
    return BigInt(this.revision())
  }

  private assertTable(tableId: string): TableDescriptor {
    const table = this.tables.get(tableId)
    if (!table) throw new Error(`Table not found: ${tableId}`)
    return table
  }

  private assertField(fieldId: string, tableId?: string): FieldDescriptor {
    const field = this.fields.get(fieldId)
    if (!field || (tableId !== undefined && field.tableId !== tableId)) {
      throw new Error(`Field not found: ${fieldId}`)
    }
    return field
  }

  private assertView(viewId: string): ViewDescriptor {
    const view = this.views.get(viewId)
    if (!view) throw new Error(`View not found: ${viewId}`)
    return view
  }

  private nextPosition(values: Array<{ position: string }>): number {
    return (
      values.reduce(
        (maximum, value) => Math.max(maximum, Number(value.position) || 0),
        0
      ) + 1
    )
  }

  private positionSort = <T extends { position: string }>(left: T, right: T) =>
    BigInt(left.position) < BigInt(right.position)
      ? -1
      : BigInt(left.position) > BigInt(right.position)
        ? 1
        : 0

  private context(prefix: string) {
    return {
      requestId: `${prefix}-${++this.sequence}`,
      deadlineMilliseconds: 30_000,
    }
  }

  private id(prefix: string): string {
    return `${prefix}-${++this.sequence}`
  }
}
