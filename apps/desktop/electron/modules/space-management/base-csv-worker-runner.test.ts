import { beforeEach, describe, expect, it, vi } from "vitest"

const harness = vi.hoisted(() => ({
  workers: [] as Array<{
    emit: (event: string, ...args: unknown[]) => boolean
    terminate: ReturnType<typeof vi.fn>
  }>,
}))

vi.mock("node:worker_threads", () => {
  class Worker {
    private readonly listeners = new Map<
      string,
      Array<{ listener: (...args: unknown[]) => void; once: boolean }>
    >()
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

import { BaseCsvWorkerRunner } from "./base-csv-worker-runner"
import type { SpaceResourceLifecycle } from "./space-resource-lifecycle"

describe("BaseCsvWorkerRunner", () => {
  beforeEach(() => {
    harness.workers.length = 0
  })

  it("forwards progress and rejects a canceled operation", async () => {
    const lifecycle = {
      register: vi.fn(),
    } as unknown as SpaceResourceLifecycle
    const runner = new BaseCsvWorkerRunner(lifecycle)
    const onProgress = vi.fn()
    const operation = runner.import(
      "/space",
      "/source.csv",
      "source.csv",
      { size: 100, mtimeMs: 1 },
      "/target.base",
      {},
      { id: "csv-operation-1", onProgress }
    )
    const worker = harness.workers[0]
    const progress = {
      phase: "importing" as const,
      processedBytes: 50,
      totalBytes: 100,
      processedRows: 5,
      totalRows: 10,
    }

    worker.emit("message", { type: "progress", progress })
    expect(onProgress).toHaveBeenCalledWith(progress)
    let finishTermination: ((exitCode: number) => void) | undefined
    worker.terminate.mockReturnValue(
      new Promise<number>((resolve) => {
        finishTermination = resolve
      })
    )
    expect(runner.cancel("csv-operation-1")).toBe(true)
    let rejected = false
    void operation.catch(() => {
      rejected = true
    })
    await Promise.resolve()
    expect(rejected).toBe(false)
    finishTermination?.(1)
    await expect(operation).rejects.toMatchObject({
      name: "BaseCsvCanceledError",
      message: "Base CSV operation canceled",
    })
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(runner.cancel("csv-operation-1")).toBe(false)
  })
})
