#!/usr/bin/env node
/**
 * Executes tests/runtime-conformance/cases.json against:
 *   - JS Runtime (@eidos.space/eidos-file/node-sqlite) [default]
 *   - Rust N-API Runtime (crates/eidos-file-runtime-napi) [--backend=rust]
 *
 * Run via Electron Node (Node 24 with node:sqlite):
 *   node scripts/run-electron-node.mjs tests/runtime-conformance/run-js.mjs [--backend=js|rust]
 */
import assert from "node:assert/strict"
import { randomBytes } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, "../..")

const backendArg =
  process.argv.find((arg) => arg.startsWith("--backend="))?.split("=")[1] ??
  process.env.EIDOS_CONFORMANCE_BACKEND ??
  "js"

const eidosFile = await import(
  path.join(repoRoot, "packages/eidos-file/dist/index.mjs")
)
const nodeSqlite = await import(
  path.join(repoRoot, "packages/eidos-file/dist/node-sqlite.mjs")
)

const suite = JSON.parse(
  await fs.readFile(path.join(__dirname, "cases.json"), "utf8")
)

let seq = 0
const ctx = (tag) => ({
  requestId: `conformance-${tag}-${++seq}`,
  deadlineMilliseconds: 30_000,
})

function env() {
  return {
    clock: {
      nowInstant: () => new Date().toISOString(),
      nowMilliseconds: () => performance.now(),
    },
    entropy: { randomBytes: (n) => new Uint8Array(randomBytes(n)) },
  }
}

const factoryCtx = {
  cancellation: { cancelled: () => false, onCancel: () => () => {} },
  deadlineMilliseconds: 30_000,
}

async function openBackend(filePath, title) {
  if (backendArg === "js") {
    const db = new DatabaseSync(filePath, {
      allowExtension: false,
      defensive: true,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      timeout: 5_000,
    })
    const port = new nodeSqlite.NodeSqliteConnectionPort(db)
    const binding = await eidosFile.Runtime.create(
      port,
      env(),
      { title },
      factoryCtx
    )
    return {
      service: binding.service,
      async close() {
        await binding.service.close(ctx("close"))
        port.close()
      },
    }
  }
  if (backendArg === "rust") {
    const napiModule = await import(
      path.join(repoRoot, "crates/eidos-file-runtime-napi/index.mjs")
    )
    const service = await napiModule.createRustRuntimeClient(filePath, {
      title,
    })
    return {
      service,
      async close() {
        await service.close(ctx("close"))
      },
    }
  }
  throw new Error(`Unsupported backend: ${backendArg}`)
}

function resolveRowValue(val, rows) {
  if (typeof val === "string" && val.startsWith("$row:")) {
    return rows[val.slice(5)]
  }
  if (Array.isArray(val)) {
    return val.map((item) => resolveRowValue(item, rows))
  }
  return val
}

function resolveFieldDef(def, tableKey, state) {
  if (!def) return undefined
  const out = { ...def }
  if (out.targetTableKey) {
    out.targetTableId = state.tables[out.targetTableKey]
    delete out.targetTableKey
  }
  if (out.inverseOfTableKey && out.inverseOfFieldKey) {
    out.inverseOfFieldId =
      state.fields[out.inverseOfTableKey][out.inverseOfFieldKey]
    delete out.inverseOfTableKey
    delete out.inverseOfFieldKey
  }
  if (out.relationFieldKey) {
    out.relationFieldId = state.fields[tableKey][out.relationFieldKey]
    delete out.relationFieldKey
  }
  if (out.targetFieldKey) {
    const tKey = def.targetTableKey ?? tableKey
    out.targetFieldId = state.fields[tKey][out.targetFieldKey]
    delete out.targetFieldKey
  }
  if (def.targetFieldKey && "targetTableId" in out && def.relationFieldKey) {
    delete out.targetTableId
  }
  return out
}

function resolveFilter(node, fields) {
  if (!node) return undefined
  if (node.op === "and" || node.op === "or") {
    return {
      op: node.op,
      args: node.args.map((child) => resolveFilter(child, fields)),
    }
  }
  if (node.op === "not") {
    return { op: "not", arg: resolveFilter(node.arg, fields) }
  }
  const { field, ...rest } = node
  return { ...rest, fieldId: fields[field] }
}

async function runCase(testCase, tempDir) {
  const filePath = path.join(tempDir, `${testCase.id}.eidos`)
  const handle = await openBackend(filePath, "Conformance Test")
  const { service } = handle
  const state = {
    tables: {},
    fields: {},
    rows: {},
    revision: "0",
  }

  try {
    for (const step of testCase.steps) {
      if (step.op === "wire") {
        const resolve = (value) => {
          if (typeof value === "string" && value.startsWith("$")) {
            return value
              .slice(1)
              .split(".")
              .reduce((obj, key) => {
                assert.ok(Object.hasOwn(obj, key), key)
                return obj[key]
              }, state)
          }
          if (Array.isArray(value)) return value.map(resolve)
          if (value && typeof value === "object")
            return Object.fromEntries(
              Object.entries(value).map(([key, v]) => [
                resolve(key),
                resolve(v),
              ])
            )
          return value
        }
        const call = async () => {
          const request = resolve(step.request)
          if (step.method === "applySchema") {
            const plan = await service.preflightSchema(
              request,
              ctx("preflight")
            )
            return service.mutateSchema(
              {
                expectedRevision: request.expectedRevision,
                actionsHash: plan.actionsHash,
                planToken: plan.planToken,
              },
              ctx("apply")
            )
          }
          return service[step.method](request, ctx(step.method))
        }
        if (step.error) {
          await assert.rejects(
            call,
            (e) => step.error.includes(e.code),
            step.method
          )
        } else {
          const result = await call()
          if (step.save) state[step.save] = result
          for (const key of step.absent ?? []) {
            assert.ok(
              !Object.hasOwn(result, key),
              `${step.method} returned ${key}`
            )
          }
          for (const [path, expected] of Object.entries(step.check ?? {})) {
            assert.deepEqual(
              path.split(".").reduce((v, k) => v[k], result),
              resolve(expected)
            )
          }
        }
      } else if (step.op === "negotiate") {
        const res = await service.negotiate(step.request, ctx("negotiate"))
        assert.equal(res.version, step.expect.version)
        if (step.expect.hasCapabilities) assert.ok(res.capabilities)
        if (step.expect.hasLimits) assert.ok(res.limits)
      } else if (step.op === "getSnapshot") {
        const snap = await service.getSnapshot(step.request, ctx("snapshot"))
        state.revision = snap.revision
        assert.equal(snap.format.major, step.expect.formatMajor)
        assert.equal(snap.format.minor, step.expect.formatMinor)
        assert.equal(snap.title, step.expect.title)
        assert.equal(snap.revision, step.expect.revision)
      } else if (step.op === "validate") {
        const report = await service.validate(step.request, ctx("validate"))
        assert.equal(
          report.valid,
          step.expect.valid,
          `validate diagnostics: ${JSON.stringify(report.diagnostics)}`
        )
        assert.equal(report.diagnostics.length, step.expect.diagnosticsCount)
      } else if (step.op === "createTable") {
        const change = {
          kind: "create-table",
          clientKey: step.saveTableAs,
          name: step.name,
          position: "0",
          fields: step.fields,
          labelFieldClientKey: step.labelFieldClientKey,
        }
        const plan = await service.preflightSchema(
          { change, expectedRevision: state.revision },
          ctx("preflight-create-table")
        )
        assert.notEqual(plan.classification, "forbidden")
        const res = await service.mutateSchema(
          {
            planToken: plan.planToken,
            expectedRevision: state.revision,
            actionsHash: plan.actionsHash,
          },
          ctx("create-table")
        )
        state.revision = res.revision
        const tableObj = res.createdObjects.find(
          (o) => o.object === "table" && o.clientKey === step.saveTableAs
        )
        assert.ok(tableObj, "created table object missing")
        state.tables[step.saveTableAs] = tableObj.id
        state.fields[step.saveTableAs] = {}
        for (const obj of res.createdObjects) {
          if (obj.object === "field" && "clientKey" in obj) {
            state.fields[step.saveTableAs][obj.clientKey] = obj.id
          }
        }
      } else if (step.op === "createField") {
        const tableId = state.tables[step.table]
        const fieldSpec = {
          ...step.field,
          ...(step.field.definition
            ? {
                definition: resolveFieldDef(
                  step.field.definition,
                  step.table,
                  state
                ),
              }
            : {}),
        }
        const change = { kind: "create-field", tableId, field: fieldSpec }
        const plan = await service.preflightSchema(
          { change, expectedRevision: state.revision },
          ctx("preflight-create-field")
        )
        assert.notEqual(plan.classification, "forbidden")
        const res = await service.mutateSchema(
          {
            planToken: plan.planToken,
            expectedRevision: state.revision,
            actionsHash: plan.actionsHash,
          },
          ctx("create-field")
        )
        state.revision = res.revision
        const fObj = res.createdObjects.find(
          (o) => o.object === "field" && o.clientKey === step.field.clientKey
        )
        assert.ok(fObj, `created field missing for ${step.field.clientKey}`)
        state.fields[step.table][step.field.clientKey] = fObj.id
      } else if (step.op === "schemaLeaf") {
        const raw = step.change
        const change = { ...raw }
        if (raw.table) {
          change.tableId = state.tables[raw.table]
          delete change.table
        }
        if (raw.field) {
          change.fieldId = state.fields[raw.table][raw.field]
          delete change.field
        }
        if (
          raw.kind === "set-field-nullable" ||
          raw.kind === "set-field-position" ||
          raw.kind === "rename-option"
        ) {
          delete change.tableId
        }
        const plan = await service.preflightSchema(
          { change, expectedRevision: state.revision },
          ctx(`preflight-${raw.kind}`)
        )
        if (step.expectClassification) {
          assert.equal(plan.classification, step.expectClassification)
        }
        if (plan.classification === "forbidden") {
          continue
        }
        const res = await service.mutateSchema(
          {
            planToken: plan.planToken,
            expectedRevision: state.revision,
            actionsHash: plan.actionsHash,
            ...(step.confirmLossy ? { confirmLossy: true } : {}),
          },
          ctx(`apply-${raw.kind}`)
        )
        state.revision = res.revision
      } else if (step.op === "insertRows") {
        const tableId = state.tables[step.table]
        const fMap = state.fields[step.table]
        const rows = step.sequence
          ? Array.from({ length: step.sequence.count }, (_, i) => {
              const value = String(step.sequence.start + i)
              return {
                clientKey: value,
                values: { [step.sequence.field]: value },
              }
            })
          : step.rows
        const changes = rows.map((r) => ({
          kind: "create",
          clientKey: r.clientKey,
          values: Object.fromEntries(
            Object.entries(r.values).map(([k, v]) => [
              fMap[k],
              resolveRowValue(v, state.rows),
            ])
          ),
        }))
        const res = await service.mutateRows(
          { tableId, expectedRevision: state.revision, changes },
          ctx("insert-rows")
        )
        state.revision = res.revision
        for (const created of res.created) {
          state.rows[created.clientKey] = created.rowId
        }
      } else if (step.op === "queryRows") {
        const tableId = state.tables[step.table]
        const fMap = state.fields[step.table]
        const query = {}
        if (step.filter) query.filter = resolveFilter(step.filter, fMap)
        if (step.search) {
          query.search = {
            text: step.search.text,
            fields: step.search.fields.map((k) => fMap[k]),
          }
        }
        if (step.sort) {
          query.sort = step.sort.map((s) => ({
            fieldId: fMap[s.field],
            direction: s.direction,
            ...(s.nulls ? { nulls: s.nulls } : {}),
          }))
        }
        const page = await service.queryRows(
          {
            ...(step.calendar ? { calendar: step.calendar } : {}),
            ...(step.referenceInstant
              ? { referenceInstant: step.referenceInstant }
              : {}),
            tableId,
            query,
            projection: {
              fields: step.projection.map((k) => fMap[k]),
              resolveRelations: (step.resolveRelations ?? []).map(
                (k) => fMap[k]
              ),
            },
            limit: step.limit,
          },
          ctx("query-rows")
        )
        if (step.expectTitles) {
          const titles = page.rows.map((r) => r.values[0])
          assert.deepEqual(titles, step.expectTitles)
        }
        if (step.expectRows) {
          const prefixLen = step.expectRows[0]?.length ?? 0
          const actual = page.rows.map((r) => r.values.slice(0, prefixLen))
          assert.deepEqual(actual, step.expectRows)
        }
        if (step.expectResolvedLabels) {
          const labels = page.rows.map((r) =>
            (r.resolvedRelations?.[0]?.items ?? []).map((it) => it.label)
          )
          assert.deepEqual(labels, step.expectResolvedLabels)
        }
      } else if (step.op === "aggregate") {
        const tableId = state.tables[step.table]
        const fMap = state.fields[step.table]
        const items = step.items.map((item) =>
          item.field
            ? { key: item.key, op: item.op, fieldId: fMap[item.field] }
            : { key: item.key, op: item.op }
        )
        const req = {
          ...(step.calendar ? { calendar: step.calendar } : {}),
          ...(step.referenceInstant
            ? { referenceInstant: step.referenceInstant }
            : {}),
          tableId,
          items,
        }
        if (step.filter) {
          req.query = { filter: resolveFilter(step.filter, fMap) }
        }
        const res = await service.aggregate(req, ctx("aggregate"))
        const actual = Object.fromEntries(
          res.results.map((r) => [r.key, r.value])
        )
        assert.deepEqual(actual, step.expect)
      } else if (step.op === "groupRowsAndPaginate") {
        const tableId = state.tables[step.table]
        const fMap = state.fields[step.table]
        const query = {}
        if (step.sort) {
          query.sort = step.sort.map((s) => ({
            fieldId: fMap[s.field],
            direction: s.direction,
          }))
        }
        const gp = await service.groupRows(
          {
            tableId,
            query,
            groupBy: step.groupBy.map((k) => fMap[k]),
            aggregates: [],
            projection: {
              fields: step.projection.map((k) => fMap[k]),
              resolveRelations: [],
            },
            groupLimit: 20,
            rowsPerGroup: step.rowsPerGroup,
          },
          ctx("group-paginate-init")
        )
        const bucket = gp.groups.find((g) => g.key[0] === step.targetGroup)
        assert.ok(bucket, `targetGroup ${step.targetGroup} not found`)
        assert.deepEqual(
          bucket.rows.map((r) => r.values[0]),
          step.expectInitialTitles
        )
        assert.ok(bucket.nextRowCursor, "expected nextRowCursor")
        const next = await service.queryGroupRows(
          { cursor: bucket.nextRowCursor, limit: 10 },
          ctx("group-paginate-next")
        )
        assert.deepEqual(next.groupKey, [step.targetGroup])
        assert.deepEqual(
          next.rows.map((r) => r.values[0]),
          step.expectNextPageTitles
        )
        assert.equal(next.nextCursor, null)
      } else if (step.op === "getRowsById") {
        const tableId = state.tables[step.table]
        const fMap = state.fields[step.table]
        const rowIds = step.rowKeys.map((k) =>
          k.startsWith("$missing:") ? k.slice(9) : state.rows[k]
        )
        const batch = await service.getRowsById(
          {
            tableId,
            rowIds,
            projection: {
              fields: step.projection.map((k) => fMap[k]),
              resolveRelations: [],
            },
          },
          ctx("get-rows-by-id")
        )
        assert.deepEqual(
          batch.rows.map((r) => r.values[0]),
          step.expectTitles
        )
        assert.equal(batch.missingRowIds.length, step.expectMissingCount)
      } else if (step.op === "recordNeighborsAndIndex") {
        const tableId = state.tables[step.table]
        const fMap = state.fields[step.table]
        const rowId = state.rows[step.rowKey]
        const query = {
          sort: step.sort.map((s) => ({
            fieldId: fMap[s.field],
            direction: s.direction,
          })),
        }
        const neighbors = await service.getRecordNeighbors(
          { tableId, rowId, query },
          ctx("neighbors")
        )
        assert.equal(neighbors.found, true)
        assert.equal(neighbors.previousId, state.rows[step.expectPrevKey])
        assert.equal(neighbors.nextId, state.rows[step.expectNextKey])
        const idx = await service.getRowIndex(
          { tableId, rowId, query },
          ctx("row-index")
        )
        assert.equal(idx, step.expectIndex)
      } else if (step.op === "groupRows") {
        const tableId = state.tables[step.table]
        const fMap = state.fields[step.table]
        const res = await service.groupRows(
          {
            tableId,
            query: {},
            groupBy: step.groupBy.map((k) => fMap[k]),
            aggregates: [],
            projection: {
              fields: step.projection.map((k) => fMap[k]),
              resolveRelations: [],
            },
            groupLimit: 20,
            rowsPerGroup: 10,
          },
          ctx("group-rows")
        )
        const counts = Object.fromEntries(
          res.groups.map((g) => [String(g.key[0]), g.count])
        )
        assert.deepEqual(counts, step.expectGroupCounts)
      } else if (step.op === "staleRevisionUpdate") {
        const tableId = state.tables[step.table]
        const fMap = state.fields[step.table]
        const rowId = state.rows[step.rowKey]
        let caughtCode = null
        try {
          await service.mutateRows(
            {
              tableId,
              expectedRevision: "0",
              changes: [
                {
                  kind: "update",
                  rowId,
                  values: { [fMap.score]: 1 },
                },
              ],
            },
            ctx("stale-update")
          )
        } catch (err) {
          caughtCode = err?.code ?? null
        }
        assert.equal(caughtCode, step.expectErrorCode)
      } else if (step.op === "updateRow") {
        const tableId = state.tables[step.table]
        const fMap = state.fields[step.table]
        const rowId = state.rows[step.rowKey]
        const res = await service.mutateRows(
          {
            tableId,
            expectedRevision: state.revision,
            changes: [
              {
                kind: "update",
                rowId,
                values: Object.fromEntries(
                  Object.entries(step.values).map(([k, v]) => [fMap[k], v])
                ),
              },
            ],
          },
          ctx("update-row")
        )
        state.revision = res.revision
        assert.equal(res.changed, true)
      } else if (step.op === "deleteAndRevertRow") {
        const tableId = state.tables[step.table]
        const rowId = state.rows[step.rowKey]
        const delFn = service.mutateRowsWithUndo ?? service.mutateRows
        const del = await delFn.call(
          service,
          {
            tableId,
            expectedRevision: state.revision,
            changes: [{ kind: "delete", rowId }],
          },
          ctx("delete-row")
        )
        state.revision = del.revision
        assert.ok(del.undoToken, "delete must return undoToken")
        const aggAfterDel = await service.aggregate(
          { tableId, items: [{ key: "n", op: "count-all" }] },
          ctx("count-after-delete")
        )
        assert.equal(aggAfterDel.results[0].value, step.expectCountAfterDelete)
        const revFn = service.revertRowDeletion ?? service.revertMutation
        const rev = await revFn.call(
          service,
          { undoToken: del.undoToken, expectedRevision: state.revision },
          ctx("revert-row")
        )
        state.revision = rev.revision
        const aggAfterRev = await service.aggregate(
          { tableId, items: [{ key: "n", op: "count-all" }] },
          ctx("count-after-revert")
        )
        assert.equal(aggAfterRev.results[0].value, step.expectCountAfterRevert)
      } else if (step.op === "mutateViewLifecycle") {
        const tableId = state.tables[step.table]
        const created = await service.mutateView(
          {
            expectedRevision: state.revision,
            changes: [
              {
                kind: "create-view",
                clientKey: "v1",
                tableId,
                name: step.viewName,
                type: step.viewType,
                query: {},
                layout: {},
                position: "0",
              },
              {
                kind: "create-view",
                clientKey: "v2",
                tableId,
                name: `${step.viewName} Secondary`,
                type: step.viewType,
                query: {},
                layout: {},
                position: "1",
              },
            ],
          },
          ctx("create-view")
        )
        state.revision = created.revision
        const viewId = created.createdViews.find(
          (v) => v.clientKey === "v2"
        ).viewId
        const updated = await service.mutateView(
          {
            expectedRevision: state.revision,
            changes: [
              {
                kind: "update-view",
                viewId,
                patch: { name: `${step.viewName} Updated` },
              },
            ],
          },
          ctx("update-view")
        )
        state.revision = updated.revision
        const deleted = await service.mutateView(
          {
            expectedRevision: state.revision,
            changes: [{ kind: "delete-view", viewId }],
          },
          ctx("delete-view")
        )
        state.revision = deleted.revision
      } else if (step.op === "previewFormula") {
        const tableId = state.tables[step.table]
        const res = await service.previewFormula(
          {
            tableId,
            candidateName: step.candidateName ?? "Computed",
            sourceText: step.sourceText,
            declaredResultType: step.declaredResultType,
          },
          ctx("preview-formula")
        )
        assert.equal(
          res.valid,
          step.expectValid,
          `previewFormula diagnostics: ${JSON.stringify(res.diagnostics)}`
        )
        if (step.expectValues) {
          assert.deepEqual(
            res.rows.map((r) => r.value),
            step.expectValues
          )
        }
      } else if (step.op === "convertField") {
        const tableId = state.tables[step.table]
        const fMap = state.fields[step.table]
        const fieldId = fMap[step.field]
        const change = {
          kind: "convert-field",
          fieldId,
          to: step.to,
          toNullable: step.toNullable,
        }
        const plan = await service.preflightSchema(
          { change, expectedRevision: state.revision },
          ctx("preflight-convert")
        )
        assert.equal(plan.classification, step.expectClassification)
        const res = await service.mutateSchema(
          {
            planToken: plan.planToken,
            expectedRevision: state.revision,
            actionsHash: plan.actionsHash,
          },
          ctx("apply-convert")
        )
        state.revision = res.revision
        const page = await service.queryRows(
          {
            tableId,
            query: {},
            projection: { fields: [fieldId], resolveRelations: [] },
            limit: 10,
          },
          ctx("verify-convert")
        )
        assert.deepEqual(
          page.rows.map((r) => r.values[0]),
          step.expectValuesAfter
        )
      } else {
        throw new Error(`Unknown conformance op: ${step.op}`)
      }
    }
  } finally {
    await handle.close()
  }
}

const tempDir = await fs.mkdtemp(
  path.join(os.tmpdir(), `eidos-conformance-${backendArg}-`)
)
let passed = 0
try {
  for (const testCase of suite.cases) {
    const started = performance.now()
    await runCase(testCase, tempDir)
    const elapsed = (performance.now() - started).toFixed(1)
    console.log(`  ✓ [${backendArg}] ${testCase.id} (${elapsed} ms)`)
    passed++
  }
  console.log(
    `\nConformance passed (${backendArg}): ${passed}/${suite.cases.length}`
  )
} finally {
  await fs.rm(tempDir, { recursive: true, force: true })
}
