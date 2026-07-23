import type {
  EidosFileColumnStatConfig,
  EidosFileColumnStatResult,
  EidosFileRow,
  EidosFileRowGroupCount,
  EidosFileRowPage,
  EidosFileRowPageOptions,
  EidosFileRowQuery,
} from "@eidos.space/eidos-file"
import path from "node:path"
import { Worker } from "node:worker_threads"

import { Inject, Injectable } from "../../common/di"
import type {
  EidosFileQueryWorkerRequest,
  EidosFileQueryWorkerResponse,
} from "./eidos-file-query-worker-protocol"
import { SpaceResourceLifecycle } from "./space-resource-lifecycle"

const QUERY_TIMEOUT_MS = 30_000
const MAX_QUERY_WORKERS_PER_SPACE = 2

interface PendingEidosFileQuery {
  resolve: (response: EidosFileQueryWorkerResponse) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface EidosFileQueryWorkerHandle {
  spacePath: string
  worker: Worker
  pending: Map<string, PendingEidosFileQuery>
  closed: boolean
}

type EidosFileQueryRequestInput =
  | Omit<Extract<EidosFileQueryWorkerRequest, { operation: "page" }>, "id">
  | Omit<Extract<EidosFileQueryWorkerRequest, { operation: "row" }>, "id">
  | Omit<
      Extract<EidosFileQueryWorkerRequest, { operation: "group-counts" }>,
      "id"
    >
  | Omit<
      Extract<EidosFileQueryWorkerRequest, { operation: "column-stats" }>,
      "id"
    >

@Injectable()
export class EidosFileQueryWorkerRunner {
  private readonly workers = new Map<string, EidosFileQueryWorkerHandle[]>()
  private readonly inFlight = new Map<
    string,
    Promise<EidosFileQueryWorkerResponse>
  >()
  private requestSequence = 0

  constructor(
    @Inject(SpaceResourceLifecycle) resourceLifecycle: SpaceResourceLifecycle
  ) {
    resourceLifecycle.register(
      "eidos-file-query-workers",
      (spacePath) => this.close(spacePath),
      () => this.close()
    )
  }

  async page(
    spacePath: string,
    filePath: string,
    tableId: string,
    options: EidosFileRowPageOptions
  ): Promise<EidosFileRowPage> {
    const response = await this.run(spacePath, {
      operation: "page",
      filePath,
      tableId,
      options,
    })
    if (!response.ok) throw this.error(response.name, response.message)
    if (response.operation !== "page") {
      throw new Error("Eidos File query worker returned an unexpected response")
    }
    return response.page
  }

  async row(
    spacePath: string,
    filePath: string,
    tableId: string,
    rowId: string
  ): Promise<EidosFileRow | null> {
    const response = await this.run(spacePath, {
      operation: "row",
      filePath,
      tableId,
      rowId,
    })
    if (!response.ok) throw this.error(response.name, response.message)
    if (response.operation !== "row") {
      throw new Error("Eidos File query worker returned an unexpected response")
    }
    return response.row
  }

  async groupCounts(
    spacePath: string,
    filePath: string,
    tableId: string,
    fieldId: string,
    query: EidosFileRowQuery
  ): Promise<EidosFileRowGroupCount[]> {
    const response = await this.run(spacePath, {
      operation: "group-counts",
      filePath,
      tableId,
      fieldId,
      query,
    })
    if (!response.ok) throw this.error(response.name, response.message)
    if (response.operation !== "group-counts") {
      throw new Error("Eidos File query worker returned an unexpected response")
    }
    return response.counts
  }

  async columnStats(
    spacePath: string,
    filePath: string,
    tableId: string,
    configs: EidosFileColumnStatConfig[],
    query: EidosFileRowQuery
  ): Promise<EidosFileColumnStatResult[]> {
    const response = await this.run(spacePath, {
      operation: "column-stats",
      filePath,
      tableId,
      configs,
      query,
    })
    if (!response.ok) throw this.error(response.name, response.message)
    if (response.operation !== "column-stats") {
      throw new Error("Eidos File query worker returned an unexpected response")
    }
    return response.stats
  }

  async close(spacePath?: string): Promise<void> {
    const canonicalPath = spacePath ? path.resolve(spacePath) : undefined
    const handles = [...this.workers.entries()].flatMap(
      ([candidatePath, pool]) =>
        !canonicalPath || candidatePath === canonicalPath ? pool : []
    )
    await Promise.all(
      handles.map(async (handle) => {
        this.rejectHandle(
          handle,
          this.error(
            "EidosFileQueryClosedError",
            "Eidos File query worker closed"
          )
        )
        await handle.worker.terminate().catch(() => undefined)
      })
    )
  }

  private run(
    spacePath: string,
    request: EidosFileQueryRequestInput
  ): Promise<EidosFileQueryWorkerResponse> {
    const canonicalSpacePath = path.resolve(spacePath)
    const requestKey = `${canonicalSpacePath}\u0000${JSON.stringify(request)}`
    const existing = this.inFlight.get(requestKey)
    if (existing) return existing

    const operation = this.dispatch(canonicalSpacePath, request)
    this.inFlight.set(requestKey, operation)
    void operation.then(
      () => this.clearInFlight(requestKey, operation),
      () => this.clearInFlight(requestKey, operation)
    )
    return operation
  }

  private dispatch(
    spacePath: string,
    request: EidosFileQueryRequestInput
  ): Promise<EidosFileQueryWorkerResponse> {
    const handle = this.getHandle(spacePath)
    const id = `eidos-file-query-${++this.requestSequence}`
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(
          `Eidos File query timed out after ${QUERY_TIMEOUT_MS}ms`
        )
        this.rejectHandle(handle, error)
        void handle.worker.terminate()
      }, QUERY_TIMEOUT_MS)
      handle.pending.set(id, { resolve, reject, timer })
      try {
        handle.worker.postMessage({
          ...request,
          id,
        } satisfies EidosFileQueryWorkerRequest)
      } catch (error) {
        this.rejectHandle(
          handle,
          error instanceof Error ? error : new Error(String(error))
        )
        void handle.worker.terminate()
      }
    })
  }

  private clearInFlight(
    requestKey: string,
    operation: Promise<EidosFileQueryWorkerResponse>
  ): void {
    if (this.inFlight.get(requestKey) === operation) {
      this.inFlight.delete(requestKey)
    }
  }

  private getHandle(spacePath: string): EidosFileQueryWorkerHandle {
    const pool = (this.workers.get(spacePath) ?? []).filter(
      (handle) => !handle.closed
    )
    if (pool.length > 0) this.workers.set(spacePath, pool)
    else this.workers.delete(spacePath)

    const idle = pool.find((handle) => handle.pending.size === 0)
    if (idle) return idle
    if (pool.length >= MAX_QUERY_WORKERS_PER_SPACE) {
      return pool.reduce((leastBusy, candidate) =>
        candidate.pending.size < leastBusy.pending.size ? candidate : leastBusy
      )
    }

    return this.createHandle(spacePath, pool)
  }

  private createHandle(
    spacePath: string,
    pool: EidosFileQueryWorkerHandle[]
  ): EidosFileQueryWorkerHandle {
    const worker = new Worker(
      path.join(__dirname, "eidos-file-query-worker.js")
    )
    const handle: EidosFileQueryWorkerHandle = {
      spacePath,
      worker,
      pending: new Map(),
      closed: false,
    }
    this.workers.set(spacePath, [...pool, handle])
    worker.on("message", (response: EidosFileQueryWorkerResponse) => {
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
        new Error(`Eidos File query worker exited with code ${code}`)
      )
    })
    return handle
  }

  private rejectHandle(handle: EidosFileQueryWorkerHandle, error: Error): void {
    if (handle.closed) return
    handle.closed = true
    const pool = this.workers.get(handle.spacePath)
    const remaining = pool?.filter((candidate) => candidate !== handle) ?? []
    if (remaining.length > 0) {
      this.workers.set(handle.spacePath, remaining)
    } else {
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
