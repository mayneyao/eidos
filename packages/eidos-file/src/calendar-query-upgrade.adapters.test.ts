import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { tmpdir } from "node:os"
import { DatabaseSync } from "node:sqlite"
import Database from "better-sqlite3"
import { describe, expect, it } from "vitest"
import fixture from "../test-fixtures/date-queries-v1.json"
import { BetterSqlite3ConnectionPort } from "./better-sqlite3"
import { NodeSqliteConnectionPort } from "./node-sqlite"
import { SQLiteWasmConnectionPort } from "./sqlite-wasm"
import { Runtime } from "./runtime-service"
import {
  EIDOS_FILE_DATE_QUERY_UPGRADE_RECEIPT as receiptKey,
  upgradeEidosFileDateQuery,
} from "./calendar-query-upgrade"
import type { ConnectionPort } from "./adapter-contract"
import type {
  RuntimeService,
  RowQuery,
  ViewDescriptor,
  ViewChange,
} from "./runtime-contract"

let sequence = 0
const context = () => ({ requestId: `date-upgrade-${sequence++}` })
const probe = new DatabaseSync(":memory:")
const supportsNode =
  "serialize" in probe &&
  "limits" in probe &&
  typeof probe.setAuthorizer === "function"
probe.close()
async function open(
  adapter: string,
  access: "read" | "readwrite" = "readwrite",
  seed?: (port: ConnectionPort) => void
) {
  const bytes = await readFile(
    new URL("../test-fixtures/date-queries-v1.eidos", import.meta.url)
  )
  let port: ConnectionPort, directory: string | undefined
  if (adapter === "better-sqlite3")
    port = new BetterSqlite3ConnectionPort(new Database(bytes))
  else if (adapter === "node-sqlite") {
    directory = await mkdtemp(join(tmpdir(), "eidos-date-upgrade-"))
    const file = join(directory, "fixture.eidos")
    await writeFile(file, bytes)
    port = new NodeSqliteConnectionPort(new DatabaseSync(file))
  } else {
    Object.defineProperty(globalThis, "self", {
      configurable: true,
      value: globalThis,
    })
    const { default: initialize } = await import("@sqlite.org/sqlite-wasm")
    const pkg = createRequire(
      new URL("../package.json", import.meta.url)
    ).resolve("@sqlite.org/sqlite-wasm/package.json")
    const wasmBinary = await readFile(
      join(dirname(pkg), "sqlite-wasm/jswasm/sqlite3.wasm")
    )
    const sqlite = await initialize({
      print: () => {},
      printErr: () => {},
      wasmBinary,
    } as Parameters<typeof initialize>[0] & { wasmBinary: Uint8Array })
    const path = `/date-upgrade-${sequence++}.eidos`
    sqlite.capi.sqlite3_js_posix_create_file(path, new Uint8Array(bytes))
    port = new SQLiteWasmConnectionPort(new sqlite.oo1.DB(path, "w"), sqlite)
  }
  let entropy = 100,
    tick = 0
  seed?.(port)
  const runtime = (
    await Runtime.open(
      port,
      {
        clock: {
          nowInstant: () => "2026-11-12T12:30:00.000Z",
          nowMilliseconds: () => tick++,
        },
        entropy: {
          randomBytes: (length) =>
            Uint8Array.from({ length }, () => entropy++ & 255),
        },
      },
      access,
      { cancellation: { cancelled: () => false, onCancel: () => () => {} } }
    ).catch(async (error) => {
      port.close()
      if (directory) await rm(directory, { recursive: true, force: true })
      throw error
    })
  ).service
  const close = async () => {
    await runtime.close(context())
    port.close()
    if (directory) await rm(directory, { recursive: true, force: true })
  }
  return { runtime, close }
}
const viewId = (key: string) =>
  fixture.views.find((view) => view.clientKey === key)!.viewId
async function schema(runtime: RuntimeService) {
  const snapshot = await runtime.getSnapshot({}, context())
  const page = await runtime.getSchemaPage(
    { revision: snapshot.revision, limit: 100, calendarQueryVersion: 2 },
    context()
  )
  return {
    revision: snapshot.revision,
    features: page.objects.filter((item) => item.object === "feature"),
    views: page.objects.filter(
      (item): item is ViewDescriptor => item.object === "view"
    ),
  }
}
async function mutate(runtime: RuntimeService, changes: ViewChange[]) {
  return runtime.mutateView(
    {
      expectedRevision: (await runtime.getSnapshot({}, context())).revision,
      calendarQueryVersion: 2,
      changes,
    },
    context()
  )
}
for (const adapter of ["better-sqlite3", "wasm", "node-sqlite"])
  describe.skipIf(adapter === "node-sqlite" && !supportsNode)(
    `date query upgrade on ${adapter}`,
    () => {
      it("checks required features on both open modes, preserves optional features and bounds identity query scans", async () => {
        for (const access of ["read", "readwrite"] as const) {
          await expect(
            open(adapter, access, (port) => {
              // Construct capability fixtures before a Runtime owns the connection.
              port.run(
                "INSERT INTO eidos__features VALUES ('x__probe__future','9',1,'{}')",
                []
              )
            })
          ).rejects.toMatchObject({ code: "corrupt-file" })
          await expect(
            open(adapter, access, (port) => {
              port.run(
                `UPDATE eidos__views SET query_json='{"filter":{"op":"calendar-period","fieldId":"${fixture.date}","unit":"day","offset":0}}' WHERE id='${viewId("day")}'`,
                []
              )
            })
          ).rejects.toMatchObject({ code: "corrupt-file" })
          const { runtime, close } = await open(adapter, access, (port) => {
            port.run(
              "INSERT INTO eidos__features VALUES ('x__probe__future','9',0,'{}')",
              []
            )
            const query = port.query.bind(port)
            port.query = (sql, bindings) => {
              if (
                /SELECT id, query_json FROM eidos__views/i.test(sql) &&
                !/LIMIT \?/i.test(sql)
              )
                throw new Error("Unbounded identity scan")
              return query(sql, bindings)
            }
          })
          try {
            expect((await schema(runtime)).features).toEqual([
              {
                object: "feature",
                name: "x__probe__future",
                version: "9",
                required: false,
                config: {},
              },
            ])
            if (access === "readwrite") {
              await mutate(runtime, [
                {
                  kind: "update-view",
                  viewId: viewId("day"),
                  patch: { name: "Metadata edit preserves optional feature" },
                },
              ])
              expect((await schema(runtime)).features).toHaveLength(1)
            }
          } finally {
            await close()
          }
        }
      }, 30_000)
      it("retains old queries, upgrades atomically, preserves recovery through edits/copies and restores explicitly", async () => {
        const { runtime, close } = await open(adapter)
        try {
          const initial = await schema(runtime)
          expect(initial.features).toEqual([])
          const old = initial.views.find(
            (view) => view.id === viewId("relative")
          )!
          expect(old.queryStatus).toBe("unsupported")
          expect(
            (
              await runtime.negotiate(
                { protocol: "eidos-runtime", versions: ["1.0"] },
                context()
              )
            ).capabilities
          ).toMatchObject({
            calendarQueryVersion: 2,
            calendarPeriodTimeZoneData: ["2026f"],
          })
          const request = {
            tableId: fixture.tableId,
            query: old.query as RowQuery,
            projection: { fields: [fixture.label], resolveRelations: [] },
            limit: 20,
          }
          await expect(
            runtime.queryRows(request, context())
          ).rejects.toMatchObject({ code: "unsupported" })
          await expect(
            mutate(runtime, [
              { kind: "update-view", viewId: old.id, patch: { query: {} } },
            ])
          ).rejects.toMatchObject({ code: "unsupported" })
          await mutate(runtime, [
            {
              kind: "update-view",
              viewId: old.id,
              patch: { name: "Renamed old" },
            },
          ])
          expect(
            (await schema(runtime)).views.find((view) => view.id === old.id)!
              .query
          ).toEqual(old.query)
          await mutate(runtime, [
            { kind: "upgrade-date-query", viewId: old.id },
          ])
          let updated = (await schema(runtime)).views.find(
            (view) => view.id === old.id
          )!
          expect(
            (await runtime.getSnapshot({}, context())).schemaCounts.features
          ).toBe("1")
          expect((await schema(runtime)).features).toEqual([
            {
              object: "feature",
              name: "eidos:calendar-query",
              version: "2",
              required: true,
              config: {},
            },
          ])
          expect(updated.queryStatus).toBe("supported")
          expect(updated.query).toEqual(
            upgradeEidosFileDateQuery(old.query).query
          )
          expect(updated.layout).toMatchObject({
            "x.example": { preserved: true },
            rowHeight: 32,
            [receiptKey]: { originalQuery: old.query, version: 2 },
          })
          const receipt = updated.layout[receiptKey]
          expect(JSON.stringify(updated.query)).not.toMatch(/timeZone|2026f/)
          const calendar = {
            timeZone: "America/New_York",
            timeZoneData: "2026f",
            weekStartsOn: 1 as const,
          }
          expect(
            (
              await runtime.queryRows(
                { ...request, query: updated.query, calendar },
                context()
              )
            ).rows.map((row) => row.values[0])
          ).toEqual(["previous"])
          const retry = await mutate(runtime, [
            { kind: "upgrade-date-query", viewId: old.id },
          ])
          expect(retry.changed).toBe(false)
          await mutate(runtime, [
            {
              kind: "update-view",
              viewId: old.id,
              patch: { name: "Updated", layout: { rowHeight: 48 } },
            },
          ])
          updated = (await schema(runtime)).views.find(
            (view) => view.id === old.id
          )!
          expect(updated.layout[receiptKey]).toEqual(receipt)
          const copy = await mutate(runtime, [
            {
              kind: "create-view",
              clientKey: "copy",
              tableId: old.tableId,
              name: "Copy",
              type: old.type,
              query: updated.query,
              layout: updated.layout,
              position: "10",
            },
          ])
          expect(
            (await schema(runtime)).views.find(
              (view) => view.id === copy.createdViews[0]!.viewId
            )!.layout[receiptKey]
          ).toEqual(receipt)
          await mutate(runtime, [
            { kind: "restore-date-query", viewId: old.id },
          ])
          updated = (await schema(runtime)).views.find(
            (view) => view.id === old.id
          )!
          expect(updated).toMatchObject({
            queryStatus: "unsupported",
            query: old.query,
            layout: { [receiptKey]: receipt },
          })
          expect((await schema(runtime)).features).toHaveLength(1)
          await expect(
            runtime.queryRows(
              { ...request, query: updated.query, calendar },
              context()
            )
          ).rejects.toMatchObject({ code: "unsupported" })
          await mutate(runtime, [
            { kind: "upgrade-date-query", viewId: old.id },
          ])
          expect(
            (await schema(runtime)).views.find((view) => view.id === old.id)!
              .layout[receiptKey]
          ).toEqual(receipt)
        } finally {
          await close()
        }
      }, 30_000)
      it("projects per consuming client and blocks undeclared query replacement without leaking schema cursors", async () => {
        const { runtime, close } = await open(adapter)
        try {
          await mutate(runtime, [
            { kind: "upgrade-date-query", viewId: viewId("relative") },
          ])
          const current = await schema(runtime)
          const supported = current.views.find(
            (view) => view.id === viewId("relative")
          )!
          const legacy = await runtime.getSchemaPage(
            { revision: current.revision, limit: 100 },
            context()
          )
          expect(
            legacy.objects.find(
              (item) => item.object === "view" && item.id === supported.id
            )
          ).toMatchObject({
            queryStatus: "unsupported",
            query: supported.query,
          })
          for (const query of [
            {},
            { sort: [{ fieldId: fixture.label, direction: "asc" as const }] },
          ]) {
            await expect(
              runtime.mutateView(
                {
                  expectedRevision: current.revision,
                  changes: [
                    {
                      kind: "update-view",
                      viewId: supported.id,
                      patch: { query },
                    },
                  ],
                },
                context()
              )
            ).rejects.toMatchObject({ code: "unsupported" })
          }
          const first = await runtime.getSchemaPage(
            { revision: current.revision, limit: 1, calendarQueryVersion: 2 },
            context()
          )
          await expect(
            runtime.getSchemaPage(
              {
                revision: current.revision,
                limit: 100,
                cursor: first.nextCursor!,
              },
              context()
            )
          ).rejects.toMatchObject({ code: "invalid-query" })
          await runtime.getSchemaPage(
            {
              revision: current.revision,
              limit: 100,
              cursor: first.nextCursor!,
              calendarQueryVersion: 2,
            },
            context()
          )
          // Metadata remains editable by old consumers; the original query survives.
          await runtime.mutateView(
            {
              expectedRevision: current.revision,
              changes: [
                {
                  kind: "update-view",
                  viewId: supported.id,
                  patch: { name: "Legacy metadata edit" },
                },
              ],
            },
            context()
          )
          const after = await schema(runtime)
          expect(
            after.views.find((view) => view.id === supported.id)!.query
          ).toEqual(supported.query)
          await expect(
            runtime.mutateView(
              {
                expectedRevision: after.revision,
                changes: [
                  { kind: "upgrade-date-query", viewId: viewId("day") },
                  {
                    kind: "update-view",
                    viewId: supported.id,
                    patch: { query: {} },
                  },
                ],
              },
              context()
            )
          ).rejects.toMatchObject({ code: "unsupported" })
          expect(await schema(runtime)).toEqual(after)
          await mutate(runtime, [{ kind: "delete-view", viewId: supported.id }])
          expect((await schema(runtime)).features).toHaveLength(1)
        } finally {
          await close()
        }
      }, 30_000)
      it("rolls back an entire multi-view upgrade when a recovery receipt is too large", async () => {
        const { runtime, close } = await open(adapter)
        try {
          const before = await schema(runtime)
          await expect(
            mutate(runtime, [
              { kind: "upgrade-date-query", viewId: viewId("relative") },
              { kind: "upgrade-date-query", viewId: viewId("large") },
            ])
          ).rejects.toMatchObject({ code: "resource-limit" })
          expect(await schema(runtime)).toEqual(before)
          await expect(
            runtime.mutateView(
              {
                expectedRevision: "0",
                changes: [
                  { kind: "upgrade-date-query", viewId: viewId("day") },
                ],
              },
              context()
            )
          ).rejects.toMatchObject({ code: "stale-revision" })
          expect(await schema(runtime)).toEqual(before)
        } finally {
          await close()
        }
      }, 30_000)
      it("refuses upgrades on a read-only Runtime without modifying the query", async () => {
        const { runtime, close } = await open(adapter, "read")
        try {
          const before = await schema(runtime)
          await expect(
            mutate(runtime, [
              { kind: "upgrade-date-query", viewId: viewId("day") },
            ])
          ).rejects.toMatchObject({ code: "unsupported" })
          expect(await schema(runtime)).toEqual(before)
        } finally {
          await close()
        }
      }, 30_000)
    }
  )
