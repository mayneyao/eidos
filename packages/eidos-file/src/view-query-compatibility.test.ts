import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import Database from "better-sqlite3"
import { Runtime } from "./runtime-service"
import {
  AdapterTransportRuntimeClient,
  AdapterTransportServer,
  type AdapterTransportChannel,
  type AdapterStructuredCloneCarrier,
} from "./adapter-transport"
import type { RowQuery, RuntimeService } from "./runtime-contract"
import { afterEach, describe, expect, it } from "vitest"

import { createEidosFile, BetterSqlite3ConnectionPort } from "./better-sqlite3"
import { canonicalizeEidosFileJson } from "./canonical-json"
import { EIDOS_FILE_VIEWS_TABLE } from "./constants"

describe("saved View query forward compatibility", () => {
  const roots: string[] = []

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it("opens CLI-shaped saved queries and permits unrelated row writes", () => {
    const root = mkdtempSync(path.join(tmpdir(), "eidos-view-query-cli-"))
    roots.push(root)
    const runtime = createEidosFile(path.join(root, "data.eidos"), {
      defaultTable: {
        name: "Tasks",
        fields: [{ name: "Name", type: "text" }],
      },
    })

    try {
      const table = runtime.schema()[0]!
      const field = table.fields.find((candidate) => candidate.name === "Name")!
      const original = canonicalizeEidosFileJson({
        filter: { fieldId: field.id, op: "eq", value: "Roadmap" },
        sort: [{ direction: "asc", fieldId: field.id }],
      })
      const viewId = runtime.listViews(table.table.id)[0]!.id
      runtime.connection.run(
        `UPDATE ${EIDOS_FILE_VIEWS_TABLE} SET query_json = ? WHERE id = ?`,
        [original, viewId]
      )

      expect(runtime.validate({ level: "full" })).toMatchObject({
        valid: true,
        errors: [],
      })
      const view = runtime.listViews(table.table.id)[0]!
      expect(view.queryStatus).toBe("supported")
      expect(view.filter).toMatchObject({
        children: [
          {
            field: field.id,
            operator: "equals",
            value: "Roadmap",
          },
        ],
      })
      expect(view.sorts).toEqual([
        { direction: "asc", field: field.id, nulls: "last" },
      ])
      expect(
        runtime.insertRow(table.table.id, { Name: "Roadmap" })
      ).toMatchObject({ Name: "Roadmap" })
    } finally {
      runtime.close()
    }
  })

  it("writes new saved queries using the normative Runtime query shape", () => {
    const root = mkdtempSync(path.join(tmpdir(), "eidos-view-query-write-"))
    roots.push(root)
    const runtime = createEidosFile(path.join(root, "data.eidos"), {
      defaultTable: {
        name: "Tasks",
        fields: [{ name: "Name", type: "text" }],
      },
    })

    try {
      const table = runtime.schema()[0]!
      const field = table.fields.find((candidate) => candidate.name === "Name")!
      const view = runtime.createView(table.table.id, {
        name: "Roadmap",
        type: "grid",
        filter: {
          type: "group",
          conjunction: "and",
          children: [
            {
              type: "rule",
              field: field.id!,
              operator: "equals",
              value: "Roadmap",
            },
          ],
        },
        sorts: [{ direction: "asc", field: field.id! }],
      })

      expect(JSON.parse(view.query)).toEqual({
        filter: {
          args: [{ fieldId: field.id, op: "eq", value: "Roadmap" }],
          op: "and",
        },
        sort: [{ direction: "asc", fieldId: field.id }],
      })
      expect(runtime.validate({ level: "full" })).toMatchObject({
        valid: true,
        errors: [],
      })
    } finally {
      runtime.close()
    }
  })

  it("keeps legacy UI-shaped saved queries executable", () => {
    const root = mkdtempSync(path.join(tmpdir(), "eidos-view-query-legacy-"))
    roots.push(root)
    const runtime = createEidosFile(path.join(root, "data.eidos"), {
      defaultTable: {
        name: "Tasks",
        fields: [{ name: "Name", type: "text" }],
      },
    })

    try {
      const table = runtime.schema()[0]!
      const field = table.fields.find((candidate) => candidate.name === "Name")!
      const original = canonicalizeEidosFileJson({
        filter: {
          args: [{ field: field.id, op: "equals", value: "Legacy" }],
          op: "and",
        },
        sort: [{ direction: "asc", field: field.id }],
      })
      const viewId = runtime.listViews(table.table.id)[0]!.id
      runtime.connection.run(
        `UPDATE ${EIDOS_FILE_VIEWS_TABLE} SET query_json = ? WHERE id = ?`,
        [original, viewId]
      )

      expect(runtime.listViews(table.table.id)[0]).toMatchObject({
        queryStatus: "supported",
        query: original,
      })
      expect(runtime.validate({ level: "full" })).toMatchObject({
        valid: true,
        errors: [],
      })
      runtime.insertRow(table.table.id, { Name: "Legacy" })
      expect(runtime.listViews(table.table.id)[0]!.query).toBe(original)
    } finally {
      runtime.close()
    }
  })

  it("preserves unsupported queries and refuses ordinary query replacements", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "eidos-view-query-"))
    roots.push(root)
    const runtime = createEidosFile(path.join(root, "data.eidos"), {
      defaultTable: {
        name: "Tasks",
        fields: [{ name: "Name", type: "text" }],
      },
    })

    try {
      const table = runtime.schema()[0]!
      const field = table.fields.find((candidate) => candidate.name === "Name")!
      const original = canonicalizeEidosFileJson({
        "x.example": {
          flag: true,
          array: [null, 1, "keep"],
          nested: { original: true },
        },
        filter: {
          op: "and",
          args: [
            {
              field: field.id,
              op: "future-smart-match",
              value: "Roadmap",
            },
          ],
        },
      })
      const viewId = runtime.listViews(table.table.id)[0]!.id
      runtime.connection.run(
        `UPDATE ${EIDOS_FILE_VIEWS_TABLE} SET query_json = ? WHERE id = ?`,
        [original, viewId]
      )

      const unsupported = runtime.listViews(table.table.id)[0]!
      expect(unsupported.queryStatus).toBe("unsupported")
      expect(unsupported.query).toBe(original)
      expect(unsupported.filter).toBeNull()
      expect(runtime.validate({ level: "full" })).toMatchObject({
        valid: true,
        warnings: [expect.objectContaining({ code: "view-query-unsupported" })],
      })

      runtime.updateView(viewId, { name: "Renamed" })
      expect(runtime.listViews(table.table.id)[0]!.query).toBe(original)

      runtime.updateView(viewId, { properties: { rowHeight: 40 } })
      expect(runtime.listViews(table.table.id)[0]!.query).toBe(original)
      expect(() => runtime.duplicateView(viewId)).toThrow(
        "saved query from a newer Eidos version"
      )

      expect(() =>
        runtime.updateView(viewId, {
          filter: {
            type: "group",
            conjunction: "and",
            children: [
              {
                type: "rule",
                field: field.id!,
                operator: "equals",
                value: "Roadmap",
              },
            ],
          },
        })
      ).toThrow(/must be upgraded explicitly/)
      expect(runtime.listViews(table.table.id)[0]!.query).toBe(original)
      const port = new BetterSqlite3ConnectionPort(
        new Database(path.join(root, "data.eidos"))
      )
      let clock = 0,
        entropy = 0
      const service = (
        await Runtime.open(
          port,
          {
            clock: {
              nowInstant: () => "2026-11-12T12:30:00.000Z",
              nowMilliseconds: () => clock++,
            },
            entropy: {
              randomBytes: (length) =>
                Uint8Array.from({ length }, () => entropy++ & 255),
            },
          },
          "readwrite",
          { cancellation: { cancelled: () => false, onCancel: () => () => {} } }
        )
      ).service
      try {
        await assertOpaqueQueryWire(
          service,
          table.table.id,
          viewId,
          field.id!,
          JSON.parse(original)
        )
      } finally {
        await service.close({ requestId: "opaque-close" })
        port.close()
      }
    } finally {
      runtime.close()
    }
  })

  it("does not execute a known operator with newer parameter semantics", () => {
    const root = mkdtempSync(path.join(tmpdir(), "eidos-view-query-value-"))
    roots.push(root)
    const runtime = createEidosFile(path.join(root, "data.eidos"), {
      defaultTable: {
        name: "Tasks",
        fields: [{ name: "Due", type: "date" }],
      },
    })

    try {
      const table = runtime.schema()[0]!
      const field = table.fields.find((candidate) => candidate.name === "Due")!
      const original = canonicalizeEidosFileJson({
        filter: {
          op: "and",
          args: [
            {
              field: field.id,
              op: "is-relative-to-today",
              value: { direction: "this", unit: "quarter" },
            },
          ],
        },
      })
      const viewId = runtime.listViews(table.table.id)[0]!.id
      runtime.connection.run(
        `UPDATE ${EIDOS_FILE_VIEWS_TABLE} SET query_json = ? WHERE id = ?`,
        [original, viewId]
      )

      const view = runtime.listViews(table.table.id)[0]!
      expect(view.queryStatus).toBe("unsupported")
      expect(view.filter).toBeNull()
      expect(runtime.validate({ level: "full" })).toMatchObject({
        valid: true,
        warnings: [expect.objectContaining({ code: "view-query-unsupported" })],
      })
    } finally {
      runtime.close()
    }
  })
})

/** Exercise the real Adapter wire with a future query already in the synthetic fixture. */
async function assertOpaqueQueryWire(
  runtime: RuntimeService,
  tableId: string,
  viewId: string,
  fieldId: string,
  original: Record<string, unknown>
) {
  const listeners: Array<
    Set<(carrier: AdapterStructuredCloneCarrier) => void>
  > = [new Set(), new Set()]
  const channel = (side: number): AdapterTransportChannel => ({
    post(carrier) {
      const copy: AdapterStructuredCloneCarrier = {
        envelope: JSON.parse(JSON.stringify(carrier.envelope)),
        buffers: carrier.buffers.map((buffer) => buffer.slice(0)),
      }
      queueMicrotask(() =>
        listeners[1 - side]!.forEach((listener) => listener(copy))
      )
    },
    subscribe(listener) {
      listeners[side]!.add(listener)
      return () => {
        listeners[side]!.delete(listener)
      }
    },
  })
  const clientChannel = channel(0),
    serverChannel = channel(1)
  const server = new AdapterTransportServer(
    (carrier) => serverChannel.post(carrier),
    {
      epoch: "opaque-epoch",
      sessionID: "opaque-session",
      workingID: "opaque-working",
      cancelMode: "interrupt",
      allocateReceiptID: () => "opaque-receipt",
      retainPreparedReceipt: () => {},
      settlePreparedReceipt: () => {},
      closeConnection: () => {},
    }
  )
  serverChannel.subscribe((carrier) => server.receive(carrier))
  server.attachRuntime(runtime)
  const client = await new AdapterTransportRuntimeClient(clientChannel, {
    workingID: "opaque-working",
    retainPreparedReceipt: () => {},
    settlePreparedReceipt: () => {},
  }).connect()
  const snapshot = await client.getSnapshot(
    {},
    { requestId: "opaque-snapshot" }
  )
  const page = await client.getSchemaPage(
    { revision: snapshot.revision, limit: 100 },
    { requestId: "opaque-schema" }
  )
  const view = page.objects.find(
    (item) => item.object === "view" && item.id === viewId
  )
  expect(view).toMatchObject({ queryStatus: "unsupported", query: original })
  if (view?.object !== "view" || view.queryStatus !== "unsupported")
    throw new Error("Expected opaque View")
  expect(view.query).toEqual(original)
  // Deliberately bypass the discriminated public type to test untrusted callers.
  await expect(
    client.queryRows(
      {
        tableId,
        query: view.query as unknown as RowQuery,
        projection: { fields: [fieldId], resolveRelations: [] },
        limit: 20,
      },
      { requestId: "opaque-execute" }
    )
  ).rejects.toMatchObject({ code: "invalid-query" })
  await expect(
    client.mutateView(
      {
        expectedRevision: snapshot.revision,
        changes: [{ kind: "upgrade-date-query", viewId }],
      },
      { requestId: "opaque-upgrade" }
    )
  ).rejects.toMatchObject({ code: "invalid-query" })
  expect(
    (await client.getSnapshot({}, { requestId: "opaque-unchanged" })).revision
  ).toBe(snapshot.revision)
  const again = await client.getSchemaPage(
    { revision: snapshot.revision, limit: 100 },
    { requestId: "opaque-again" }
  )
  expect(
    again.objects.find((item) => item.object === "view" && item.id === viewId)
  ).toMatchObject({ queryStatus: "unsupported", query: original })
}
