import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import { utilityProcess, type UtilityProcess } from "electron"

import type {
  GraftEncryptedInput,
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
            totalIsFinal: true,
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
  it("revokes an encrypted clone on abort and waits for lock and close acknowledgements", async () => {
    const child = new FakeUtilityProcess()
    const requests: GraftSdkWorkerRequest[] = []
    let cloneId: number | undefined
    let lockId: number | undefined
    let closeId: number | undefined
    vi.spyOn(child, "postMessage").mockImplementation((request) => {
      requests.push(request)
      if (request.type === "open") {
        queueMicrotask(() =>
          child.emit("message", {
            requestId: request.requestId,
            ok: true,
            result: {},
          })
        )
      } else if (
        request.type === "command" &&
        request.command === "cloneEncryptedSync"
      ) {
        cloneId = request.requestId
      } else if (
        request.type === "command" &&
        request.command === "lockEncryptedSync"
      ) {
        lockId = request.requestId
      } else if (request.type === "cancel") {
        queueMicrotask(() =>
          child.emit("message", {
            requestId: cloneId,
            ok: false,
            error: { name: "AbortError", message: "clone cancelled" },
          })
        )
      } else if (request.type === "close") {
        closeId = request.requestId
      }
    })
    vi.mocked(utilityProcess.fork).mockReturnValue(
      child as unknown as UtilityProcess
    )
    const transport = new GraftUtilityTransport("/tmp/graft-worker.js")
    const abort = new AbortController()
    const encryption: GraftEncryptedInput = {
      password: Buffer.from("synthetic-test-password"),
      connection: {
        url: "https://sync-staging.eidos.space/u-alice/project",
        uuid: "00000000-0000-4000-8000-000000000001",
        authenticationDomain: "https://staging.eidos.space",
        accountSubject: "alice",
        bearerToken: "synthetic-token",
        stateDirectory: "/unused-test-state",
      },
    }
    let settled = false
    const result = transport.clone(
      "/tmp/eidos-encrypted-clone",
      encryption.connection.url,
      "synthetic-token",
      { encryption, signal: abort.signal }
    )
    const rejected = expect(result).rejects.toThrow("clone cancelled")
    void result.then(
      () => {
        settled = true
      },
      () => {
        settled = true
      }
    )
    await vi.waitFor(() => expect(cloneId).toBeDefined())
    abort.abort()
    await vi.waitFor(() => expect(lockId).toBeDefined())
    expect(requests.some((request) => request.type === "cancel")).toBe(true)
    expect(settled).toBe(false)
    expect(closeId).toBeUndefined()
    child.emit("message", {
      requestId: lockId,
      ok: true,
      result: { locked: true },
    })
    await vi.waitFor(() => expect(closeId).toBeDefined())
    expect(settled).toBe(false)
    child.emit("message", {
      requestId: closeId,
      ok: true,
      result: { closed: true },
    })
    await rejected
  })

  it("does not launch a utility process for an already cancelled clone", async () => {
    vi.mocked(utilityProcess.fork).mockClear()
    const transport = new GraftUtilityTransport("/tmp/graft-worker.js")
    const abort = new AbortController()
    abort.abort()
    await expect(
      transport.clone(
        "/tmp/cancelled-clone",
        "https://sync-staging.eidos.space/u-alice/project",
        undefined,
        { signal: abort.signal }
      )
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(utilityProcess.fork).not.toHaveBeenCalled()
  })

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
        totalIsFinal: true,
      },
    ])
    await transport.close()
  })
})
