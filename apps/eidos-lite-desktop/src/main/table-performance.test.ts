import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"

import type { EidosFileRow } from "@eidos.space/eidos-file"
import { createEidosFile } from "@eidos.space/eidos-file/node-sqlite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { EIDOS_LITE_PERFORMANCE_BUDGET_MS } from "../shared/performance-contract"
import {
  openEidosLiteFileRuntime,
  type EidosLiteFileRuntime,
} from "../runtime/eidos-file-runtime"

const performanceEnabled = process.env.EIDOS_LITE_RUN_PERFORMANCE === "1"
const MILLION_ROWS = 1_000_000
const FIXTURE_BATCH_SIZE = 5_000

function rowId(index: number): string {
  return `00000000-0000-7000-8000-${index.toString(16).padStart(12, "0")}`
}

async function timed<T>(operation: () => Promise<T>): Promise<{
  value: T
  durationMs: number
}> {
  const startedAt = performance.now()
  const value = await operation()
  return { value, durationMs: performance.now() - startedAt }
}

function percentile(values: number[], fraction: number): number {
  const ordered = [...values].sort((left, right) => left - right)
  return ordered[
    Math.min(ordered.length - 1, Math.ceil(ordered.length * fraction) - 1)
  ]!
}

describe.runIf(performanceEnabled)(
  "Eidos Lite million-row table operations",
  () => {
    let root: string
    let filePath: string
    let fixturePreparationMs = 0
    let opened: EidosLiteFileRuntime
    let millionTableId: string
    let smallTableId: string
    let nameFieldId: string
    let categoryFieldId: string
    let scoreFieldId: string
    let statusFieldId: string

    beforeAll(async () => {
      root = await fs.mkdtemp(
        path.join(os.tmpdir(), "eidos-lite-table-performance-")
      )
      filePath = path.join(root, "million-row-table.eidos")
      const fixtureStartedAt = performance.now()
      const runtime = createEidosFile(filePath, { title: "Million-row table" })
      try {
        const million = runtime.importTable(
          {
            name: "Million rows",
            fields: [
              { name: "Name", type: "text", isRecordLabel: true },
              { name: "Category", type: "text" },
              { name: "Score", type: "number" },
              { name: "Status", type: "text" },
            ],
          },
          []
        )
        const small = runtime.importTable(
          {
            name: "Small table",
            fields: [{ name: "Name", type: "text", isRecordLabel: true }],
          },
          Array.from({ length: 100 }, (_, index) => ({
            _id: rowId(MILLION_ROWS + index),
            Name: `Small ${index}`,
          }))
        )
        runtime.connection.transaction(() => {
          for (
            let start = 0;
            start < MILLION_ROWS;
            start += FIXTURE_BATCH_SIZE
          ) {
            const rows: EidosFileRow[] = Array.from(
              { length: Math.min(FIXTURE_BATCH_SIZE, MILLION_ROWS - start) },
              (_, batchIndex) => {
                const index = start + batchIndex
                return {
                  _id: rowId(index),
                  Name:
                    index === MILLION_ROWS - 1
                      ? "Needle million"
                      : `Record ${String(index).padStart(7, "0")}`,
                  Category: `Category ${index % 20}`,
                  Score: index,
                  Status: `Status ${index % 4}`,
                }
              }
            )
            runtime.appendImportedRows(million.id, rows)
          }
        })
        millionTableId = million.id
        smallTableId = small.id
      } finally {
        runtime.close()
      }
      fixturePreparationMs = performance.now() - fixtureStartedAt

      const openedResult = await timed(() => openEidosLiteFileRuntime(filePath))
      opened = openedResult.value
      const table = opened.initialSnapshot.tables.find(
        (candidate) => candidate.table.id === millionTableId
      )!
      const fieldId = (name: string) =>
        table.fields.find((field) => field.name === name)!.id
      nameFieldId = fieldId("Name")
      categoryFieldId = fieldId("Category")
      scoreFieldId = fieldId("Score")
      statusFieldId = fieldId("Status")

      console.info(
        JSON.stringify({
          benchmark: "table-million-fixture",
          fixturePreparationMs,
          fileBytes: (await fs.stat(filePath)).size,
          openMs: openedResult.durationMs,
          rows: MILLION_ROWS,
        })
      )
      expect(openedResult.durationMs).toBeLessThanOrEqual(
        EIDOS_LITE_PERFORMANCE_BUDGET_MS.tableOpenMillionRows
      )
      expect(table.rowCount).toBe(MILLION_ROWS)
    }, 120_000)

    afterAll(async () => {
      await opened?.close().catch(() => undefined)
      await fs.rm(root, { recursive: true, force: true })
    })

    const projection = () => ({
      columns: [nameFieldId, categoryFieldId, scoreFieldId, statusFieldId],
      fieldLimit: 4,
      includeRecordLabel: true,
      includeRelationDisplays: false,
    })

    it("opens and switches tables without scanning unrelated rows", async () => {
      const firstPage = await timed(() =>
        opened.source.getPage(
          millionTableId,
          0,
          100,
          {},
          MILLION_ROWS,
          undefined,
          projection()
        )
      )
      const smallPage = await timed(() =>
        opened.source.getPage(smallTableId, 0, 100, {}, 100)
      )
      const switchedBack = await timed(() =>
        opened.source.getPage(
          millionTableId,
          0,
          100,
          {},
          MILLION_ROWS,
          undefined,
          projection()
        )
      )

      console.info(
        JSON.stringify({
          benchmark: "table-million-open-switch",
          firstPageMs: firstPage.durationMs,
          smallTableMs: smallPage.durationMs,
          switchedBackMs: switchedBack.durationMs,
        })
      )
      expect(firstPage.value.rows).toHaveLength(100)
      expect(smallPage.value.rows).toHaveLength(100)
      expect(switchedBack.value.rows).toHaveLength(100)
      for (const durationMs of [
        firstPage.durationMs,
        smallPage.durationMs,
        switchedBack.durationMs,
      ]) {
        expect(durationMs).toBeLessThanOrEqual(
          EIDOS_LITE_PERFORMANCE_BUDGET_MS.tableSwitchMillionRows
        )
      }
    })

    it("loads middle and final viewports without materializing prior pages", async () => {
      const middle = await timed(() =>
        opened.source.getPage(
          millionTableId,
          500_000,
          100,
          {},
          MILLION_ROWS,
          undefined,
          projection()
        )
      )
      const deep = await timed(() =>
        opened.source.getPage(
          millionTableId,
          915_000,
          100,
          {},
          MILLION_ROWS,
          undefined,
          projection()
        )
      )
      const finalPage = await timed(() =>
        opened.source.getPage(
          millionTableId,
          MILLION_ROWS - 100,
          100,
          {},
          MILLION_ROWS,
          undefined,
          projection()
        )
      )

      console.info(
        JSON.stringify({
          benchmark: "table-million-deep-scroll",
          middleMs: middle.durationMs,
          deepMs: deep.durationMs,
          finalPageMs: finalPage.durationMs,
        })
      )
      expect(middle.value.offset).toBe(500_000)
      expect(deep.value.offset).toBe(915_000)
      expect(finalPage.value.offset).toBe(MILLION_ROWS - 100)
      for (const durationMs of [
        middle.durationMs,
        deep.durationMs,
        finalPage.durationMs,
      ]) {
        expect(durationMs).toBeLessThanOrEqual(
          EIDOS_LITE_PERFORMANCE_BUDGET_MS.tableDeepPageMillionRows
        )
      }
    })

    it("bounds million-row search, filter, and sort interactions", async () => {
      const search = await timed(() =>
        opened.source.getPage(
          millionTableId,
          0,
          100,
          { search: "Needle million", searchFields: [nameFieldId] },
          undefined,
          undefined,
          projection()
        )
      )
      const filter = await timed(() =>
        opened.source.getPage(
          millionTableId,
          0,
          100,
          {
            filter: {
              type: "group",
              conjunction: "and",
              children: [
                {
                  type: "rule",
                  field: categoryFieldId,
                  operator: "equals",
                  value: "Category 7",
                },
              ],
            },
          },
          undefined,
          undefined,
          projection()
        )
      )
      const sort = await timed(() =>
        opened.source.getPage(
          millionTableId,
          0,
          100,
          { sorts: [{ field: scoreFieldId, direction: "desc" }] },
          MILLION_ROWS,
          undefined,
          projection()
        )
      )

      console.info(
        JSON.stringify({
          benchmark: "table-million-query",
          searchMs: search.durationMs,
          filterMs: filter.durationMs,
          sortMs: sort.durationMs,
          searchRows: search.value.total,
          filterRows: filter.value.total,
        })
      )
      expect(search.value.total).toBe(1)
      expect(filter.value.total).toBe(50_000)
      expect(sort.value.rows).toHaveLength(100)
      expect(search.durationMs).toBeLessThanOrEqual(
        EIDOS_LITE_PERFORMANCE_BUDGET_MS.tableSearchMillionRows
      )
      expect(filter.durationMs).toBeLessThanOrEqual(
        EIDOS_LITE_PERFORMANCE_BUDGET_MS.tableFilterMillionRows
      )
      expect(sort.durationMs).toBeLessThanOrEqual(
        EIDOS_LITE_PERFORMANCE_BUDGET_MS.tableSortMillionRows
      )
    })

    it("keeps local row mutations responsive", async () => {
      const firstPage = await opened.source.getPage(
        millionTableId,
        0,
        20,
        {},
        MILLION_ROWS,
        undefined,
        projection()
      )
      const mutationDurationsMs: number[] = []
      for (let index = 0; index < 20; index += 1) {
        const id = String(firstPage.rows[index]!._id)
        const mutation = await timed(() =>
          opened.source.updateRow(millionTableId, id, {
            [statusFieldId]: `Edited ${index % 4}`,
          })
        )
        mutationDurationsMs.push(mutation.durationMs)
      }
      const insertedRowIds: string[] = []
      const insertDurationsMs: number[] = []
      for (let index = 0; index < 20; index += 1) {
        const inserted = await timed(() =>
          opened.source.insertRow(millionTableId, {
            [nameFieldId]: `Performance inserted row ${index + 1}`,
            [categoryFieldId]: `Category ${index % 20}`,
            [scoreFieldId]: MILLION_ROWS + index + 1,
            [statusFieldId]: `Status ${index % 4}`,
          })
        )
        insertedRowIds.push(String(inserted.value.row._id))
        insertDurationsMs.push(inserted.durationMs)
      }
      const deleteDurationsMs: number[] = []
      for (const insertedRowId of insertedRowIds) {
        const deleted = await timed(() =>
          opened.source.deleteRows(millionTableId, [insertedRowId])
        )
        deleteDurationsMs.push(deleted.durationMs)
      }
      const updateP95Ms = percentile(mutationDurationsMs, 0.95)
      const insertP95Ms = percentile(insertDurationsMs, 0.95)
      const deleteP95Ms = percentile(deleteDurationsMs, 0.95)

      console.info(
        JSON.stringify({
          benchmark: "table-million-mutations",
          rowMutationP50Ms: percentile(mutationDurationsMs, 0.5),
          rowMutationP95Ms: updateP95Ms,
          insertRowP50Ms: percentile(insertDurationsMs, 0.5),
          insertRowP95Ms: insertP95Ms,
          deleteRowP50Ms: percentile(deleteDurationsMs, 0.5),
          deleteRowP95Ms: deleteP95Ms,
        })
      )
      expect(updateP95Ms).toBeLessThanOrEqual(
        EIDOS_LITE_PERFORMANCE_BUDGET_MS.tableRowMutationP95
      )
      expect(insertP95Ms).toBeLessThanOrEqual(
        EIDOS_LITE_PERFORMANCE_BUDGET_MS.tableRowMutationP95
      )
      expect(deleteP95Ms).toBeLessThanOrEqual(
        EIDOS_LITE_PERFORMANCE_BUDGET_MS.tableRowMutationP95
      )
    }, 15_000)

    it("separates metadata edits from physical SQLite schema migrations", async () => {
      const renamed = await timed(() =>
        opened.source.updateField(millionTableId, statusFieldId, {
          name: "Status label",
        })
      )
      const addField = await timed(() =>
        opened.source.addField(millionTableId, {
          name: "Performance note",
          type: "text",
        })
      )
      const addedField = addField.value.tables
        .find((table) => table.table.id === millionTableId)!
        .fields.find((field) => field.name === "Performance note")!
      const deleteField = await timed(() =>
        opened.source.deleteField(millionTableId, addedField.id!)
      )

      console.info(
        JSON.stringify({
          benchmark: "table-million-schema-mutations",
          renameFieldMs: renamed.durationMs,
          addPhysicalFieldMs: addField.durationMs,
          deletePhysicalFieldMs: deleteField.durationMs,
        })
      )
      expect(renamed.durationMs).toBeLessThanOrEqual(
        EIDOS_LITE_PERFORMANCE_BUDGET_MS.tableMetadataMutationMillionRows
      )
      expect(addField.durationMs).toBeLessThanOrEqual(
        EIDOS_LITE_PERFORMANCE_BUDGET_MS.tablePhysicalSchemaMutationMillionRows
      )
      expect(deleteField.durationMs).toBeLessThanOrEqual(
        EIDOS_LITE_PERFORMANCE_BUDGET_MS.tablePhysicalSchemaMutationMillionRows
      )
    }, 15_000)

    it("converts Text and Select metadata without rewriting a million rows", async () => {
      const toSelect = await timed(() =>
        opened.source.updateField(millionTableId, statusFieldId, {
          type: "select",
        })
      )
      const selectField = toSelect.value.tables
        .find((table) => table.table.id === millionTableId)!
        .fields.find((field) => field.id === statusFieldId)
      const toText = await timed(() =>
        opened.source.updateField(millionTableId, statusFieldId, {
          type: "text",
        })
      )
      const textField = toText.value.tables
        .find((table) => table.table.id === millionTableId)!
        .fields.find((field) => field.id === statusFieldId)

      console.info(
        JSON.stringify({
          benchmark: "table-million-text-select",
          toSelectMs: toSelect.durationMs,
          toTextMs: toText.durationMs,
        })
      )
      expect(selectField?.type).toBe("select")
      expect(textField?.type).toBe("text")
      expect(toSelect.durationMs).toBeLessThanOrEqual(
        EIDOS_LITE_PERFORMANCE_BUDGET_MS.tableTextSelectConversionMillionRows
      )
      expect(toText.durationMs).toBeLessThanOrEqual(
        EIDOS_LITE_PERFORMANCE_BUDGET_MS.tableMetadataMutationMillionRows
      )
    })

    it("rewrites a million stored values without adapter result materialization", async () => {
      const converted = await timed(() =>
        opened.source.updateField(millionTableId, scoreFieldId, {
          type: "text",
        })
      )
      const score = converted.value.tables
        .find((table) => table.table.id === millionTableId)!
        .fields.find((field) => field.id === scoreFieldId)

      console.info(
        JSON.stringify({
          benchmark: "field-conversion-million-rewrite",
          numberToTextMs: converted.durationMs,
        })
      )
      expect(score?.type).toBe("text")
      expect(converted.durationMs).toBeLessThanOrEqual(
        EIDOS_LITE_PERFORMANCE_BUDGET_MS.fieldConversionRewriteMillionRows
      )
    }, 90_000)
  }
)
