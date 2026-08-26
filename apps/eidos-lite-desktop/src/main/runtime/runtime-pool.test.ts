import { EventEmitter } from "node:events"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { utilityProcess, type UtilityProcess } from "electron"
import { describe, expect, it, vi } from "vitest"

import type { RuntimeWorkerRequest } from "../../shared/contracts"

import {
  DEFAULT_MAX_RESIDENT_RUNTIMES,
  hasPendingRuntimeRequestsForChild,
  isCurrentRuntimeChild,
  RuntimePool,
  selectLruRuntimeToEvict,
} from "./runtime-pool"

vi.mock("electron", () => ({
  utilityProcess: { fork: vi.fn() },
}))

class FakeRuntimeUtilityProcess extends EventEmitter {
  readonly requests: RuntimeWorkerRequest[] = []

  postMessage(request: RuntimeWorkerRequest): void {
    this.requests.push(request)
    queueMicrotask(() => {
      this.emit("message", {
        requestId: request.requestId,
        ok: true,
        result: request.type === "open" ? { tables: [] } : undefined,
      })
    })
  }

  kill(): boolean {
    queueMicrotask(() => this.emit("exit", 0))
    return true
  }
}

describe("RuntimePool LRU policy", () => {
  it("opens clone validation probes in read-only mode", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "eidos-lite-pool-validate-"))
    const filePath = path.join(root, "records.eidos")
    await writeFile(filePath, "fixture")
    const child = new FakeRuntimeUtilityProcess()
    vi.mocked(utilityProcess.fork).mockReturnValue(
      child as unknown as UtilityProcess
    )

    try {
      const pool = new RuntimePool(root, "/tmp/runtime-worker.js")
      await pool.validatePaths(["records.eidos"])

      expect(child.requests[0]).toMatchObject({
        type: "open",
        filePath,
        readOnly: true,
      })
      await pool.destroy()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("keeps the resident set deliberately small", () => {
    expect(DEFAULT_MAX_RESIDENT_RUNTIMES).toBe(3)
  })

  it("evicts the least recently used resident and ignores closed metadata", () => {
    expect(
      selectLruRuntimeToEvict([
        {
          sessionId: "newest",
          resident: true,
          pendingRequests: 0,
          lastAccess: 30,
        },
        {
          sessionId: "closed",
          resident: false,
          pendingRequests: 0,
          lastAccess: 1,
        },
        {
          sessionId: "oldest",
          resident: true,
          pendingRequests: 0,
          lastAccess: 10,
        },
        {
          sessionId: "middle",
          resident: true,
          pendingRequests: 0,
          lastAccess: 20,
        },
      ])
    ).toBe("oldest")
  })

  it("never evicts the session currently being opened", () => {
    expect(
      selectLruRuntimeToEvict(
        [
          {
            sessionId: "opening",
            resident: true,
            pendingRequests: 0,
            lastAccess: 1,
          },
          {
            sessionId: "other",
            resident: true,
            pendingRequests: 0,
            lastAccess: 2,
          },
        ],
        "opening"
      )
    ).toBe("other")
  })

  it("never evicts a runtime with an in-flight request", () => {
    expect(
      selectLruRuntimeToEvict([
        {
          sessionId: "busy-oldest",
          resident: true,
          pendingRequests: 1,
          lastAccess: 1,
        },
        {
          sessionId: "idle-newest",
          resident: true,
          pendingRequests: 0,
          lastAccess: 2,
        },
      ])
    ).toBe("idle-newest")
  })

  it("waits instead of evicting when every resident is busy", () => {
    expect(
      selectLruRuntimeToEvict([
        {
          sessionId: "busy",
          resident: true,
          pendingRequests: 2,
          lastAccess: 1,
        },
      ])
    ).toBeNull()
  })

  it("drains only requests owned by the child being closed", () => {
    const closingChild = { id: "closing" }
    const replacementChild = { id: "replacement" }

    expect(
      hasPendingRuntimeRequestsForChild(
        [{ child: closingChild }, { child: replacementChild }],
        closingChild
      )
    ).toBe(true)
    expect(
      hasPendingRuntimeRequestsForChild(
        [{ child: replacementChild }],
        closingChild
      )
    ).toBe(false)
  })

  it("ignores a delayed exit from a replaced utility process", () => {
    const previousChild = { id: "previous" }
    const replacementChild = { id: "replacement" }

    expect(isCurrentRuntimeChild(replacementChild, previousChild)).toBe(false)
    expect(isCurrentRuntimeChild(replacementChild, replacementChild)).toBe(true)
  })
})
