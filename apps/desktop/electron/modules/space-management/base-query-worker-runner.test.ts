import { beforeEach, describe, expect, it, vi } from "vitest"

const harness = vi.hoisted(() => ({
  workers: [] as Array<{
    emit: (event: string, ...args: unknown[]) => boolean
    postMessage: ReturnType<typeof vi.fn>
    terminate: ReturnType<typeof vi.fn>
  }>,
}))

vi.mock("node:worker_threads", () => {
  class Worker {
    private readonly listeners = new Map<
      string,
      Array<{ listener: (...args: unknown[]) => void; once: boolean }>
    >()
    postMessage = vi.fn()
    terminate = vi.fn().mockResolvedValue(1)

    constructor() {
      harness.workers.push(this)
    }

    on(event: string, listener: (...args: unknown[]) => void): this {
      this.listeners.set(event, [
        ...(this.listeners.get(event) ?? []),
        { listener, once: false },
      ])
      return this
    }

    once(event: string, listener: (...args: unknown[]) => void): this {
      this.listeners.set(event, [
        ...(this.listeners.get(event) ?? []),
        { listener, once: true },
      ])
      return this
    }

    emit(event: string, ...args: unknown[]): boolean {
      const listeners = this.listeners.get(event) ?? []
      this.listeners.set(
        event,
        listeners.filter((candidate) => !candidate.once)
      )
      for (const candidate of listeners) candidate.listener(...args)
      return listeners.length > 0
    }
  }

  return {
    Worker,
    default: { Worker },
  }
})

import { BaseQueryWorkerRunner } from "./base-query-worker-runner"
import type { SpaceResourceLifecycle } from "./space-resource-lifecycle"

describe("BaseQueryWorkerRunner", () => {
  beforeEach(() => {
    harness.workers.length = 0
  })

  it("reuses one worker per Space and routes responses by request ID", async () => {
    const lifecycle = {
      register: vi.fn(),
    } as unknown as SpaceResourceLifecycle
    const runner = new BaseQueryWorkerRunner(lifecycle)
    const pagePromise = runner.page("/space", "/space/tasks.base", "tasks", {
      offset: 0,
      limit: 50,
    })
    const worker = harness.workers[0]
    const pageRequest = worker.postMessage.mock.calls[0][0]

    worker.emit("message", {
      id: pageRequest.id,
      ok: true,
      operation: "page",
      page: {
        tableId: "tasks",
        offset: 0,
        limit: 50,
        total: 1,
        rows: [{ _id: "1", title: "Task" }],
      },
    })
    await expect(pagePromise).resolves.toMatchObject({ total: 1 })

    const countsPromise = runner.groupCounts(
      "/space",
      "/space/tasks.base",
      "tasks",
      "status",
      {}
    )
    const countsRequest = worker.postMessage.mock.calls[1][0]
    worker.emit("message", {
      id: countsRequest.id,
      ok: true,
      operation: "group-counts",
      counts: [{ value: "todo", total: 1 }],
    })

    await expect(countsPromise).resolves.toEqual([{ value: "todo", total: 1 }])

    const statsPromise = runner.columnStats(
      "/space",
      "/space/tasks.base",
      "tasks",
      [{ columnName: "points", type: "sum" }],
      { search: "release" }
    )
    const statsRequest = worker.postMessage.mock.calls[2][0]
    expect(statsRequest).toMatchObject({
      operation: "column-stats",
      configs: [{ columnName: "points", type: "sum" }],
      query: { search: "release" },
    })
    worker.emit("message", {
      id: statsRequest.id,
      ok: true,
      operation: "column-stats",
      stats: [{ columnName: "points", type: "sum", value: 8 }],
    })
    await expect(statsPromise).resolves.toEqual([
      { columnName: "points", type: "sum", value: 8 },
    ])
    expect(harness.workers).toHaveLength(1)
  })

  it("runs concurrent Space reads across a bounded worker pool", async () => {
    const lifecycle = {
      register: vi.fn(),
    } as unknown as SpaceResourceLifecycle
    const runner = new BaseQueryWorkerRunner(lifecycle)
    const pages = Array.from({ length: 4 }, (_, offset) =>
      runner.page("/space", "/space/tasks.base", "tasks", {
        offset,
        limit: 1,
        totalHint: 4,
      })
    )

    expect(harness.workers).toHaveLength(2)
    expect(
      harness.workers.map((worker) => worker.postMessage.mock.calls.length)
    ).toEqual([2, 2])

    for (const worker of harness.workers) {
      for (const [request] of worker.postMessage.mock.calls) {
        worker.emit("message", {
          id: request.id,
          ok: true,
          operation: "page",
          page: {
            tableId: "tasks",
            offset: request.options.offset,
            limit: 1,
            total: 4,
            rows: [{ _id: String(request.options.offset) }],
          },
        })
      }
    }

    await expect(Promise.all(pages)).resolves.toHaveLength(4)
  })

  it("restores worker error names from query failures", async () => {
    const lifecycle = {
      register: vi.fn(),
    } as unknown as SpaceResourceLifecycle
    const runner = new BaseQueryWorkerRunner(lifecycle)
    const pagePromise = runner.page("/space", "/space/tasks.base", "missing", {
      offset: 0,
      limit: 50,
    })
    const worker = harness.workers[0]
    const request = worker.postMessage.mock.calls[0][0]

    worker.emit("message", {
      id: request.id,
      ok: false,
      name: "BaseError",
      message: "Table not found",
    })

    await expect(pagePromise).rejects.toMatchObject({
      name: "BaseError",
      message: "Table not found",
    })
  })

  it("rejects every pooled query when the Space lifecycle closes", async () => {
    const lifecycle = {
      register: vi.fn(),
    } as unknown as SpaceResourceLifecycle
    const runner = new BaseQueryWorkerRunner(lifecycle)
    const pagePromises = [0, 50].map((offset) =>
      runner.page("/space", "/space/tasks.base", "tasks", {
        offset,
        limit: 50,
      })
    )
    const closeSpace = (
      lifecycle.register as unknown as ReturnType<typeof vi.fn>
    ).mock.calls[0][1] as (spacePath: string) => Promise<void>

    await closeSpace("/space")
    for (const pagePromise of pagePromises) {
      await expect(pagePromise).rejects.toMatchObject({
        name: "BaseQueryClosedError",
      })
    }
    expect(harness.workers).toHaveLength(2)
    for (const worker of harness.workers) {
      expect(worker.terminate).toHaveBeenCalledOnce()
    }
  })
})
