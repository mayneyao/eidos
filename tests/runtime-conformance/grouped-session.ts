import { expect } from "vitest"
import type {
  RuntimeClient,
  RequestContext,
} from "../../packages/eidos-file/src/runtime-contract"

export async function checkGroupedRuntimeSession(
  runtime: RuntimeClient,
  createIndex: (sql: string) => void
) {
  const context = (requestId: string): RequestContext => ({
    requestId,
    deadlineMilliseconds: 30000,
  })
  const preflight = await runtime.preflightSchema(
    {
      expectedRevision: "0",
      change: {
        kind: "create-table",
        clientKey: "table",
        name: "Items",
        position: "0",
        settings: {
          description: "Preserve complete table metadata",
          custom: { enabled: true },
          plugins: { "example.actions": { version: 1, actions: [] } },
        },
        fields: [
          {
            clientKey: "group",
            name: "Group",
            kind: "text",
            position: "0",
          },
          {
            clientKey: "amount",
            name: "Amount",
            kind: "integer",
            position: "1",
          },
          {
            clientKey: "overflow",
            name: "Overflow",
            kind: "formula",
            position: "2",
            definition: {
              sourceText: '"Amount" + 9223372036854775807',
              resultType: "integer",
            },
          },
          {
            clientKey: "substring",
            name: "Substring",
            kind: "formula",
            position: "3",
            definition: {
              sourceText: "SUBSTR('😀ab', 2, 2)",
              resultType: "text",
            },
          },
          {
            clientKey: "mixed",
            name: "Mixed numeric",
            kind: "formula",
            position: "4",
            definition: {
              sourceText: '"Amount" = 1.0',
              resultType: "checkbox",
            },
          },
          {
            clientKey: "files",
            name: "Files",
            kind: "file",
            position: "5",
          },
        ],
        labelFieldClientKey: "group",
      },
    },
    context("preflight")
  )
  const schema = await runtime.mutateSchema(
    {
      expectedRevision: "0",
      planToken: preflight.planToken,
      actionsHash: preflight.actionsHash,
    },
    context("schema")
  )
  const tableId = schema.createdObjects.find(
    (entry) => "clientKey" in entry && entry.clientKey === "table"
  )!.id
  const descriptorPage = await runtime.getSchemaPage(
    { revision: schema.revision, limit: 100 },
    context("complete-table-settings")
  )
  expect(
    descriptorPage.objects.find(
      (entry) => entry.object === "table" && entry.id === tableId
    )
  ).toMatchObject({
    settings: {
      description: "Preserve complete table metadata",
      custom: { enabled: true },
      plugins: { "example.actions": { version: 1, actions: [] } },
    },
  })
  const groupFieldId = schema.createdObjects.find(
    (entry) => "clientKey" in entry && entry.clientKey === "group"
  )!.id
  const amountFieldId = schema.createdObjects.find(
    (entry) => "clientKey" in entry && entry.clientKey === "amount"
  )!.id
  const overflowFieldId = schema.createdObjects.find(
    (entry) => "clientKey" in entry && entry.clientKey === "overflow"
  )!.id
  const substringFieldId = schema.createdObjects.find(
    (entry) => "clientKey" in entry && entry.clientKey === "substring"
  )!.id
  const mixedFieldId = schema.createdObjects.find(
    (entry) => "clientKey" in entry && entry.clientKey === "mixed"
  )!.id
  const fileFieldId = schema.createdObjects.find(
    (entry) => "clientKey" in entry && entry.clientKey === "files"
  )!.id
  const fieldIndexName = `eidos__index__${groupFieldId.replace(/-/g, "")}`
  createIndex(
    `CREATE INDEX "${fieldIndexName}" ON "Items"("Group" COLLATE BINARY)`
  )
  await expect(
    runtime.validate(
      { level: "structural", diagnosticsLimit: 100 },
      context("validate-field-index")
    )
  ).resolves.toMatchObject({ valid: true, diagnostics: [] })
  const formulaPreview = await runtime.previewFormula(
    {
      tableId,
      candidateName: "Preview doubled",
      sourceText: '"Amount" * 2',
      declaredResultType: "integer",
    },
    context("formula-preview")
  )
  expect(formulaPreview).toMatchObject({
    valid: true,
    dependencies: [amountFieldId],
    rows: [],
  })
  const invalidFormula = await runtime.preflightSchema(
    {
      expectedRevision: schema.revision,
      change: {
        kind: "set-formula",
        fieldId: substringFieldId,
        definition: {
          sourceText: "SUBSTR('a', 1.5)",
          resultType: "text",
        },
      },
    },
    context("invalid-formula")
  )
  expect(invalidFormula.classification).toBe("forbidden")
  expect(invalidFormula.warnings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: "formula-type-invalid",
        severity: "error",
      }),
    ])
  )
  const rename = await runtime.preflightSchema(
    {
      expectedRevision: schema.revision,
      change: {
        kind: "rename-field",
        fieldId: amountFieldId,
        name: "Quantity",
      },
    },
    context("rename-formula-reference")
  )
  expect(rename.classification).toBe("lossless-rewrite")
  const changes = Array.from({ length: 1_002 }, (_, index) => ({
    kind: "create" as const,
    clientKey: `row-${index}`,
    values: {
      [groupFieldId]: index < 501 ? "A" : "B",
      [amountFieldId]: index < 501 ? "1" : "2",
    },
  }))
  let revision = schema.revision
  let firstItemId = ""
  for (let offset = 0; offset < changes.length; offset += 500) {
    const mutation = await runtime.mutateRows(
      {
        tableId,
        expectedRevision: revision,
        changes: changes.slice(offset, offset + 500),
      },
      context(`rows-${offset}`)
    )
    revision = mutation.revision
    if (offset === 0) {
      firstItemId = mutation.created.find(
        (entry) => entry.clientKey === "row-0"
      )!.rowId
    }
  }
  const request = {
    tableId,
    query: {
      sort: [{ fieldId: amountFieldId, direction: "asc" as const }],
    },
    groupBy: [groupFieldId],
    aggregates: [
      { key: "count", op: "count-all" as const },
      { key: "sum", op: "sum" as const, fieldId: amountFieldId },
    ],
    projection: {
      fields: [
        groupFieldId,
        amountFieldId,
        overflowFieldId,
        substringFieldId,
        mixedFieldId,
      ],
      resolveRelations: [],
    },
    groupLimit: 1,
    rowsPerGroup: 1,
  }
  const first = await runtime.groupRows(request, context("group-1"))
  const batchQueries = ["A", "B", "C"].map((value) => ({
    ...request.query,
    filter: { op: "eq" as const, fieldId: groupFieldId, value },
  }))
  const batch = await runtime.queryRowPages!(
    {
      tableId,
      queries: batchQueries,
      projection: request.projection,
      limit: 2,
    },
    context("batch-pages")
  )
  expect(batch.map((page) => page.total)).toEqual(["501", "501", "0"])
  expect(batch.map((page) => page.rows.length)).toEqual([2, 2, 0])
  const batchNext = await runtime.queryRows(
    {
      tableId,
      query: batchQueries[0]!,
      projection: request.projection,
      limit: 2,
      cursor: batch[0]!.nextCursor!,
    },
    context("batch-next")
  )
  expect(batchNext.rows).toHaveLength(2)
  expect(
    new Set([...batch[0]!.rows, ...batchNext.rows].map((row) => row.id)).size
  ).toBe(4)
  expect(first.groups[0]).toMatchObject({
    key: ["A"],
    count: "501",
    aggregates: [
      { key: "count", value: "501" },
      { key: "sum", value: "501" },
    ],
  })
  expect(first.groups[0]!.rows).toHaveLength(1)
  expect(first.groups[0]!.rows[0]!.values).toEqual(["A", "1", null, "ab", true])
  expect(first.groups[0]!.nextRowCursor).not.toBeNull()
  expect(first.nextCursor).not.toBeNull()

  const continuedRows = await runtime.queryGroupRows(
    { cursor: first.groups[0]!.nextRowCursor!, limit: 1_000 },
    context("group-rows")
  )
  expect(continuedRows.groupKey).toEqual(["A"])
  expect(continuedRows.rows).toHaveLength(500)
  expect(continuedRows.nextCursor).toBeNull()
  expect(continuedRows.previousCursor).not.toBeNull()

  const second = await runtime.groupRows(
    { ...request, cursor: first.nextCursor! },
    context("group-2")
  )
  expect(second.groups[0]).toMatchObject({
    key: ["B"],
    count: "501",
    aggregates: [
      { key: "count", value: "501" },
      { key: "sum", value: "1002" },
    ],
  })
  expect(second.nextCursor).toBeNull()
  expect(second.previousCursor).not.toBeNull()

  const targetPlan = await runtime.preflightSchema(
    {
      expectedRevision: revision,
      change: {
        kind: "create-table",
        clientKey: "target-table",
        name: "Targets",
        position: "1",
        fields: [
          {
            clientKey: "target-label",
            name: "Label",
            kind: "text",
            position: "0",
          },
          {
            clientKey: "target-value",
            name: "Value",
            kind: "integer",
            position: "1",
          },
        ],
        labelFieldClientKey: "target-label",
      },
    },
    context("target-plan")
  )
  const targetSchema = await runtime.mutateSchema(
    {
      expectedRevision: revision,
      planToken: targetPlan.planToken,
      actionsHash: targetPlan.actionsHash,
    },
    context("target-schema")
  )
  revision = targetSchema.revision
  const targetTableId = targetSchema.createdObjects.find(
    (entry) => "clientKey" in entry && entry.clientKey === "target-table"
  )!.id
  const targetLabelId = targetSchema.createdObjects.find(
    (entry) => "clientKey" in entry && entry.clientKey === "target-label"
  )!.id
  const targetValueId = targetSchema.createdObjects.find(
    (entry) => "clientKey" in entry && entry.clientKey === "target-value"
  )!.id
  const targetRows = await runtime.mutateRows(
    {
      tableId: targetTableId,
      expectedRevision: revision,
      changes: [
        {
          kind: "create",
          clientKey: "maximum",
          values: {
            [targetLabelId]: "Maximum",
            [targetValueId]: "9223372036854775807",
          },
        },
        {
          kind: "create",
          clientKey: "null",
          values: { [targetLabelId]: "Null", [targetValueId]: null },
        },
        {
          kind: "create",
          clientKey: "one",
          values: { [targetLabelId]: "One", [targetValueId]: "1" },
        },
        {
          kind: "create",
          clientKey: "removed",
          values: { [targetLabelId]: "Removed", [targetValueId]: "2" },
        },
      ],
    },
    context("target-rows")
  )
  revision = targetRows.revision
  const targetRowIds = ["maximum", "null", "one"].map(
    (key) => targetRows.created.find((entry) => entry.clientKey === key)!.rowId
  )
  const unresolvedTargetId = targetRows.created.find(
    (entry) => entry.clientKey === "removed"
  )!.rowId
  const relationPlan = await runtime.preflightSchema(
    {
      expectedRevision: revision,
      change: {
        kind: "create-field",
        tableId,
        field: {
          clientKey: "targets-relation",
          name: "Targets",
          kind: "relation",
          position: "5",
          definition: {
            direction: "forward",
            targetTableId,
            cardinality: "many",
            onDelete: "preserve",
          },
        },
      },
    },
    context("relation-plan")
  )
  const relationSchema = await runtime.mutateSchema(
    {
      expectedRevision: revision,
      planToken: relationPlan.planToken,
      actionsHash: relationPlan.actionsHash,
    },
    context("relation-schema")
  )
  revision = relationSchema.revision
  const relationFieldId = relationSchema.createdObjects.find(
    (entry) => "clientKey" in entry && entry.clientKey === "targets-relation"
  )!.id
  const lookupPlan = await runtime.preflightSchema(
    {
      expectedRevision: revision,
      change: {
        kind: "batch",
        changes: [
          {
            kind: "create-field",
            tableId,
            field: {
              clientKey: "lookup-values",
              name: "Lookup values",
              kind: "lookup",
              position: "6",
              definition: {
                relationFieldId,
                targetFieldId: targetValueId,
                aggregate: "values",
                distinctValues: false,
              },
            },
          },
          {
            kind: "create-field",
            tableId,
            field: {
              clientKey: "lookup-sum",
              name: "Lookup sum",
              kind: "lookup",
              position: "7",
              definition: {
                relationFieldId,
                targetFieldId: targetValueId,
                aggregate: "sum",
                distinctValues: false,
              },
            },
          },
        ],
      },
    },
    context("lookup-plan")
  )
  expect(lookupPlan.classification).toBe("metadata-only")
  const lookupSchema = await runtime.mutateSchema(
    {
      expectedRevision: revision,
      planToken: lookupPlan.planToken,
      actionsHash: lookupPlan.actionsHash,
    },
    context("lookup-schema")
  )
  revision = lookupSchema.revision
  const lookupValuesId = lookupSchema.createdObjects.find(
    (entry) => "clientKey" in entry && entry.clientKey === "lookup-values"
  )!.id
  const lookupSumId = lookupSchema.createdObjects.find(
    (entry) => "clientKey" in entry && entry.clientKey === "lookup-sum"
  )!.id
  const related = await runtime.mutateRows(
    {
      tableId,
      expectedRevision: revision,
      changes: [
        {
          kind: "update",
          rowId: firstItemId,
          values: {
            [relationFieldId]: [...targetRowIds, unresolvedTargetId],
          },
        },
      ],
    },
    context("related-row")
  )
  const removedTarget = await runtime.mutateRows(
    {
      tableId: targetTableId,
      expectedRevision: related.revision,
      changes: [{ kind: "delete", rowId: unresolvedTargetId }],
    },
    context("remove-related-target")
  )
  const relationFiltered = await runtime.queryRows(
    {
      tableId,
      query: {
        filter: {
          op: "relation-has",
          fieldId: relationFieldId,
          rowId: targetRowIds[0]!,
        },
      },
      projection: {
        fields: [relationFieldId],
        resolveRelations: [],
      },
      limit: 25,
      direction: "forward",
    },
    context("relation-filter-query")
  )
  expect(relationFiltered.rows.map((row) => row.id)).toEqual([firstItemId])
  await expect(
    runtime.getRecordNeighbors(
      {
        tableId,
        rowId: firstItemId,
        query: {
          filter: {
            op: "relation-has",
            fieldId: relationFieldId,
            rowId: targetRowIds[0]!,
          },
        },
      },
      context("single-neighbor")
    )
  ).resolves.toEqual({ found: true, previousId: null, nextId: null })
  const neighborSequence = await runtime.queryRows(
    {
      tableId,
      query: {},
      projection: { fields: [], resolveRelations: [] },
      limit: 3,
    },
    context("neighbor-sequence")
  )
  for (const [index, row] of neighborSequence.rows.slice(0, 2).entries()) {
    await expect(
      runtime.getRecordNeighbors(
        { tableId, rowId: row.id, query: {} },
        context(`neighbor-${index}`)
      )
    ).resolves.toEqual({
      found: true,
      previousId: neighborSequence.rows[index - 1]?.id ?? null,
      nextId: neighborSequence.rows[index + 1]?.id ?? null,
    })
  }

  const relationSearched = await runtime.queryRows(
    {
      tableId,
      query: {
        search: { text: "maximum", fields: [relationFieldId] },
      },
      projection: {
        fields: [relationFieldId],
        resolveRelations: [],
      },
      limit: 25,
      direction: "forward",
    },
    context("relation-search-query")
  )
  expect(relationSearched.rows.map((row) => row.id)).toEqual([firstItemId])

  const unresolvedRelationSearched = await runtime.queryRows(
    {
      tableId,
      query: {
        search: { text: unresolvedTargetId, fields: [relationFieldId] },
      },
      projection: {
        fields: [relationFieldId],
        resolveRelations: [relationFieldId],
      },
      limit: 25,
      direction: "forward",
    },
    context("unresolved-relation-search-query")
  )
  expect(unresolvedRelationSearched.rows).toHaveLength(1)
  expect(
    unresolvedRelationSearched.rows[0]?.resolvedRelations?.[0]?.items.at(-1)
  ).toEqual({ id: unresolvedTargetId, state: "unresolved" })

  await expect(
    runtime.queryRows(
      {
        tableId,
        query: {
          sort: [{ fieldId: relationFieldId, direction: "asc" }],
        },
        projection: {
          fields: [relationFieldId],
          resolveRelations: [],
        },
        limit: 25,
        direction: "forward",
      },
      context("invalid-relation-sort")
    )
  ).rejects.toMatchObject({ code: "invalid-query" })

  const lookupPage = await runtime.queryRows(
    {
      tableId,
      query: {
        sort: [{ fieldId: groupFieldId, direction: "asc" }],
      },
      projection: {
        fields: [lookupValuesId, lookupSumId],
        resolveRelations: [],
      },
      limit: 1,
      direction: "forward",
    },
    context("lookup-query")
  )
  expect(lookupPage.columns.map((column) => column.valueType)).toEqual([
    { kind: "list", element: "integer" },
    "integer",
  ])
  expect(lookupPage.rows[0]!.values).toEqual([
    ["9223372036854775807", null, "1"],
    null,
  ])

  const createdView = await runtime.mutateView(
    {
      expectedRevision: removedTarget.revision,
      changes: [
        {
          kind: "create-view",
          clientKey: "view",
          tableId,
          name: "Board",
          type: "kanban",
          query: {},
          layout: {
            fieldOrder: [groupFieldId, amountFieldId],
            groupField: groupFieldId,
            hiddenFields: [],
          },
          position: "0",
        },
      ],
    },
    context("create-view")
  )
  const viewId = createdView.createdViews[0]!.viewId
  const updatedView = await runtime.mutateView(
    {
      expectedRevision: createdView.revision,
      changes: [
        {
          kind: "update-view",
          viewId,
          patch: {
            layout: {
              fieldOrder: [amountFieldId, groupFieldId],
              groupField: groupFieldId,
              hiddenFields: [overflowFieldId],
            },
          },
        },
      ],
    },
    context("update-view")
  )
  const schemaPage = await runtime.getSchemaPage(
    { revision: updatedView.revision, limit: 1_000 },
    context("view-schema")
  )
  expect(
    schemaPage.objects.find(
      (object) => object.object === "view" && object.id === viewId
    )
  ).toMatchObject({
    layout: {
      fieldOrder: [amountFieldId, groupFieldId],
      groupField: groupFieldId,
      hiddenFields: [overflowFieldId],
    },
  })

  return { tableId, firstItemId, fileFieldId }
}
