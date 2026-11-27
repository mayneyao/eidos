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
