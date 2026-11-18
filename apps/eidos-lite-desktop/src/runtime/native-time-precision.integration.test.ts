import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "node:os"
import { describe, expect, it, vi } from "vitest"
import { createFsMetaEidosFile } from "./fs-meta-file"
import { openEidosLiteFileRuntime } from "./eidos-file-runtime"

describe.skipIf(process.env.EIDOS_LITE_RUN_NATIVE_TIME_PRECISION !== "1")(
  "native timestamp ordering",
  () => {
    it.each(["created-time", "last-edited-time"])(
      "locates and traverses native %s values without converting them to API literals",
      async (role) => {
        const root = await mkdtemp(path.join(tmpdir(), "eidos-native-time-"))
        let opened:
          | Awaited<ReturnType<typeof openEidosLiteFileRuntime>>
          | undefined
        try {
          const native = path.join(root, "native")
          await mkdir(native)
          for (const [index, fraction] of [
            0.123001, 0.123002, 0.123002, 0.123999, 0.124001, 0.124999,
          ].entries()) {
            const file = path.join(native, `记录-${index}.md`)
            await writeFile(file, "fixture")
            await utimes(
              file,
              1_700_000_000 + fraction,
              1_700_000_000 + fraction
            )
          }
          const catalog = path.join(root, "catalog.eidos")
          createFsMetaEidosFile(catalog, { root: "native", customFields: [] })
          opened = await openEidosLiteFileRuntime(catalog)
          const table = opened.initialSnapshot.tables[0]!
          const field = table.fields.find(
            (f) =>
              f.systemRole === role ||
              (role === "last-edited-time" && f.systemRole === "updated-time")
          )!
          const id = table.fields.find((f) => f.systemRole === "row-id")!
          expect(field).toBeDefined()
          const query = {
            sorts: [
              { field: field.id, direction: "desc" as const },
              { field: id.id, direction: "asc" as const },
            ],
          }
          const all = await opened.source.getPage(table.table.id, 0, 100, query)
          if (process.env.EIDOS_NATIVE_TIME_EVIDENCE)
            await writeFile(
              path.join(
                process.env.EIDOS_NATIVE_TIME_EVIDENCE,
                `native-${role}-shape.json`
              ),
              JSON.stringify(
                { field, rows: all.rows },
                (_key, value) =>
                  typeof value === "bigint" ? value.toString() : value,
                2
              )
            )
          expect(all.rows).toHaveLength(6)
          expect(
            all.rows.some((row) =>
              /\.\d{4,9}(?:Z|[+-]\d{2}:\d{2})$/.test(String(row[field.id]))
            )
          ).toBe(true)
          const aggregate = vi.spyOn(opened.source.runtime, "aggregate")
          const ids = all.rows.map((row) => String(row._id))
          const paged: string[] = []
          for (let offset = 0; offset < 6; offset += 2) {
            const page = await opened.source.getPage(
              table.table.id,
              offset,
              2,
              query
            )
            paged.push(...page.rows.map((row) => String(row._id)))
          }
          expect(paged).toEqual(ids)
          expect(new Set(paged).size).toBe(6)
          for (const [index, rowId] of ids.entries()) {
            expect(
              await opened.source.getRecordNeighbors(
                table.table.id,
                rowId,
                query
              )
            ).toEqual({
              found: true,
              previousId: ids[index - 1] ?? null,
              nextId: ids[index + 1] ?? null,
            })
          }
          aggregate.mockClear()
          for (const [index, rowId] of ids.entries()) {
            try {
              expect(
                await opened.source.getRowIndex(table.table.id, rowId, query)
              ).toBe(index)
            } catch (cause) {
              if (process.env.EIDOS_NATIVE_TIME_EVIDENCE)
                await writeFile(
                  path.join(
                    process.env.EIDOS_NATIVE_TIME_EVIDENCE,
                    `candidate-native-${role}-failure.json`
                  ),
                  JSON.stringify(
                    {
                      role,
                      method: "getRowIndex",
                      query,
                      rows: all.rows,
                      aggregates: aggregate.mock.calls,
                      error:
                        cause instanceof Error
                          ? { message: cause.message, stack: cause.stack }
                          : cause,
                    },
                    (_key, value) =>
                      typeof value === "bigint" ? value.toString() : value,
                    2
                  )
                )
              throw cause
            }
          }
          expect(aggregate).not.toHaveBeenCalled()
          const wireQuery = {
            sort: [
              { fieldId: field.id, direction: "desc" as const },
              { fieldId: id.id, direction: "asc" as const },
            ],
          }
          let request = 0
          const ctx = () => ({ requestId: `native-page-${++request}` })
          let page = await opened.source.runtime.queryRows(
            {
              tableId: table.table.id,
              query: wireQuery,
              projection: { fields: [field.id], resolveRelations: [] },
              limit: 2,
            },
            ctx()
          )
          const forward = page.rows.map((row) => row.id)
          while (page.nextCursor) {
            page = await opened.source.runtime.queryRows(
              {
                tableId: table.table.id,
                query: wireQuery,
                projection: { fields: [field.id], resolveRelations: [] },
                limit: 2,
                cursor: page.nextCursor,
              },
              ctx()
            )
            forward.push(...page.rows.map((row) => row.id))
            expect(forward.length).toBeLessThanOrEqual(6)
          }
          expect(forward).toEqual(ids)
          let backward = page.rows.map((row) => row.id)
          while (page.previousCursor) {
            page = await opened.source.runtime.queryRows(
              {
                tableId: table.table.id,
                query: wireQuery,
                projection: { fields: [field.id], resolveRelations: [] },
                limit: 2,
                cursor: page.previousCursor,
                direction: "backward",
              },
              ctx()
            )
            backward = [...page.rows.map((row) => row.id), ...backward]
            expect(backward.length).toBeLessThanOrEqual(6)
          }
          expect(backward).toEqual(ids)
          const boundaryResults: Array<{ spelling: string; ids: string[] }> = []
          for (const spelling of [
            "2023-11-14T22:13:20.124Z",
            "2023-11-15T06:13:20.124+08:00",
          ]) {
            const boundary = await opened.source.getPage(
              table.table.id,
              0,
              20,
              {
                ...query,
                filter: {
                  type: "group",
                  conjunction: "and",
                  children: [
                    {
                      type: "rule",
                      field: field.id,
                      operator: "greater-than",
                      value: spelling,
                    },
                  ],
                },
              }
            )
            boundaryResults.push({
              spelling,
              ids: boundary.rows.map((row) => String(row._id)),
            })
          }
          if (process.env.EIDOS_NATIVE_TIME_EVIDENCE)
            await writeFile(
              path.join(
                process.env.EIDOS_NATIVE_TIME_EVIDENCE,
                `native-${role}-filter-boundaries.json`
              ),
              JSON.stringify(
                { expected: ["记录-5.md", "记录-4.md"], boundaryResults },
                null,
                2
              )
            )
          for (const result of boundaryResults)
            expect(result.ids).toEqual(["记录-5.md", "记录-4.md"])
          for (const [op, expected] of [
            ["gte", ids.slice(0, 2)],
            ["lt", ids.slice(2)],
            ["lte", ids.slice(2)],
            ["eq", []],
            ["ne", ids],
          ] as const) {
            const filtered = {
              ...wireQuery,
              filter: {
                op,
                fieldId: field.id,
                value: "2023-11-14T22:13:20.124Z",
              },
            }
            const selected = await opened.source.runtime.queryRows(
              {
                tableId: table.table.id,
                query: filtered,
                projection: { fields: [field.id], resolveRelations: [] },
                limit: 20,
              },
              ctx()
            )
            expect(selected.rows.map((row) => row.id)).toEqual(expected)
            const aggregate = await opened.source.runtime.aggregate(
              {
                tableId: table.table.id,
                query: filtered,
                items: [{ key: "count", op: "count-all" }],
              },
              ctx()
            )
            expect(aggregate.results).toEqual([
              { key: "count", value: String(expected.length) },
            ])
            for (const [index, rowId] of expected.entries()) {
              expect(
                await opened.source.runtime.getRowIndex!(
                  { tableId: table.table.id, rowId, query: filtered },
                  ctx()
                )
              ).toBe(String(index))
              expect(
                await opened.source.runtime.getRecordNeighbors(
                  { tableId: table.table.id, rowId, query: filtered },
                  ctx()
                )
              ).toEqual({
                found: true,
                previousId: expected[index - 1] ?? null,
                nextId: expected[index + 1] ?? null,
              })
            }
          }
          for (const filter of [
            {
              op: "calendar-period" as const,
              fieldId: field.id,
              unit: "day" as const,
              offset: 0 as const,
            },
            {
              op: "calendar-window" as const,
              fieldId: field.id,
              unit: "week" as const,
              direction: "past" as const,
              count: 1,
            },
          ]) {
            const selected = await opened.source.runtime.queryRows(
              {
                tableId: table.table.id,
                calendar: {
                  timeZone: "UTC",
                  timeZoneData: "2026f",
                  weekStartsOn: 1,
                },
                referenceInstant: "2023-11-14T23:00:00.000Z",
                query: { ...wireQuery, filter },
                projection: { fields: [field.id], resolveRelations: [] },
                limit: 20,
              },
              ctx()
            )
            expect(selected.rows.map((row) => row.id)).toEqual(ids)
          }
          await expect(
            opened.source.runtime.getRowIndex!(
              {
                tableId: table.table.id,
                rowId: ids[0]!,
                query: {
                  filter: {
                    op: "gt",
                    fieldId: field.id,
                    value: "2024-01-01T00:00:00.000Z",
                  },
                },
              },
              ctx()
            )
          ).resolves.toBeNull()
          await expect(
            opened.source.runtime.getRowIndex!(
              {
                tableId: table.table.id,
                rowId: ids[0]!,
                query: {
                  filter: {
                    op: "gt",
                    fieldId: field.id,
                    value: "2023-11-14T22:13:20.123456Z",
                  },
                },
              },
              ctx()
            )
          ).rejects.toMatchObject({ code: "invalid-value" })
        } finally {
          await opened?.close()
          await rm(root, { recursive: true, force: true })
        }
      }
    )
  }
)
