// @vitest-environment node

import { EventEmitter } from "node:events"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const childProcessMocks = vi.hoisted(() => ({
  fork: vi.fn(),
}))

vi.mock("node:child_process", () => ({
  fork: childProcessMocks.fork,
}))

vi.mock("../../utils/resources", () => ({
  getResourcePath: (resourcePath: string) => `/resources/${resourcePath}`,
}))

import { graftSqlitePragmaStatement } from "./graft-sqlite-pragma"
import { GraftSqliteExecutor } from "./graft-sqlite-executor"

class FakeGraftWorker extends EventEmitter {
  connected = true

  send(
    request: { type: string; id?: number },
    callback?: (error: Error | null) => void
  ): boolean {
    callback?.(null)
    if (request.type === "execute") {
      Promise.resolve().then(() => {
        this.emit("message", {
          type: "result",
          id: request.id,
          value: { enabled: true },
        })
      })
    } else if (request.type === "close") {
      Promise.resolve().then(() => {
        this.connected = false
        this.emit("exit", 0)
      })
    }
    return true
  }

  kill(): boolean {
    if (!this.connected) return false
    this.connected = false
    this.emit("exit", 0)
    return true
  }
}

describe("graftSqlitePragmaStatement", () => {
  it("builds query and argument forms without changing quotes", () => {
    expect(graftSqlitePragmaStatement("json_status")).toBe("graft_json_status")
    expect(
      graftSqlitePragmaStatement("json_commit", 'Write today\'s "quoted" note')
    ).toBe("graft_json_commit = 'Write today''s \"quoted\" note'")
  })

  it("rejects pragma name injection", () => {
    expect(() => graftSqlitePragmaStatement("json_status; select 1")).toThrow(
      "Invalid Graft pragma"
    )
  })
})

describe("GraftSqliteExecutor worker lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    childProcessMocks.fork.mockReset()
    childProcessMocks.fork.mockImplementation(() => new FakeGraftWorker())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("keeps the repository worker warm across ordinary interaction pauses", async () => {
    const executor = new GraftSqliteExecutor()

    await executor.execute("/tmp/eidos-space", "json_status")
    expect(childProcessMocks.fork).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(6_000)
    await executor.execute("/tmp/eidos-space", "json_status")
    expect(childProcessMocks.fork).toHaveBeenCalledTimes(1)

    await executor.close()
  })
})
