// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { GridCellKind, type DataEditorProps } from "@glideapps/glide-data-grid"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Runtime } from "../../eidos-file/src/runtime-service"
import { createTestWasmConnection } from "../../eidos-file/src/sqlite-wasm-test-helper"
import { EidosFileDataGrid } from "./eidos-file-data-grid"
import { EidosRuntimeEditorDataSource } from "./runtime-editor-data-source"

const mocks = vi.hoisted(() => ({ props: null as DataEditorProps | null }))

vi.mock("@glideapps/glide-data-grid", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const React = await import("react")
  return {
    ...actual,
    default: React.forwardRef((props: DataEditorProps, ref) => {
      mocks.props = props
      React.useImperativeHandle(ref, () => ({
        updateCells: () => undefined,
        focus: () => undefined,
      }))
      return <div data-testid="glide-grid" />
    }),
  }
})

vi.mock("./cells/select-cell", () => ({ default: {} }))
vi.mock("./cells/multi-select-cell", () => ({ default: {} }))

;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function fixture() {
  const connection = await createTestWasmConnection()
  const { service } = await Runtime.create(
    connection,
    {
      clock: {
        nowInstant: () => "2026-11-07T00:00:00.000Z",
        nowMilliseconds: () => performance.now(),
      },
      entropy: {
        randomBytes: (length) => crypto.getRandomValues(new Uint8Array(length)),
      },
    },
    { title: "Grid write order" },
    {
      cancellation: {
        cancelled: () => false,
        onCancel: () => () => undefined,
      },
    }
  )
  const source = new EidosRuntimeEditorDataSource(service, "write-order.eidos")
  await source.initialize()
  const created = await source.createTable({
    name: "Tasks",
    fields: [{ name: "Title", type: "text", isRecordLabel: true }],
  })
  const tableId = created.tables[0]!.table.id
  const field = created.tables[0]!.fields.find(
    (candidate) => candidate.name === "Title"
  )!
  const row = await source.insertRow(tableId, { [field.id]: "A" })
  const table = (await source.getSnapshot()).tables[0]!
  const revision = (await service.getSnapshot({}, { requestId: "before" }))
    .revision
  return { connection, service, source, table, field, row: row.row, revision }
}

function edit(column: number, row: number, text: string) {
  mocks.props?.onCellEdited?.([column, row], {
    kind: GridCellKind.Text,
    allowOverlay: true,
    data: text,
    displayData: text,
  })
}

describe("DataGrid row writes through the canonical Runtime and WASM adapter", () => {
  let container: HTMLDivElement
  let root: Root
  let close: (() => void) | undefined

  beforeEach(() => {
    mocks.props = null
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    close?.()
    close = undefined
    container.remove()
    vi.restoreAllMocks()
  })

  it("keeps the append and its draft immediate while committing edit A, create B, edit B in revision order", async () => {
    const f = await fixture()
    close = () => f.connection.close()
    const editResponse = deferred()
    const createResponse = deferred()
    const original = f.service.mutateRows.bind(f.service)
    const writes = vi
      .spyOn(f.service, "mutateRows")
      .mockImplementation(async (request, context) => {
        const result = await original(request, context)
        if (writes.mock.calls.length === 1) await editResponse.promise
        else if (request.changes[0]?.kind === "create")
          await createResponse.promise
        return result
      })
    const onError = vi.fn()
    await act(async () => {
      root.render(
        <EidosFileDataGrid
          source={f.source}
          table={f.table}
          onError={onError}
        />
      )
    })
    await act(async () => {
      await vi.waitFor(() =>
        expect(mocks.props?.getCellContent([0, 0])).toMatchObject({ data: "A" })
      )
    })

    await act(async () => {
      edit(0, 0, "A edited")
    })
    expect(writes).toHaveBeenCalledTimes(1)
    expect(writes.mock.calls[0]![0].expectedRevision).toBe(f.revision)
    await act(async () => {
      await mocks.props?.onRowAppended?.()
    })
    expect(mocks.props?.rows).toBe(2)
    expect(mocks.props?.getCellContent([0, 1])).toMatchObject({ data: "" })
    act(() => {
      edit(0, 1, "B typed before create")
    })
    expect(mocks.props?.getCellContent([0, 1])).toMatchObject({
      data: "B typed before create",
    })
    expect(writes).toHaveBeenCalledTimes(1)

    await act(async () => {
      editResponse.resolve()
    })
    expect(writes).toHaveBeenCalledTimes(2)
    expect(writes.mock.calls[1]![0]).toMatchObject({
      expectedRevision: String(BigInt(f.revision) + 1n),
      changes: [{ kind: "create" }],
    })
    await act(async () => {
      createResponse.resolve()
    })
    expect(writes).toHaveBeenCalledTimes(3)
    expect(writes.mock.calls[2]![0]).toMatchObject({
      expectedRevision: String(BigInt(f.revision) + 2n),
      changes: [{ kind: "update" }],
    })
    expect(
      (await f.source.getPage(f.table.table.id, 0, 10, {})).rows.map(
        (row) => row[f.field.id]
      )
    ).toEqual(["A edited", "B typed before create"])
    expect(onError).not.toHaveBeenCalled()
    expect(container.textContent).not.toContain("Could not save")
  })

  it("rejects a queued create after an external revision, reports it once, and drains for a later append", async () => {
    const f = await fixture()
    close = () => f.connection.close()
    const editResponse = deferred()
    const original = f.service.mutateRows.bind(f.service)
    const writes = vi
      .spyOn(f.service, "mutateRows")
      .mockImplementation(async (request, context) => {
        const result = await original(request, context)
        if (writes.mock.calls.length === 1) await editResponse.promise
        return result
      })
    const onError = vi.fn()
    await act(async () => {
      root.render(
        <EidosFileDataGrid
          source={f.source}
          table={f.table}
          onError={onError}
        />
      )
    })
    await act(async () => {
      await vi.waitFor(() =>
        expect(mocks.props?.getCellContent([0, 0])).toMatchObject({ data: "A" })
      )
    })
    await act(async () => {
      edit(0, 0, "A edited")
    })
    await act(async () => {
      await mocks.props?.onRowAppended?.()
    })
    act(() => {
      edit(0, 1, "B draft")
    })
    await original(
      {
        tableId: f.table.table.id,
        expectedRevision: String(BigInt(f.revision) + 1n),
        changes: [
          {
            kind: "update",
            rowId: String(f.row._id),
            values: { [f.field.id]: "External" },
          },
        ],
      },
      { requestId: "external" }
    )

    await act(async () => {
      editResponse.resolve()
    })
    expect(writes).toHaveBeenCalledTimes(2)
    expect(writes.mock.calls[1]![0].expectedRevision).toBe(
      String(BigInt(f.revision) + 1n)
    )
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0]![0]).toMatchObject({ code: "stale-revision" })
    expect(mocks.props?.rows).toBe(1)
    expect(container.textContent).not.toContain("Retry")

    // An explicit refresh accepts the external revision; the failed append is
    // never retried, and a new independent append can use the drained queue.
    await f.source.getSnapshot()
    await act(async () => {
      await mocks.props?.onRowAppended?.()
    })
    expect(writes).toHaveBeenCalledTimes(3)
    expect(writes.mock.calls[2]![0].expectedRevision).toBe(
      String(BigInt(f.revision) + 2n)
    )
    expect(mocks.props?.rows).toBe(2)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(
      (await f.source.getPage(f.table.table.id, 0, 10, {})).rows[0]![f.field.id]
    ).toBe("External")
  })
})
