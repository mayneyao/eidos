import { expect, vi } from "vitest"
import type { ConnectionPort } from "./adapter-contract"
import { ConnectionPortEidosFileConnection } from "./connection-port"
import { initializeEidosFileSchema } from "./schema"
import { EidosFileRuntime } from "./runtime"
import { Runtime } from "./runtime-service"
import type { RequestContext, RuntimeEnvironment } from "./runtime-contract"

export async function expectQueuedHostReads(connection: ConnectionPort) {
  const database = new ConnectionPortEidosFileConnection(connection)
  initializeEidosFileSchema(database)
  const core = new EidosFileRuntime(database)
  const table = core.createTable({
    name: "Host queue",
    fields: [{ name: "Name", type: "text" }],
  })
  const field = core
    .listFields(table.id)
    .find((value) => value.name === "Name")!
  const row = core.insertRow(table.id, { [field.id!]: "before" })
  let release!: () => void
  let entered!: () => void
  const committed = new Promise<void>((resolve) => {
    release = resolve
  })
  const preparing = new Promise<void>((resolve) => {
    entered = resolve
  })
  let now = 0
  const environment: RuntimeEnvironment = {
    clock: {
      nowInstant: () => "2026-11-16T00:00:00.000Z",
      nowMilliseconds: () => now,
    },
    entropy: {
      randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
    },
    transportCommitBarrier: {
      async prepare() {
        entered()
        await committed
      },
    },
  }
  const binding = await Runtime.open(connection, environment, "readwrite", {
    cancellation: { cancelled: () => false, onCancel: () => () => undefined },
  })
  const service = binding.service
  const queuedRead = binding.hostBridge.queuedRead!
  let sequence = 0
  const context = (): RequestContext => ({
    requestId: `host-read-${++sequence}`,
    deadlineMilliseconds: 30_000,
  })
  const transactions = vi.spyOn(connection, "transaction")
  const seen = vi.fn(() => {
    expect(transactions.mock.calls.at(-1)?.[0]).toBe("read")
    expect(() =>
      connection.run("UPDATE eidos__meta SET title = 'forbidden'")
    ).toThrowError(expect.objectContaining({ code: "read-only" }))
    const page = core.getRowPage(table.id, 0, 1, {}, 1)
    return new Map([["value", page.rows[0]![field.tableColumnName]]])
  })
  try {
    const snapshot = await service.getSnapshot({}, context())
    const write = service.mutateRows(
      {
        tableId: table.id,
        expectedRevision: snapshot.revision,
        changes: [
          {
            kind: "update",
            rowId: String(row._id),
            values: { [field.id!]: "after" },
          },
        ],
      },
      context()
    )
    await preparing
    const read = queuedRead(seen, context())
    const expired = queuedRead(seen, { ...context(), deadlineMilliseconds: 1 })
    const expiry = expect(expired).rejects.toMatchObject({
      code: "deadline-exceeded",
    })
    const cancelled = queuedRead(seen, {
      ...context(),
      signal: { aborted: true, onAbort: () => () => undefined },
    })
    const cancellation = expect(cancelled).rejects.toMatchObject({
      code: "cancelled",
    })
    await Promise.resolve()
    expect(seen).not.toHaveBeenCalled()
    now = 2
    release()
    await write
    expect(await read).toEqual(new Map([["value", "after"]]))
    await expiry
    await cancellation
    expect(seen).toHaveBeenCalledTimes(1)

    const unsafeRead = queuedRead as (
      operation: () => unknown,
      context: RequestContext
    ) => Promise<unknown>
    const escaped = vi.fn()
    await expect(
      unsafeRead(async () => {
        escaped()
        await Promise.resolve()
      }, context())
    ).rejects.toMatchObject({ code: "invalid-request" })
    expect(escaped).not.toHaveBeenCalled()
    const then = vi.fn()
    await expect(unsafeRead(() => ({ then }), context())).rejects.toMatchObject(
      { code: "invalid-request" }
    )
    expect(then).not.toHaveBeenCalled()
    await expect(
      queuedRead(
        () => {
          now += 2
          return "too late"
        },
        { ...context(), deadlineMilliseconds: 1 }
      )
    ).rejects.toMatchObject({ code: "deadline-exceeded" })
    let abort: (() => void) | undefined
    const signal = {
      aborted: false,
      onAbort(callback: () => void) {
        abort = callback
        return () => undefined
      },
    }
    await expect(
      queuedRead(
        () => {
          signal.aborted = true
          abort?.()
          return "cancelled value"
        },
        { ...context(), signal }
      )
    ).rejects.toMatchObject({ code: "cancelled" })
    await expect(
      queuedRead(() => {
        throw {
          code: "invalid-value",
          message: "host fixture failure",
          retryable: false,
        }
      }, context())
    ).rejects.toMatchObject({
      code: "invalid-value",
      message: "host fixture failure",
    })
    expect(await queuedRead(() => "healthy", context())).toBe("healthy")
    await service.close(context())
    await expect(queuedRead(seen, context())).rejects.toMatchObject({
      code: "closed",
    })
    expect(seen).toHaveBeenCalledTimes(1)
  } finally {
    release()
    await service.close(context())
    transactions.mockRestore()
  }
}
