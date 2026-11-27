import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  createEidosLiteFileRuntime,
  openEidosLiteFileRuntime,
} from "./eidos-file-runtime"
import {
  createShadowRuntimeClient,
  openRustRuntimeService,
  type ShadowDiffRecord,
} from "./rust-runtime-adapter"

describe("Eidos Lite dual Runtime (JS vs Rust N-API)", () => {
  let tempDir: string
  let filePath: string

  let tableId: string
  let nameFieldId: string
  let scoreFieldId: string
  let doneFieldId: string

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-dual-rt-"))
    filePath = path.join(tempDir, "dual-test.eidos")
    const created = await createEidosLiteFileRuntime(filePath, "Dual Test")
    tableId = created.initialSnapshot.tables[0]!.table.id
    let snap = await created.source.addField(tableId, {
      name: "Score",
      type: "number",
    })
    snap = await created.source.addField(tableId, {
      name: "Done",
      type: "checkbox",
    })
    const fields = snap.tables[0]!.fields
    nameFieldId = fields.find((f) => f.isRecordLabel)!.id
    scoreFieldId = fields.find((f) => f.name === "Score")!.id
    doneFieldId = fields.find((f) => f.name === "Done")!.id
    await created.source.insertRow(tableId, {
      [nameFieldId]: "Alpha",
      [scoreFieldId]: 90,
      [doneFieldId]: true,
    })
    await created.source.insertRow(tableId, {
      [nameFieldId]: "Beta",
      [scoreFieldId]: 45,
      [doneFieldId]: false,
    })
    await created.source.insertRow(tableId, {
      [nameFieldId]: "Gamma",
      [scoreFieldId]: 75,
      [doneFieldId]: true,
    })
    await created.close()
  })

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
  })

  it("opens and queries through EidosRuntimeEditorDataSource on the Rust backend with parity", async () => {
    const prev = process.env.EIDOS_LITE_RUNTIME_BACKEND
    try {
      process.env.EIDOS_LITE_RUNTIME_BACKEND = "js"
      const jsRt = await openEidosLiteFileRuntime(filePath, { readOnly: true })
      const jsPage = await jsRt.source.getPage(tableId, 0, 10, {
        sorts: [{ field: scoreFieldId, direction: "desc" }],
      })
      await jsRt.close()

      process.env.EIDOS_LITE_RUNTIME_BACKEND = "rust"
      const rustRt = await openEidosLiteFileRuntime(filePath, {
        readOnly: true,
      })
      const rustPage = await rustRt.source.getPage(tableId, 0, 10, {
        sorts: [{ field: scoreFieldId, direction: "desc" }],
      })
      await rustRt.close()

      expect(rustPage.rows.map((r) => r[nameFieldId])).toEqual(
        jsPage.rows.map((r) => r[nameFieldId])
      )
      expect(rustPage.rows.map((r) => r[scoreFieldId])).toEqual([90, 75, 45])
      expect(rustPage.rows.map((r) => r[doneFieldId])).toEqual([
        true,
        true,
        false,
      ])
    } finally {
      if (prev === undefined) delete process.env.EIDOS_LITE_RUNTIME_BACKEND
      else process.env.EIDOS_LITE_RUNTIME_BACKEND = prev
    }
  })

  it.each(["js", "rust"])(
    "cancels a queued read and releases its ID in %s",
    async (backend) => {
      const previous = process.env.EIDOS_LITE_RUNTIME_BACKEND
      process.env.EIDOS_LITE_RUNTIME_BACKEND = backend
      try {
        const session = await openEidosLiteFileRuntime(filePath, {
          readOnly: true,
        })
        try {
          const runtime = session.source.runtime
          const request = {
            tableId,
            items: [{ key: "n", op: "count-all" as const }],
          }
          const ctx = { requestId: "cancel-before-dispatch" }
          const rejected = expect(
            runtime.aggregate(request, ctx)
          ).rejects.toMatchObject({ code: "cancelled" })
          await runtime.cancel(ctx)
          await rejected
          expect(
            (await runtime.aggregate(request, ctx)).results[0]
          ).toMatchObject({ value: "3" })
        } finally {
          await session.close()
        }
      } finally {
        if (previous === undefined)
          delete process.env.EIDOS_LITE_RUNTIME_BACKEND
        else process.env.EIDOS_LITE_RUNTIME_BACKEND = previous
      }
    }
  )

  it.each(["js", "rust"])(
    "rejects invalid CSV cells atomically and preserves record indexes in %s",
    async (backend) => {
      const copy = path.join(tempDir, `csv-${backend}.eidos`)
      await fs.copyFile(filePath, copy)
      const previous = process.env.EIDOS_LITE_RUNTIME_BACKEND
      process.env.EIDOS_LITE_RUNTIME_BACKEND = backend
      try {
        const session = await openEidosLiteFileRuntime(copy)
        try {
          const runtime = session.source.runtime
          const columns = [
            { csvIndex: 0, fieldId: nameFieldId },
            { csvIndex: 1, fieldId: scoreFieldId },
            { csvIndex: 2, fieldId: doneFieldId },
          ]
          const ctx = { requestId: "csv" }
          const expectedRevision = (await runtime.getSnapshot({}, ctx)).revision
          const run = (content: string) =>
            runtime.importCsv!(
              {
                tableId,
                columns,
                expectedRevision,
                hasHeader: true,
                csv: new TextEncoder().encode(content),
              },
              ctx
            )
          for (const invalid of ["bad,invalid,true", "bad,90,yes"]) {
            await expect(
              run(`Name,Score,Done\nok,1,true\n${invalid}\n`)
            ).rejects.toMatchObject({ code: "invalid-value" })
            expect((await runtime.getSnapshot({}, ctx)).revision).toBe(
              expectedRevision
            )
          }
          const result = await run(
            "Name,Score,Done\nfirst,2,true\nwrong,width\nsecond,3,false\n"
          )
          expect(result.createdRows.map((row) => row.recordIndex)).toEqual([
            1, 2,
          ])
        } finally {
          await session.close()
        }
      } finally {
        if (previous === undefined)
          delete process.env.EIDOS_LITE_RUNTIME_BACKEND
        else process.env.EIDOS_LITE_RUNTIME_BACKEND = previous
      }
    }
  )

  it.each(["js", "rust"])(
    "upgrades and restores a legacy saved date filter without losing its original query in %s",
    async (backend) => {
      const copy = path.join(tempDir, `legacy-${backend}.eidos`)
      await fs.copyFile(filePath, copy)
      const { DatabaseSync } = await import("node:sqlite")
      const db = new DatabaseSync(copy)
      const view = db
        .prepare("SELECT id FROM eidos__views WHERE table_id=? LIMIT 1")
        .get(tableId)!
      const field = db
        .prepare(
          "SELECT id FROM eidos__fields WHERE table_id=? AND system_role='created-time'"
        )
        .get(tableId)!
      const viewId = String(view.id)
      const original = {
        filter: {
          op: "calendar-day",
          fieldId: field.id,
          day: "yesterday",
          timeZone: "America/New_York",
          timeZoneData: "2026f",
        },
      }
      try {
        db.prepare("UPDATE eidos__views SET query_json=? WHERE id=?").run(
          JSON.stringify(original),
          viewId
        )
      } finally {
        db.close()
      }
      const previous = process.env.EIDOS_LITE_RUNTIME_BACKEND
      process.env.EIDOS_LITE_RUNTIME_BACKEND = backend
      try {
        const session = await openEidosLiteFileRuntime(copy)
        try {
          const runtime = session.source.runtime
          const ctx = { requestId: "legacy" }
          let revision = (await runtime.getSnapshot({}, ctx)).revision
          for (const kind of [
            "upgrade-date-query",
            "restore-date-query",
          ] as const) {
            const result = await runtime.mutateView(
              {
                expectedRevision: revision,
                calendarQueryVersion: 2,
                changes: [{ kind, viewId }],
              },
              ctx
            )
            expect(result.changed).toBe(true)
            revision = result.revision
            const page = await runtime.getSchemaPage(
              { revision, limit: 100, calendarQueryVersion: 2 },
              ctx
            )
            const saved = page.objects.find(
              (o) => o.object === "view" && o.id === viewId
            )
            expect(saved).toMatchObject({
              queryStatus:
                kind === "upgrade-date-query" ? "supported" : "unsupported",
              query:
                kind === "upgrade-date-query"
                  ? {
                      filter: {
                        op: "calendar-period",
                        fieldId: field.id,
                        unit: "day",
                        offset: -1,
                      },
                    }
                  : original,
              layout: {
                "space.eidos/date-query-upgrade": {
                  version: 2,
                  originalQuery: original,
                },
              },
            })
          }
        } finally {
          await session.close()
        }
      } finally {
        if (previous === undefined)
          delete process.env.EIDOS_LITE_RUNTIME_BACKEND
        else process.env.EIDOS_LITE_RUNTIME_BACKEND = previous
      }
    }
  )

  it.each(["js", "rust"])(
    "preserves files containing a newer formula function in %s",
    async (backend) => {
      const copy = path.join(tempDir, `future-${backend}.eidos`)
      await fs.copyFile(filePath, copy)
      const previous = process.env.EIDOS_LITE_RUNTIME_BACKEND
      const ctx = { requestId: "future-function" }
      try {
        process.env.EIDOS_LITE_RUNTIME_BACKEND = "js"
        const fixture = await openEidosLiteFileRuntime(copy)
        let formulaId: string
        try {
          const service = fixture.source.runtime
          const { revision } = await service.getSnapshot({}, ctx)
          const plan = await service.preflightSchema(
            {
              expectedRevision: revision,
              change: {
                kind: "create-field",
                tableId,
                field: {
                  kind: "formula",
                  clientKey: "future",
                  name: "Future",
                  position: "3",
                  definition: {
                    sourceText: '"Score" + 1',
                    resultType: "number",
                  },
                },
              },
            },
            ctx
          )
          const created = await service.mutateSchema(
            {
              expectedRevision: revision,
              planToken: plan.planToken,
              actionsHash: plan.actionsHash,
            },
            ctx
          )
          formulaId = created.createdObjects.find(
            (o) =>
              o.object === "field" &&
              "clientKey" in o &&
              o.clientKey === "future"
          )!.id
        } finally {
          await fixture.close()
        }
        const { DatabaseSync } = await import("node:sqlite")
        const db = new DatabaseSync(copy)
        try {
          db.prepare(
            "UPDATE eidos__formula_fields SET source_text='FUTURE_NUMBER()' WHERE field_id=?"
          ).run(formulaId)
          db.exec("UPDATE eidos__meta SET revision=revision+1")
        } finally {
          db.close()
        }
        process.env.EIDOS_LITE_RUNTIME_BACKEND = backend
        const reader = await openEidosLiteFileRuntime(copy)
        try {
          const service = reader.source.runtime
          const { revision } = await service.getSnapshot({}, ctx)
          const page = await service.queryRows(
            {
              tableId,
              query: {},
              projection: {
                fields: [scoreFieldId, formulaId],
                resolveRelations: [],
              },
              limit: 5,
            },
            ctx
          )
          expect(page.rows).toHaveLength(3)
          expect(page.rows.every((row) => row.values[1] === null)).toBe(true)
          expect(page.columns.map((c) => [c.writable, c.valueStatus])).toEqual([
            [false, undefined],
            [false, "unsupported-formula"],
          ])
          await expect(
            service.mutateRows(
              {
                tableId,
                expectedRevision: revision,
                changes: [{ kind: "create", clientKey: "blocked", values: {} }],
              },
              ctx
            )
          ).rejects.toMatchObject({ code: "unsupported" })
          expect((await service.getSnapshot({}, ctx)).revision).toBe(revision)
        } finally {
          await reader.close()
        }
      } finally {
        if (previous === undefined)
          delete process.env.EIDOS_LITE_RUNTIME_BACKEND
        else process.env.EIDOS_LITE_RUNTIME_BACKEND = previous
      }
    }
  )

  it.each(["js", "rust"])(
    "waits for an external revision and reports the last seen revision on timeout in %s",
    async (backend) => {
      const copy = path.join(tempDir, `snapshot-${backend}.eidos`)
      await fs.copyFile(filePath, copy)
      const previous = process.env.EIDOS_LITE_RUNTIME_BACKEND
      process.env.EIDOS_LITE_RUNTIME_BACKEND = backend
      try {
        const reader = await openEidosLiteFileRuntime(copy, { readOnly: true })
        const writer = await openEidosLiteFileRuntime(copy)
        try {
          const ctx = { requestId: "revision" }
          const { revision } = await reader.source.runtime.getSnapshot({}, ctx)
          const minimumRevision = String(BigInt(revision) + 1n)
          const pending = reader.source.runtime.getSnapshot(
            { minimumRevision },
            ctx
          )
          await new Promise((resolve) => setTimeout(resolve, 20))
          await writer.source.runtime.mutateRows(
            {
              tableId,
              expectedRevision: revision,
              changes: [
                {
                  kind: "create",
                  clientKey: "next",
                  values: { [nameFieldId]: "later" },
                },
              ],
            },
            ctx
          )
          expect((await pending).revision).toBe(minimumRevision)
          await expect(
            reader.source.runtime.getSnapshot(
              { minimumRevision: String(BigInt(minimumRevision) + 1n) },
              { ...ctx, deadlineMilliseconds: 25 }
            )
          ).rejects.toMatchObject({
            code: "deadline-exceeded",
            currentRevision: minimumRevision,
          })
        } finally {
          await writer.close()
          await reader.close()
        }
      } finally {
        if (previous === undefined)
          delete process.env.EIDOS_LITE_RUNTIME_BACKEND
        else process.env.EIDOS_LITE_RUNTIME_BACKEND = previous
      }
    }
  )

  it("interrupts a running SQLite read on cancellation or deadline and keeps the session usable", async () => {
    const copy = path.join(tempDir, "interruptible.eidos")
    await fs.copyFile(filePath, copy)
    const { DatabaseSync } = await import("node:sqlite")
    const db = new DatabaseSync(copy)
    try {
      db.exec(
        "CREATE VIEW slow_rows AS WITH RECURSIVE seq(n) AS (VALUES(0) UNION ALL SELECT n+1 FROM seq WHERE n<100000000) SELECT n AS _id FROM seq"
      )
      db.prepare(
        "UPDATE eidos__tables SET physical_name='slow_rows', name='slow_rows' WHERE id=?"
      ).run(tableId)
    } finally {
      db.close()
    }
    const client = openRustRuntimeService(copy, true)
    const ctx = { requestId: "running-read" }
    const request = {
      tableId,
      items: [{ key: "total", op: "count-all" as const }],
    }
    try {
      const cancelled = expect(
        client.aggregate(request, ctx)
      ).rejects.toMatchObject({ code: "cancelled" })
      await new Promise((resolve) => setTimeout(resolve, 20))
      await client.cancel(ctx)
      await cancelled
      await expect(
        client.aggregate(request, { ...ctx, deadlineMilliseconds: 15 })
      ).rejects.toMatchObject({ code: "deadline-exceeded" })
      await expect(client.getSnapshot({}, ctx)).resolves.toHaveProperty(
        "fileId"
      )
    } finally {
      await client.close(ctx)
    }
  })

  it("preserves record navigation beyond the first page and destructive schema checks in both modes", async () => {
    const testFile = path.join(tempDir, "compat.eidos")
    await fs.copyFile(filePath, testFile)
    const previous = process.env.EIDOS_LITE_RUNTIME_BACKEND
    try {
      let target = ""
      let neighbor = ""
      for (const backend of ["rust", "js"]) {
        process.env.EIDOS_LITE_RUNTIME_BACKEND = backend
        const session = await openEidosLiteFileRuntime(testFile)
        const service = session.source.runtime
        const ctx = { requestId: "compat" }
        try {
          let revision = String(session.initialSnapshot.metadata.revision)
          if (!target) {
            for (let start = 0; start < 1002; start += 500) {
              const result = await service.mutateRows(
                {
                  tableId,
                  expectedRevision: revision,
                  changes: Array.from(
                    { length: Math.min(500, 1002 - start) },
                    (_, i) => ({
                      kind: "create" as const,
                      clientKey: String(start + i),
                      values: {
                        [nameFieldId]: String(start + i),
                        [scoreFieldId]: start + i + 100,
                      },
                    })
                  ),
                },
                ctx
              )
              revision = result.revision
              if (start === 1000)
                [target, neighbor] = result.created.map((row) => row.rowId) as [
                  string,
                  string,
                ]
            }
          }
          const request = {
            tableId,
            rowId: target,
            query: {
              sort: [{ fieldId: scoreFieldId, direction: "asc" as const }],
            },
          }
          expect(await service.getRowIndex!(request, ctx)).toBe("1003")
          expect(await service.getRecordNeighbors(request, ctx)).toMatchObject({
            found: true,
            nextId: neighbor,
          })
          const plan = await service.preflightSchema(
            {
              expectedRevision: revision,
              change: { kind: "delete-field", fieldId: scoreFieldId },
            },
            ctx
          )
          expect(plan.classification).toBe("explicit-lossy")
          expect(plan.affectedRows).toBe("1005")
          expect(plan.dependencies).toContainEqual({
            object: "field",
            id: scoreFieldId,
          })
          await expect(
            service.mutateSchema(
              {
                expectedRevision: revision,
                actionsHash: plan.actionsHash,
                planToken: plan.planToken,
              },
              ctx
            )
          ).rejects.toMatchObject({ code: "lossy-confirmation-required" })
          expect(
            (
              await service.aggregate(
                {
                  tableId,
                  items: [
                    { op: "count", key: "filled", fieldId: scoreFieldId },
                    { op: "max", key: "largest", fieldId: scoreFieldId },
                  ],
                },
                ctx
              )
            ).results
          ).toEqual([
            { key: "filled", value: "1005" },
            { key: "largest", value: 1101 },
          ])
          if (backend === "rust") {
            await service.mutateView(
              {
                expectedRevision: revision,
                changes: [
                  {
                    kind: "create-view",
                    clientKey: "filtered",
                    tableId,
                    name: "Filtered",
                    type: "grid",
                    position: "9",
                    query: {
                      filter: { op: "eq", fieldId: doneFieldId, value: true },
                    },
                    layout: {},
                  },
                ],
              },
              ctx
            )
          }
          const snapshot = await service.getSnapshot({}, ctx)
          const blocked = await service.preflightSchema(
            {
              expectedRevision: snapshot.revision,
              change: { kind: "delete-field", fieldId: doneFieldId },
            },
            ctx
          )
          expect(blocked.classification).toBe("forbidden")
          expect(blocked.dependencies).toEqual(
            expect.arrayContaining([
              expect.objectContaining({ object: "view" }),
            ])
          )
        } finally {
          await session.close()
        }
      }
    } finally {
      if (previous === undefined) delete process.env.EIDOS_LITE_RUNTIME_BACKEND
      else process.env.EIDOS_LITE_RUNTIME_BACKEND = previous
    }
  })

  it("selects the native runtime for new and reopened files and honors the desktop fallback", async () => {
    const previous = process.env.EIDOS_LITE_RUNTIME_BACKEND
    const file = path.join(tempDir, "backend.eidos")
    const backend = async (
      session: Awaited<ReturnType<typeof openEidosLiteFileRuntime>>
    ) => {
      try {
        const result = await session.source.runtime.negotiate(
          { protocol: "eidos-runtime", versions: ["1.0"] },
          { requestId: "backend" }
        )
        return Reflect.get(result.capabilities, "backend")
      } finally {
        await session.close()
      }
    }
    try {
      delete process.env.EIDOS_LITE_RUNTIME_BACKEND
      expect(
        await backend(await createEidosLiteFileRuntime(file, "Backend"))
      ).toBe("rust")
      expect(
        await backend(await openEidosLiteFileRuntime(file, { readOnly: true }))
      ).toBe("rust")
      process.env.EIDOS_LITE_RUNTIME_BACKEND = "js"
      expect(await backend(await openEidosLiteFileRuntime(file))).not.toBe(
        "rust"
      )
    } finally {
      if (previous === undefined) delete process.env.EIDOS_LITE_RUNTIME_BACKEND
      else process.env.EIDOS_LITE_RUNTIME_BACKEND = previous
    }
  })

  it("mutates rows and persists through Rust backend, readable back by JS backend", async () => {
    const mutPath = path.join(tempDir, "dual-write.eidos")
    await fs.copyFile(filePath, mutPath)
    const prev = process.env.EIDOS_LITE_RUNTIME_BACKEND
    try {
      process.env.EIDOS_LITE_RUNTIME_BACKEND = "rust"
      const rustRt = await openEidosLiteFileRuntime(mutPath)
      const added = await rustRt.source.insertRow(tableId, {
        [nameFieldId]: "RustInserted",
        [scoreFieldId]: 123.5,
        [doneFieldId]: true,
      })
      expect(added.row._id).toBeTruthy()
      await rustRt.close()

      process.env.EIDOS_LITE_RUNTIME_BACKEND = "js"
      const jsRt = await openEidosLiteFileRuntime(mutPath, { readOnly: true })
      const page = await jsRt.source.getPage(tableId, 0, 20, {})
      const names = page.rows.map((r) => r[nameFieldId])
      expect(names).toContain("RustInserted")
      const inserted = page.rows.find((r) => r[nameFieldId] === "RustInserted")
      expect(inserted?.[scoreFieldId]).toBe(123.5)
      expect(inserted?.[doneFieldId]).toBe(true)
      await jsRt.close()
    } finally {
      if (prev === undefined) delete process.env.EIDOS_LITE_RUNTIME_BACKEND
      else process.env.EIDOS_LITE_RUNTIME_BACKEND = prev
    }
  })

  it("verifies zero diffs in shadow mode across snapshot, query, aggregate, and validate", async () => {
    const { randomBytes } = await import("node:crypto")
    const { DatabaseSync } = await import("node:sqlite")
    const { Runtime } = await import("@eidos.space/eidos-file")
    const { NodeSqliteConnectionPort } =
      await import("@eidos.space/eidos-file/node-sqlite")

    const diffs: ShadowDiffRecord[] = []
    const db = new DatabaseSync(filePath, {
      allowExtension: false,
      defensive: true,
      enableDoubleQuotedStringLiterals: false,
      enableForeignKeyConstraints: true,
      readOnly: true,
      timeout: 5_000,
    })
    const port = new NodeSqliteConnectionPort(db, { readOnly: true })
    const binding = await Runtime.open(
      port,
      {
        clock: {
          nowInstant: () => new Date().toISOString(),
          nowMilliseconds: () => performance.now(),
        },
        entropy: { randomBytes: (n) => new Uint8Array(randomBytes(n)) },
      },
      "read",
      {
        cancellation: { cancelled: () => false, onCancel: () => () => {} },
      }
    )
    const rustClient = openRustRuntimeService(filePath, true)
    const shadow = createShadowRuntimeClient(
      binding.service,
      rustClient,
      (record) => diffs.push(record)
    )
    const ctx = { requestId: "shadow-1", deadlineMilliseconds: 30_000 }
    await shadow.getSnapshot({}, ctx)
    await shadow.queryRows(
      {
        tableId,
        query: {},
        projection: { fields: [scoreFieldId], resolveRelations: [] },
        limit: 10,
      },
      ctx
    )
    await shadow.aggregate(
      {
        tableId,
        items: [
          { key: "total", op: "count-all" },
          { key: "sum", op: "sum", fieldId: scoreFieldId },
        ],
      },
      ctx
    )
    await shadow.validate({ level: "full", diagnosticsLimit: 50 }, ctx)
    await shadow.close(ctx)
    port.close()

    expect(diffs.length).toBe(4)
    for (const d of diffs) {
      expect(d.matched, `Mismatch in ${d.method}: ${d.diffSummary}`).toBe(true)
    }
  })
})
