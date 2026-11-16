import { expect, vi } from "vitest"
import type { ConnectionPort } from "./adapter-contract"
import { ConnectionPortEidosFileConnection } from "./connection-port"
import { initializeEidosFileSchema } from "./schema"
import { EidosFileRuntime } from "./runtime"
import { Runtime } from "./runtime-service"
import type { RuntimeEnvironment } from "./runtime-contract"

export async function expectBoundedRuntimePageReads(
  connection: ConnectionPort
) {
  const clock = "2026-11-16T00:00:00.000Z"
  const database = new ConnectionPortEidosFileConnection(connection)
  initializeEidosFileSchema(database)
  const core = new EidosFileRuntime(database, false, {
    nowInstant: () => clock,
  })
  const table = core.createTable({
    name: "Bounded pages",
    fields: [{ name: "Name", type: "text" }],
  })
  const field = core
    .listFields(table.id)
    .find((value) => value.name === "Name")!
  for (const value of ["delta", null, "alpha", "charlie", "bravo"])
    core.insertRow(table.id, { [field.id!]: value })
  const environment: RuntimeEnvironment = {
    clock: {
      nowInstant: () => clock,
      nowMilliseconds: () => performance.now(),
    },
    entropy: {
      randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
    },
  }
  const binding = await Runtime.open(connection, environment, "read", {
    cancellation: { cancelled: () => false, onCancel: () => () => undefined },
  })
  const service = binding.service
  let sequence = 0
  const context = () => ({
    requestId: `bounded-page-${++sequence}`,
    deadlineMilliseconds: 30000,
  })
  const get = vi.spyOn(connection, "get")
  const counts = () =>
    get.mock.calls.filter(([sql]) =>
      /SELECT count\(\*\) AS count FROM logical/i.test(sql)
    )
  const request = {
    tableId: table.id,
    query: {
      sort: [
        {
          fieldId: field.id!,
          direction: "asc" as const,
          nulls: "last" as const,
        },
      ],
    },
    projection: { fields: [field.id!], resolveRelations: [] },
    limit: 2,
  }
  try {
    const first = await service.queryRows(request, context())
    expect(first.rows.map((row) => row.values)).toEqual([["alpha"], ["bravo"]])
    expect(first.total).toBeUndefined()
    expect(first.nextCursor).toEqual(expect.any(String))
    expect(counts()).toHaveLength(0)
    get.mockClear()
    const second = await service.queryRows(
      { ...request, cursor: first.nextCursor! },
      context()
    )
    expect(second.rows.map((row) => row.values)).toEqual([
      ["charlie"],
      ["delta"],
    ])
    const last = await service.queryRows(
      { ...request, cursor: second.nextCursor! },
      context()
    )
    expect(last.rows.map((row) => row.values)).toEqual([[null]])
    expect(last.nextCursor).toBeNull()
    const previous = await service.queryRows(
      { ...request, cursor: second.previousCursor!, direction: "backward" },
      context()
    )
    expect(previous.rows).toEqual(first.rows)
    const absent = await service.queryRows(
      { ...request, offset: 20 },
      context()
    )
    expect(absent.rows).toEqual([])
    const searched = await service.queryRows(
      { ...request, query: { search: { text: "char", fields: [field.id!] } } },
      context()
    )
    expect(searched.rows.map((row) => row.values)).toEqual([["charlie"]])
    await expect(
      service.queryRows({ ...request, cursor: "invalid" }, context())
    ).rejects.toMatchObject({ code: "invalid-query" })
    expect(counts()).toHaveLength(0)
    get.mockClear()
    const compatibility = core.queryRows(table.id, {
      fields: [field.id!],
      limit: 2,
    })
    expect(compatibility.nextCursor).toEqual(expect.any(String))
    expect(counts()).toHaveLength(1)
    get.mockClear()
    const publicPage = core.getRowPage(table.id, 0, 2)
    expect(publicPage.total).toBe(5)
    expect(counts()).toHaveLength(1)
  } finally {
    get.mockRestore()
    await service.close(context())
  }
}
