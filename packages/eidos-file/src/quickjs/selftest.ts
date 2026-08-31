import { expect } from "./expect-shim"
import { expectConnectionPortConformance } from "../connection-port.conformance"
import { Runtime } from "../runtime-service"
import type {
  RequestContext,
  RuntimeEnvironment,
  RuntimeService,
} from "../runtime-contract"
import type { CancellationPort } from "../protocol-types"
import { QuickJsConnectionPort } from "./port"

const cancellation: CancellationPort = {
  cancelled: () => false,
  onCancel: () => () => undefined,
}

const context = (requestId: string): RequestContext => ({
  requestId,
  deadlineMilliseconds: 30_000,
})

const environment = (): RuntimeEnvironment => {
  let monotonic = 0
  let entropy = 0
  return {
    clock: {
      nowInstant: () => "2026-07-22T00:00:00.000Z",
      nowMilliseconds: () => ++monotonic,
    },
    entropy: {
      randomBytes(length: number) {
        const bytes = new Uint8Array(length)
        for (let index = 0; index < length; index += 1) {
          bytes[index] = entropy++ & 0xff
        }
        return bytes
      },
    },
  }
}

/**
 * Faithful QuickJS port of the first Runtime 1.0 WASM conformance test. Every
 * assertion mirrors runtime-service-wasm.test.ts so parity with the official
 * sqlite-wasm adapter is proven statement-for-statement.
 */
export async function runSelfTest(): Promise<string> {
  const checks: string[] = []
  const port = new QuickJsConnectionPort()
  globalThis.__eidos_scalar_dispatch = (name, argsJson) =>
    port.dispatchScalar(name, argsJson)

  const binding = await Runtime.create(
    port,
    environment(),
    { title: "Groups" },
    { cancellation }
  )
  const runtime: RuntimeService = binding.service
  try {
    const negotiation = await runtime.negotiate(
      { protocol: "eidos-runtime", versions: ["1.0"] },
      context("negotiate")
    )
    expect(negotiation.limits.formulaBytesMax).toBe(4_096)
    expect(negotiation.capabilities.formulaPreview).toBe(true)
    checks.push("negotiate")

    const remoteFileEntry = await binding.hostBridge.allocateFileEntry(
      {
        name: "remote.png",
        mediaType: "image/png",
        size: "68",
        uri: "https://cdn.example.com/remote.png",
      },
      context("allocate-remote-file-entry")
    )
    expect(remoteFileEntry).toMatchObject({
      name: "remote.png",
      mediaType: "image/png",
      size: "68",
      uri: "https://cdn.example.com/remote.png",
    })
    checks.push("allocate-remote-file-entry")

    await expectConnectionPortConformance(port)
    checks.push("connection-port-conformance")

    expect(() =>
      port.transaction("read", () =>
        port.query(
          "INSERT INTO eidos__features(name, version, required, config_json) " +
            "VALUES ('x.test', '1.0', 0, '{}') RETURNING name"
        )
      )
    ).toThrow(/read transaction/)
    checks.push("read-transaction-guard")

    const formulaSemantics = port.get(`SELECT
      eidos_formula_int_add(9223372036854775807, 1) AS overflow,
      eidos_formula_numeric_gt(9007199254740993, 9007199254740992.0) AS mixed,
      substr('😀ab', 2, 2) AS substring,
      length('a' || char(0) || '😀') AS scalarLength,
      date('2024-02-28', '+1 day') AS leapDay,
      strftime('%Y-%m-%dT%H:%M:%fZ',
        datetime('2026-12-31T23:00:00.000Z', '+1 hour')
      ) AS instant,
      format('%d小时%d分钟',
        floor(eidos_formula_num_div(309299, 3600)),
        round(eidos_formula_num_div(eidos_formula_int_mod(309299, 3600), 60))
      ) AS formatted,
      concat(85, '小时', 55, '分钟') AS concatenated,
      floor(1.5) AS rounded`)
    expect(formulaSemantics.row).toEqual([
      { tag: "null" },
      { tag: "integer", value: "1" },
      { tag: "text", value: "ab" },
      { tag: "integer", value: "1" },
      { tag: "text", value: "2024-02-29" },
      { tag: "text", value: "2027-01-01T00:00:00.000Z" },
      { tag: "text", value: "85小时55分钟" },
      { tag: "text", value: "85小时55分钟" },
      { tag: "real", value: 1 },
    ])
    expect(formulaSemantics.columns).toEqual([
      { name: "overflow" },
      { name: "mixed" },
      { name: "substring" },
      { name: "scalarLength" },
      { name: "leapDay" },
      { name: "instant" },
      { name: "formatted" },
      { name: "concatenated" },
      { name: "rounded" },
    ])
    checks.push("formula-scalar-semantics")

    const preflight = await runtime.preflightSchema(
      {
        expectedRevision: "0",
        change: {
          kind: "create-table",
          clientKey: "table",
          name: "Items",
          position: "0",
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
    const created = (key: string) =>
      schema.createdObjects.find(
        (entry) => "clientKey" in entry && entry.clientKey === key
      )!.id
    const tableId = created("table")
    const groupFieldId = created("group")
    const amountFieldId = created("amount")
    const overflowFieldId = created("overflow")
    const substringFieldId = created("substring")
    const mixedFieldId = created("mixed")
    checks.push("schema-create-table-with-formulas")

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
    checks.push("formula-preview")

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
    expect(invalidFormula.warnings).toMatchObject(
      expect.arrayContaining([
        expect.objectContaining({
          code: "formula-type-invalid",
          severity: "error",
        }),
      ])
    )
    checks.push("invalid-formula-classification")

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
    checks.push("rename-lossless-rewrite")

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
    checks.push("mutate-rows-1002")

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
    expect(first.groups[0]).toMatchObject({
      key: ["A"],
      count: "501",
      aggregates: [
        { key: "count", value: "501" },
        { key: "sum", value: "501" },
      ],
    })
    expect(first.groups[0]!.rows).toHaveLength(1)
    expect(first.groups[0]!.rows[0]!.values).toEqual([
      "A",
      "1",
      null,
      "ab",
      true,
    ])
    expect(first.groups[0]!.nextRowCursor).not.toBeNull()
    expect(first.nextCursor).not.toBeNull()
    checks.push("group-rows-first-page")

    const continuedRows = await runtime.queryGroupRows(
      { cursor: first.groups[0]!.nextRowCursor!, limit: 1_000 },
      context("group-rows")
    )
    expect(continuedRows.groupKey).toEqual(["A"])
    expect(continuedRows.rows).toHaveLength(500)
    expect(continuedRows.nextCursor).toBeNull()
    expect(continuedRows.previousCursor).not.toBeNull()
    checks.push("group-rows-continue-cursor")

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
    checks.push("group-rows-second-page")

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
        ],
      },
      context("target-rows")
    )
    revision = targetRows.revision
    const targetRowIds = ["maximum", "null", "one"].map(
      (key) =>
        targetRows.created.find((entry) => entry.clientKey === key)!.rowId
    )
    checks.push("target-table-rows")

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
              onDelete: "detach",
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
    checks.push("relation-field")

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
    checks.push("lookup-fields")

    await runtime.mutateRows(
      {
        tableId,
        expectedRevision: revision,
        changes: [
          {
            kind: "update",
            rowId: firstItemId,
            values: { [relationFieldId]: targetRowIds },
          },
        ],
      },
      context("related-row")
    )
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
    checks.push("lookup-evaluation-int64")

    const validation = await runtime.validate(
      { level: "full", diagnosticsLimit: 100 },
      context("validate")
    )
    expect(validation.valid).toBe(true)
    checks.push("validate-full")

    const snapshot = await port.transaction("read", async () => {
      port.get("SELECT count(*) FROM sqlite_schema")
      return port.snapshot({
        cancellation,
        deadlineMilliseconds: 30_000,
        maxBytes: "16777216",
      })
    })
    const header = await snapshot.bytes.read("0", 16, {
      cancellation,
      deadlineMilliseconds: 30_000,
    })
    expect(new TextDecoder().decode(header)).toBe("SQLite format 3\u0000")
    await snapshot.release()
    checks.push("snapshot")

    return JSON.stringify({ ok: true, checks })
  } finally {
    await runtime.close(context("close"))
    port.close()
  }
}
