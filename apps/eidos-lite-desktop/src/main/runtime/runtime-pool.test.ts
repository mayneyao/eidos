import { EventEmitter } from "node:events"
import {
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises"
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

class DelayedExitRuntimeUtilityProcess extends FakeRuntimeUtilityProcess {
  private releaseExit: (() => void) | null = null

  kill(): boolean {
    this.releaseExit = () => this.emit("exit", 0)
    return true
  }

  exit(): void {
    this.releaseExit?.()
  }
}

describe("RuntimePool LRU policy", () => {
  it("inspects tables privately without replacing resident editor runtimes", async () => {
    const root = await realpath(
      await mkdtemp(path.join(tmpdir(), "lite-pool-inspect-"))
    )
    await writeFile(path.join(root, "note.eidos"), "fixture")
    const editor = new FakeRuntimeUtilityProcess()
    class Inspector extends FakeRuntimeUtilityProcess {
      postMessage(request: RuntimeWorkerRequest): void {
        this.requests.push(request)
        queueMicrotask(() =>
          this.emit("message", {
            requestId: request.requestId,
            ok: true,
            result: ["Docs"],
          })
        )
      }
    }
    const inspector = new Inspector()
    vi.mocked(utilityProcess.fork)
      .mockReturnValueOnce(editor as unknown as UtilityProcess)
      .mockReturnValueOnce(inspector as unknown as UtilityProcess)
    const pool = new RuntimePool(root, "/tmp/runtime-worker.js")
    try {
      await pool.open("note.eidos")
      const before = pool.residentRelativePaths()
      await expect(
        pool.inspectMergeTables(["note.eidos"], new AbortController().signal)
      ).resolves.toEqual(["Docs"])
      expect(pool.residentRelativePaths()).toEqual(before)
      expect(inspector.requests).toEqual([
        {
          type: "inspectMergeTables",
          requestId: 1,
          filePaths: [path.join(root, "note.eidos")],
        },
      ])
    } finally {
      await pool.destroy()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("cancels a private table inspection and rejects unsafe paths before spawning", async () => {
    const root = await realpath(
      await mkdtemp(path.join(tmpdir(), "lite-pool-inspect-abort-"))
    )
    await writeFile(path.join(root, "note.eidos"), "fixture")
    const child = new FakeRuntimeUtilityProcess()
    const controller = new AbortController()
    const killed = vi.spyOn(child, "kill")
    vi.spyOn(child, "postMessage").mockImplementation(() =>
      controller.abort(new Error("cancel inspection"))
    )
    vi.mocked(utilityProcess.fork).mockReturnValue(
      child as unknown as UtilityProcess
    )
    const pool = new RuntimePool(root, "/tmp/runtime-worker.js")
    try {
      await expect(
        pool.inspectMergeTables(["../escape.eidos"], controller.signal)
      ).rejects.toThrow()
      await expect(
        pool.inspectMergeTables(["note.eidos"], controller.signal)
      ).rejects.toThrow("cancel inspection")
      expect(killed).toHaveBeenCalledOnce()
      expect(pool.residentRelativePaths()).toEqual([])
    } finally {
      await pool.destroy()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("invalidates a renamed file even when graceful close fails, after the child exits", async () => {
    const root = await realpath(
      await mkdtemp(path.join(tmpdir(), "lite-pool-invalid-close-"))
    )
    await writeFile(path.join(root, "note.eidos"), "fixture")
    class FailedClose extends DelayedExitRuntimeUtilityProcess {
      postMessage(request: RuntimeWorkerRequest): void {
        if (request.type !== "close") {
          super.postMessage(request)
          return
        }
        queueMicrotask(() =>
          this.emit("message", {
            requestId: request.requestId,
            ok: false,
            error: {
              name: "Error",
              message: "Close failed after external rename",
            },
          })
        )
      }
    }
    const child = new FailedClose()
    vi.mocked(utilityProcess.fork).mockReturnValue(
      child as unknown as UtilityProcess
    )
    const pool = new RuntimePool(root, "/tmp/runtime-worker.js")
    try {
      const opened = await pool.open("note.eidos")
      await rename(
        path.join(root, "note.eidos"),
        path.join(root, "moved.eidos")
      )
      let settled = false
      const failedCall = pool
        .call(opened.sessionId, "getSnapshot", [])
        .catch((error: unknown) => {
          settled = true
          return error
        })
      await new Promise((resolve) => setTimeout(resolve, 20))
      const settledBeforeExit = settled
      child.exit()
      const error = await failedCall
      expect(settledBeforeExit).toBe(false)
      expect(error).toMatchObject({ issue: { reason: "missing" } })
      expect(pool.openRelativePaths()).toEqual([])
    } finally {
      child.exit()
      await pool.destroy()
      await rm(root, { recursive: true, force: true })
    }
  })
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

  it("registers a call before another session can evict its Runtime", async () => {
    const root = await realpath(
      await mkdtemp(path.join(tmpdir(), "eidos-lite-pool-call-"))
    )
    await Promise.all([
      writeFile(path.join(root, "first.eidos"), "fixture"),
      writeFile(path.join(root, "second.eidos"), "fixture"),
    ])
    vi.mocked(utilityProcess.fork).mockImplementation(
      () => new FakeRuntimeUtilityProcess() as unknown as UtilityProcess
    )

    try {
      const pool = new RuntimePool(root, "/tmp/runtime-worker.js", 1)
      const first = await pool.open("first.eidos")
      const second = await pool.open("second.eidos")

      const call = pool.call(first.sessionId, "getSnapshot", [])
      const reopen = pool.open("second.eidos")

      await expect(call).resolves.toBeUndefined()
      await expect(reopen).resolves.toMatchObject({
        sessionId: second.sessionId,
      })
      await pool.destroy()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it("does not finish closing a session until its utility process exits", async () => {
    const root = await realpath(
      await mkdtemp(path.join(tmpdir(), "eidos-lite-pool-close-"))
    )
    await writeFile(path.join(root, "records.eidos"), "fixture")
    const child = new DelayedExitRuntimeUtilityProcess()
    vi.mocked(utilityProcess.fork).mockReturnValue(
      child as unknown as UtilityProcess
    )

    try {
      const pool = new RuntimePool(root, "/tmp/runtime-worker.js")
      const session = await pool.open("records.eidos")
      let closed = false
      const closing = pool.closeSession(session.sessionId).then(() => {
        closed = true
      })

      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      expect(closed).toBe(false)
      let secondClosed = false
      const secondClosing = pool.closeSession(session.sessionId).then(() => {
        secondClosed = true
      })
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      expect(secondClosed).toBe(false)

      child.exit()
      await Promise.all([closing, secondClosing])
      expect(closed).toBe(true)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
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

  it("closes sessions for matching paths with normalized slashes and prefixes", async () => {
    const root = await realpath(
      await mkdtemp(path.join(tmpdir(), "lite-pool-close-path-"))
    )
    const filePath = path.join(root, "folder", "data.eidos")
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, "fixture")
    const child = new FakeRuntimeUtilityProcess()
    vi.mocked(utilityProcess.fork).mockReturnValue(
      child as unknown as UtilityProcess
    )
    const pool = new RuntimePool(root, "/tmp/runtime-worker.js")
    try {
      const opened = await pool.open("folder/data.eidos")
      expect(pool.openRelativePaths()).toEqual(["folder/data.eidos"])

      const closed = await pool.closeSessionsForPath("folder\\")
      expect(closed).toEqual([opened.sessionId])
      expect(pool.openRelativePaths()).toEqual([])
    } finally {
      await pool.destroy()
      await rm(root, { recursive: true, force: true })
    }
  })

  it("suspends handles with closeHandles and reopens them with reopenHandles", async () => {
    const root = await realpath(
      await mkdtemp(path.join(tmpdir(), "lite-pool-suspend-"))
    )
    const filePath = path.join(root, "file.eidos")
    await writeFile(filePath, "fixture")
    const child1 = new FakeRuntimeUtilityProcess()
    const child2 = new FakeRuntimeUtilityProcess()
    vi.mocked(utilityProcess.fork)
      .mockReturnValueOnce(child1 as unknown as UtilityProcess)
      .mockReturnValueOnce(child2 as unknown as UtilityProcess)
    const pool = new RuntimePool(root, "/tmp/runtime-worker.js")
    try {
      const opened = await pool.open("file.eidos")
      expect(pool.residentRelativePaths()).toEqual(["file.eidos"])

      await pool.closeHandles()
      expect(pool.residentRelativePaths()).toEqual([])
      expect(pool.openRelativePaths()).toEqual(["file.eidos"])

      await pool.reopenHandles()
      expect(pool.residentRelativePaths()).toEqual(["file.eidos"])

      await pool.closeSession(opened.sessionId)
      await expect(
        pool.call(opened.sessionId, "getSnapshot", [])
      ).rejects.toThrow("Unknown or closed Eidos File session")
    } finally {
      await pool.destroy()
      await rm(root, { recursive: true, force: true })
    }
  })
})
