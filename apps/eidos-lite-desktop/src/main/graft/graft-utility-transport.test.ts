import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import { utilityProcess, type UtilityProcess } from "electron"

import type {
  GraftSdkWorkerRequest,
  GraftTransferProgress,
} from "../../shared/graft-sdk-contracts"
import { GraftUtilityTransport } from "./graft-utility-transport"

vi.mock("electron", () => ({
  utilityProcess: { fork: vi.fn() },
}))

class FakeUtilityProcess extends EventEmitter {
  readonly pid = 42
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()

  postMessage(request: GraftSdkWorkerRequest): void {
    if (request.type === "cancel") return
    queueMicrotask(() => {
      if (request.type === "command") {
        this.emit("message", {
          requestId: request.requestId,
          type: "progress",
          progress: {
            direction: "upload",
            transferredBytes: 32,
            totalBytes: 64,
          },
        })
      }
      this.emit("message", {
        requestId: request.requestId,
        ok: true,
        result:
          request.type === "command" ? { operation: request.command } : {},
      })
    })
  }

  kill(): boolean {
    queueMicrotask(() => this.emit("exit", 0))
    return true
  }
}

describe("GraftUtilityTransport", () => {
  it("forwards worker transfer events before resolving the command", async () => {
    const child = new FakeUtilityProcess()
    vi.mocked(utilityProcess.fork).mockReturnValue(
      child as unknown as UtilityProcess
    )
    const transport = new GraftUtilityTransport("/tmp/graft-worker.js")
    const progress: GraftTransferProgress[] = []

    await transport.open("/tmp/eidos-transfer-progress")
    await expect(
      transport.command("push", [], {
        onProgress: (event) => progress.push(event),
      })
    ).resolves.toEqual({ operation: "push" })

    expect(progress).toEqual([
      {
        direction: "upload",
        transferredBytes: 32,
        totalBytes: 64,
      },
    ])
    await transport.close()
  })
})
