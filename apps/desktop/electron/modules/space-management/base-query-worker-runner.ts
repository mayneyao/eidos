import type {
  BaseRowGroupCount,
  BaseRowPage,
  BaseRowPageOptions,
  BaseRowQuery,
} from "@eidos.space/base"
import path from "node:path"
import { Worker } from "node:worker_threads"

import { Inject, Injectable } from "../../common/di"
import type {
  BaseQueryWorkerRequest,
  BaseQueryWorkerResponse,
} from "./base-query-worker-protocol"
import { SpaceResourceLifecycle } from "./space-resource-lifecycle"

const QUERY_TIMEOUT_MS = 30_000

interface PendingBaseQuery {
  resolve: (response: BaseQueryWorkerResponse) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface BaseQueryWorkerHandle {
  spacePath: string
  worker: Worker
  pending: Map<string, PendingBaseQuery>
  closed: boolean
}

type BaseQueryRequestInput =
  | Omit<Extract<BaseQueryWorkerRequest, { operation: "page" }>, "id">
  | Omit<Extract<BaseQueryWorkerRequest, { operation: "group-counts" }>, "id">

@Injectable()
export class BaseQueryWorkerRunner {
  private readonly workers = new Map<string, BaseQueryWorkerHandle>()
  private requestSequence = 0

  constructor(
    @Inject(SpaceResourceLifecycle) resourceLifecycle: SpaceResourceLifecycle
  ) {
    resourceLifecycle.register(
      "base-query-workers",
      (spacePath) => this.close(spacePath),
      () => this.close()
    )
  }

  async page(
    spacePath: string,
    filePath: string,
    tableId: string,
    options: BaseRowPageOptions
  ): Promise<BaseRowPage> {
    const response = await this.run(spacePath, {
      operation: "page",
      filePath,
      tableId,
      options,
    })
    if (!response.ok) throw this.error(response.name, response.message)
    if (response.operation !== "page") {
      throw new Error("Base query worker returned an unexpected response")
    }
    return response.page
  }

  async groupCounts(
    spacePath: string,
    filePath: string,
    tableId: string,
    columnName: string,
    query: BaseRowQuery
  ): Promise<BaseRowGroupCount[]> {
    const response = await this.run(spacePath, {
      operation: "group-counts",
      filePath,
      tableId,
      columnName,
      query,
    })
    if (!response.ok) throw this.error(response.name, response.message)
    if (response.operation !== "group-counts") {
      throw new Error("Base query worker returned an unexpected response")
    }
    return response.counts
  }

  async close(spacePath?: string): Promise<void> {
    const canonicalPath = spacePath ? path.resolve(spacePath) : undefined
    const handles = [...this.workers.values()].filter(
      (handle) => !canonicalPath || handle.spacePath === canonicalPath
    )
    await Promise.all(
      handles.map(async (handle) => {
        this.rejectHandle(
          handle,
          this.error("BaseQueryClosedError", "Base query worker closed")
        )
        await handle.worker.terminate().catch(() => undefined)
      })
    )
  }

  private run(
    spacePath: string,
    request: BaseQueryRequestInput
  ): Promise<BaseQueryWorkerResponse> {
    const handle = this.getHandle(path.resolve(spacePath))
    const id = `base-query-${++this.requestSequence}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(
          `Base query timed out after ${QUERY_TIMEOUT_MS}ms`
        )
        this.rejectHandle(handle, error)
        void handle.worker.terminate()
      }, QUERY_TIMEOUT_MS)
      handle.pending.set(id, { resolve, reject, timer })
      try {
        handle.worker.postMessage({
          ...request,
          id,
        } satisfies BaseQueryWorkerRequest)
      } catch (error) {
        this.rejectHandle(
          handle,
          error instanceof Error ? error : new Error(String(error))
        )
        void handle.worker.terminate()
      }
    })
  }

  private getHandle(spacePath: string): BaseQueryWorkerHandle {
    const existing = this.workers.get(spacePath)
    if (existing && !existing.closed) return existing

    const worker = new Worker(path.join(__dirname, "base-query-worker.js"))
    const handle: BaseQueryWorkerHandle = {
      spacePath,
      worker,
      pending: new Map(),
      closed: false,
    }
    this.workers.set(spacePath, handle)
    worker.on("message", (response: BaseQueryWorkerResponse) => {
      const pending = handle.pending.get(response.id)
      if (!pending) return
      clearTimeout(pending.timer)
      handle.pending.delete(response.id)
      pending.resolve(response)
    })
    worker.once("error", (error) => this.rejectHandle(handle, error))
    worker.once("exit", (code) => {
      if (handle.closed) return
      this.rejectHandle(
        handle,
        new Error(`Base query worker exited with code ${code}`)
      )
    })
    return handle
  }

  private rejectHandle(handle: BaseQueryWorkerHandle, error: Error): void {
    if (handle.closed) return
    handle.closed = true
    if (this.workers.get(handle.spacePath) === handle) {
      this.workers.delete(handle.spacePath)
    }
    for (const pending of handle.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    handle.pending.clear()
  }

  private error(name: string, message: string): Error {
    const error = new Error(message)
    error.name = name
    return error
  }
}
