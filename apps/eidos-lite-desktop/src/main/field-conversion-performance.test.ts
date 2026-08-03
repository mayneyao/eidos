import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"

import type {
  EidosFileFieldType,
  EidosFileRow,
  UpdateEidosFileFieldInput,
} from "@eidos.space/eidos-file"
import { createEidosFile } from "@eidos.space/eidos-file/node-sqlite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { EIDOS_LITE_PERFORMANCE_BUDGET_MS } from "../shared/performance-contract"
import {
  openEidosLiteFileRuntime,
  type EidosLiteFileRuntime,
} from "../runtime/eidos-file-runtime"

const performanceEnabled = process.env.EIDOS_LITE_RUN_PERFORMANCE === "1"
const ROWS = 100_000
const FIXTURE_BATCH_SIZE = 2_000

function rowId(index: number): string {
  return `00000000-0000-7000-9000-${index.toString(16).padStart(12, "0")}`
}

async function timed<T>(operation: () => Promise<T>): Promise<{
  value: T
  durationMs: number
}> {
  const startedAt = performance.now()
  const value = await operation()
  return { value, durationMs: performance.now() - startedAt }
}

async function timedFailure(operation: () => Promise<unknown>): Promise<{
  error: unknown
  durationMs: number
}> {
  const startedAt = performance.now()
  try {
    await operation()
    return {
      error: new Error("Expected the conversion to fail"),
      durationMs: performance.now() - startedAt,
    }
  } catch (error) {
    return { error, durationMs: performance.now() - startedAt }
  }
}

describe.runIf(performanceEnabled)(
  "Eidos Lite 100k-row field conversion matrix",
  () => {
    let root: string
    let basePath: string
    let tableId: string

    beforeAll(async () => {
      root = await fs.mkdtemp(
        path.join(os.tmpdir(), "eidos-lite-conversion-performance-")
      )
      basePath = path.join(root, "conversion-base.eidos")
      const runtime = createEidosFile(basePath, {
        title: "Field conversion performance",
      })
      try {
        const table = runtime.importTable(
          {
            name: "Conversion matrix",
            fields: [
              { name: "Name", type: "text", isRecordLabel: true },
              { name: "Numeric text", type: "text" },
              { name: "Invalid numeric", type: "text" },
              { name: "Amount", type: "number" },
              { name: "Checked", type: "checkbox" },
              { name: "Day", type: "date" },
              { name: "Moment", type: "datetime" },
              {
                name: "Choice",
                type: "select",
                property: {
                  options: Array.from({ length: 4 }, (_, index) => ({
                    name: `Choice ${index}`,
                    color: "purple",
                  })),
                },
              },
              {
                name: "Tags",
                type: "multi-select",
                property: {
                  options: [
                    ...Array.from({ length: 4 }, (_, index) => ({
                      name: `Choice ${index}`,
                      color: "purple",
                    })),
                    { name: "Shared", color: "blue" },
                  ],
                },
              },
              { name: "Website", type: "url" },
              { name: "Rating", type: "rating" },
            ],
          },
          []
        )
        tableId = table.id
        runtime.connection.transaction(() => {
          for (let start = 0; start < ROWS; start += FIXTURE_BATCH_SIZE) {
            const rows: EidosFileRow[] = Array.from(
              { length: Math.min(FIXTURE_BATCH_SIZE, ROWS - start) },
              (_, batchIndex) => {
                const index = start + batchIndex
                const day = String((index % 28) + 1).padStart(2, "0")
                const choice = `Choice ${index % 4}`
                return {
                  _id: rowId(index),
                  Name: `Record ${index}`,
                  "Numeric text": String(index),
                  "Invalid numeric": `0${index}`,
                  Amount: (index % 5) + 0.5,
                  Checked: index % 2,
                  Day: `2026-08-${day}`,
                  Moment: `2026-08-${day}T12:30:00.000Z`,
                  Choice: choice,
                  Tags: JSON.stringify([choice, "Shared"]),
                  Website: `https://eidos.space/records/${index}`,
                  Rating: index % 6,
                }
              }
            )
            runtime.appendImportedRows(table.id, rows)
          }
        })
      } finally {
        runtime.close()
      }
    }, 120_000)

    afterAll(async () => {
      await fs.rm(root, { recursive: true, force: true })
    })

    async function withRuntime<T>(
      name: string,
      operation: (runtime: EidosLiteFileRuntime) => Promise<T>
    ): Promise<T> {
      const casePath = path.join(root, `${name}.eidos`)
      await fs.copyFile(basePath, casePath, fs.constants.COPYFILE_FICLONE)
      const runtime = await openEidosLiteFileRuntime(casePath)
      try {
        return await operation(runtime)
      } finally {
        await runtime.close()
      }
    }

    function fieldId(runtime: EidosLiteFileRuntime, name: string): string {
      return runtime.initialSnapshot.tables
        .find((table) => table.table.id === tableId)!
        .fields.find((field) => field.name === name)!.id!
    }

    async function convert(
      caseName: string,
      sourceName: string,
      changes: UpdateEidosFileFieldInput,
      expectedType: EidosFileFieldType
    ) {
      return withRuntime(caseName, async (runtime) => {
        const id = fieldId(runtime, sourceName)
        const measured = await timed(() =>
          runtime.source.updateField(tableId, id, changes)
        )
        const table = measured.value.tables.find(
          (candidate) => candidate.table.id === tableId
        )!
        expect(table.rowCount).toBe(ROWS)
        expect(table.fields.find((field) => field.id === id)?.type).toBe(
          expectedType
        )
        return measured.durationMs
      })
    }

    it("bounds every user-visible conversion algorithm family", async () => {
      const sharedTextColumnTimings = {
        urlToText: await convert(
          "url-text",
          "Website",
          { type: "text" },
          "text"
        ),
        textToUrl: await convert(
          "text-url",
          "Numeric text",
          { type: "url" },
          "url"
        ),
      }
      const timings = {
        textToNumber: await convert(
          "text-number",
          "Numeric text",
          { type: "number" },
          "number"
        ),
        checkboxToNumber: await convert(
          "checkbox-number",
          "Checked",
          { type: "number" },
          "number"
        ),
        dateToDatetime: await convert(
          "date-datetime",
          "Day",
          { type: "datetime" },
          "datetime"
        ),
        selectToMultiSelect: await convert(
          "select-multi-select",
          "Choice",
          { type: "multi-select" },
          "multi-select"
        ),
        ratingToNumber: await convert(
          "rating-number",
          "Rating",
          { type: "number", confirmLossy: true },
          "number"
        ),
      }

      console.info(
        JSON.stringify({
          benchmark: "field-conversion-100000-lossless",
          ...Object.fromEntries(
            Object.entries(sharedTextColumnTimings).map(
              ([name, durationMs]) => [`${name}Ms`, durationMs]
            )
          ),
          ...Object.fromEntries(
            Object.entries(timings).map(([name, durationMs]) => [
              `${name}Ms`,
              durationMs,
            ])
          ),
        })
      )
      for (const durationMs of Object.values(sharedTextColumnTimings)) {
        expect(durationMs).toBeLessThanOrEqual(
          EIDOS_LITE_PERFORMANCE_BUDGET_MS.tableTextSelectConversionMillionRows
        )
      }
      for (const durationMs of Object.values(timings)) {
        expect(durationMs).toBeLessThanOrEqual(
          EIDOS_LITE_PERFORMANCE_BUDGET_MS.fieldConversionRewriteHundredThousandRows
        )
      }
    }, 120_000)

    it("bounds explicitly lossy conversions after confirmation", async () => {
      const timings = {
        numberToRating: await convert(
          "number-rating",
          "Amount",
          { type: "rating", confirmLossy: true },
          "rating"
        ),
        datetimeToDate: await convert(
          "datetime-date",
          "Moment",
          { type: "date", confirmLossy: true },
          "date"
        ),
        multiSelectToSelect: await convert(
          "multi-select-select",
          "Tags",
          { type: "select", confirmLossy: true },
          "select"
        ),
      }

      console.info(
        JSON.stringify({
          benchmark: "field-conversion-100000-lossy",
          ...Object.fromEntries(
            Object.entries(timings).map(([name, durationMs]) => [
              `${name}Ms`,
              durationMs,
            ])
          ),
        })
      )
      for (const durationMs of Object.values(timings)) {
        expect(durationMs).toBeLessThanOrEqual(
          EIDOS_LITE_PERFORMANCE_BUDGET_MS.fieldConversionLossyHundredThousandRows
        )
      }
    }, 120_000)

    it("rejects incompatible values and File conversion without mutation", async () => {
      const invalid = await withRuntime("invalid-number", async (runtime) => {
        const id = fieldId(runtime, "Invalid numeric")
        return timedFailure(() =>
          runtime.source.updateField(tableId, id, { type: "number" })
        )
      })
      const file = await withRuntime("file-guard", async (runtime) => {
        const id = fieldId(runtime, "Numeric text")
        return timedFailure(() =>
          runtime.source.updateField(tableId, id, { type: "file" })
        )
      })

      console.info(
        JSON.stringify({
          benchmark: "field-conversion-100000-rejected",
          invalidValueMs: invalid.durationMs,
          fileGuardMs: file.durationMs,
        })
      )
      expect(invalid.error).toBeInstanceOf(Error)
      expect(String(invalid.error)).toMatch(/consistently formatted numbers/i)
      expect(invalid.durationMs).toBeLessThanOrEqual(
        EIDOS_LITE_PERFORMANCE_BUDGET_MS.fieldConversionRejectedHundredThousandRows
      )
      expect(file.error).toBeInstanceOf(Error)
      expect(String(file.error)).toMatch(/File fields cannot be converted/i)
      expect(file.durationMs).toBeLessThanOrEqual(
        EIDOS_LITE_PERFORMANCE_BUDGET_MS.fieldConversionImmediateGuard
      )
    })
  }
)
