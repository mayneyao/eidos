import { describe, expect, it } from "vitest"

import {
  AdapterTransportRuntimeClient,
  AdapterTransportServer,
  type AdapterStructuredCloneCarrier,
  type AdapterTransportChannel,
} from "./adapter-transport"
import type {
  MutationResult,
  RuntimeClient,
  RuntimeError,
} from "./runtime-contract"

function channelPair(): [AdapterTransportChannel, AdapterTransportChannel] {
  const listeners: Array<
    Set<(carrier: AdapterStructuredCloneCarrier) => void>
  > = [new Set(), new Set()]
  const closed: Array<Set<(reason?: unknown) => void>> = [new Set(), new Set()]
  const channel = (side: 0 | 1): AdapterTransportChannel => ({
    post(carrier) {
      const target = (side === 0 ? 1 : 0) as 0 | 1
      queueMicrotask(() => {
        for (const listener of listeners[target]) listener(carrier)
      })
    },
    subscribe(listener, onClose) {
      listeners[side].add(listener)
      if (onClose) closed[side].add(onClose)
      return () => {
        listeners[side].delete(listener)
        if (onClose) closed[side].delete(onClose)
      }
    },
    close() {
      const target = (side === 0 ? 1 : 0) as 0 | 1
      for (const listener of closed[target]) listener()
    },
  })
  return [channel(0), channel(1)]
}

function context(requestId: string) {
  return { requestId, deadlineMilliseconds: 30_000 }
}

describe("Adapter 1.0 Transport", () => {
  it("carries FIFO Runtime calls through the prepared-commit barrier", async () => {
    const [clientChannel, serverChannel] = channelPair()
    const retained: string[] = []
    const settled: string[] = []
    let closed = false
    const server = new AdapterTransportServer(
      (carrier, transfers) => serverChannel.post(carrier, transfers),
      {
        epoch: "epoch-1",
        sessionID: "session-1",
        workingID: "working-1",
        cancelMode: "interrupt",
        allocateReceiptID: () => "receipt-1",
        retainPreparedReceipt: (receipt) => retained.push(receipt.receiptID),
        settlePreparedReceipt: (receipt) => settled.push(receipt.receiptID),
        closeConnection: () => {
          closed = true
        },
      }
    )
    serverChannel.subscribe((carrier) => server.receive(carrier))

    const result: MutationResult = {
      fileId: "018f0000-0000-7000-8000-000000000001",
      revision: "1",
      changed: true,
      created: [
        {
          clientKey: "row",
          rowId: "018f0000-0000-7000-8000-000000000002",
        },
      ],
      affectedRows: [
        {
          tableId: "018f0000-0000-7000-8000-000000000003",
          rowId: "018f0000-0000-7000-8000-000000000002",
        },
      ],
    }
    const snapshot = {
      fileId: result.fileId,
      format: { major: 1 as const, minor: 0 as const },
      revision: "1",
      title: "Fixture",
      defaultTableId: null,
      schemaCounts: {
        tables: "0",
        fields: "0",
        views: "0",
        features: "0",
      },
    }
    const executionOrder: string[] = []
    const runtime = {
      async negotiate() {
        return {
          version: "1.0" as const,
          capabilities: {
            readRows: true,
            schemaPaging: true,
            cursorPaging: true,
            aggregate: true,
            groupRows: true,
            formulaPreview: false,
            mutateRows: true,
            mutationUndo: false,
            mutateView: false,
            schemaPreflight: false,
            mutateSchema: false,
            validate: true,
            events: false,
            csvExport: false,
            csvImport: false,
          },
          limits: {
            requestBytesMax: 8_388_608,
            responseBytesMax: 16_777_216,
            schemaPageSizeMax: 1000,
            pageSizeMax: 1000,
            projectionFieldsMax: 256,
            rowsByIdMax: 1000,
            mutationRowsMax: 500,
            mutationCellsMax: 25000,
            mutationBytesMax: 8_388_608,
            aggregateItemsMax: 128,
            groupPageSizeMax: 256,
            formulaPreviewRowsMax: 100,
            filterDepthMax: 8,
            filterNodesMax: 100,
            sortFieldsMax: 32,
            groupFieldsMax: 8,
            searchBytesMax: 4096,
            listElementsMax: 10000,
            logicalValueBytesMax: 1_048_576,
            formulaBytesMax: 4_096,
            formulaNodesMax: 10_000,
            formulaDepthMax: 256,
            diagnosticsMax: 1000,
            foregroundTimeMsMax: 30_000,
            csvBytesMax: 16_777_216,
            schemaPlanEntriesMax: 64,
            schemaPlanBytesMax: 8_388_608,
            undoEntriesMax: 1,
            undoBytesMax: 1,
          },
        }
      },
      async mutateRows(
        _request: unknown,
        requestContext: { requestId: string }
      ) {
        executionOrder.push("mutation:start")
        await server.commitBarrier.prepare(
          {
            fileID: result.fileId,
            baseRevision: "0",
            commitRevision: "1",
            reconciliation: {
              operation: "mutateRows",
              result: {
                fileId: result.fileId,
                revision: "1",
                changed: true,
                created: result.created,
                affectedRows: result.affectedRows,
              },
            },
          },
          requestContext
        )
        executionOrder.push("mutation:end")
        return result
      },
      async getSnapshot() {
        executionOrder.push("snapshot")
        return snapshot
      },
      async cancel() {},
      async close() {},
    } as unknown as RuntimeClient
    server.attachRuntime(runtime)

    const clientRetained: string[] = []
    const client = await new AdapterTransportRuntimeClient(clientChannel, {
      workingID: "working-1",
      retainPreparedReceipt: (receipt) =>
        clientRetained.push(receipt.receiptID),
      settlePreparedReceipt: () => undefined,
    }).connect()
    const negotiation = await client.negotiate(
      { protocol: "eidos-runtime", versions: ["1.0"] },
      context("negotiate")
    )
    expect(negotiation.version).toBe("1.0")
    expect("revertMutation" in client).toBe(false)
    expect("exportCsv" in client).toBe(false)
    expect("importCsv" in client).toBe(false)

    const mutation = client.mutateRows(
      {
        tableId: "018f0000-0000-7000-8000-000000000003",
        expectedRevision: "0",
        changes: [{ kind: "create", clientKey: "row", values: {} }],
      },
      context("mutation")
    )
    const readAfterMutation = client.getSnapshot({}, context("snapshot"))
    await expect(mutation).resolves.toEqual(result)
    await expect(readAfterMutation).resolves.toEqual(snapshot)
    expect(executionOrder).toEqual([
      "mutation:start",
      "mutation:end",
      "snapshot",
    ])
    expect(retained).toEqual(["receipt-1"])
    expect(clientRetained).toEqual(["receipt-1"])
    expect(settled).toEqual(["receipt-1"])

    await client.close(context("close"))
    expect(closed).toBe(true)
  })

  it("rejects an invalid sequence before Runtime execution", async () => {
    const [clientChannel, serverChannel] = channelPair()
    const server = new AdapterTransportServer(
      (carrier) => serverChannel.post(carrier),
      {
        epoch: "epoch",
        sessionID: "session",
        workingID: "working",
        cancelMode: "interrupt",
        allocateReceiptID: () => "receipt",
        closeConnection: () => undefined,
      }
    )
    serverChannel.subscribe((carrier) => server.receive(carrier))
    server.attachRuntime({} as RuntimeClient)
    const responses: AdapterStructuredCloneCarrier[] = []
    clientChannel.subscribe((carrier) => responses.push(carrier))
    clientChannel.post({
      envelope: { kind: "hello", protocol: "eidos-adapter", versions: ["1.0"] },
      buffers: [],
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    clientChannel.post({
      envelope: {
        kind: "request",
        protocol: "eidos-adapter",
        version: "1.0",
        epoch: "epoch",
        sessionID: "session",
        requestID: "request",
        sequence: 2,
        operation: "getSnapshot",
        payload: {},
      },
      buffers: [],
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(
      responses.some((item) => item.envelope.kind === "hello-result")
    ).toBe(true)
  })
})
