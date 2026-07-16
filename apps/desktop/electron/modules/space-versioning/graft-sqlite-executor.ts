import type {
  GraftPragmaExecutor,
  GraftRunOptions,
} from "@eidos.space/graft-client"
import { fork, type ChildProcess } from "node:child_process"
import path from "node:path"

import { Injectable } from "../../common/di"
import { getResourcePath } from "../../utils/resources"
import type {
  GraftWorkerInitData,
  GraftWorkerRequest,
  GraftWorkerResponse,
} from "./graft-worker-protocol"

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_BUFFER_BYTES = 16 * 1024 * 1024
const IDLE_CLOSE_MS = 60_000

interface PendingRequest {
  resolve(value: unknown): void
  reject(error: Error): void
  timer: ReturnType<typeof setTimeout>
}

interface WorkerState {
  worker: ChildProcess
  nextRequestId: number
  pending: Map<number, PendingRequest>
  idleTimer: ReturnType<typeof setTimeout> | null
  closing: boolean
}

function send(
  repositoryPath: string,
  state: WorkerState,
  request: GraftWorkerRequest,
  onError: (error: Error) => void
): void {
  if (!state.worker.connected) {
    onError(new Error(`Graft worker is not connected for ${repositoryPath}`))
    return
  }
  state.worker.send(request, (error) => {
    if (error) onError(error)
  })
}

function positiveLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Graft execution limits must be positive integers")
  }
  return value
}

@Injectable()
export class GraftSqliteExecutor implements GraftPragmaExecutor {
  private readonly workers = new Map<string, WorkerState>()

  execute(
    repositoryPath: string,
    pragma: string,
    argument?: string,
    options: GraftRunOptions = {}
  ): Promise<unknown> {
    const timeoutMs = positiveLimit(options.timeoutMs, DEFAULT_TIMEOUT_MS)
    const maxBufferBytes = positiveLimit(
      options.maxBufferBytes,
      DEFAULT_MAX_BUFFER_BYTES
    )
    const canonicalPath = path.resolve(repositoryPath)
    const state = this.worker(canonicalPath)
    if (state.idleTimer) {
      clearTimeout(state.idleTimer)
      state.idleTimer = null
    }
    const id = state.nextRequestId++

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const pending = state.pending.get(id)
        if (!pending) return
        state.pending.delete(id)
        pending.reject(
          new Error(`Graft ${pragma} timed out after ${timeoutMs}ms`)
        )
        this.destroyWorker(
          canonicalPath,
          state,
          new Error("Graft worker was terminated after a timeout")
        )
      }, timeoutMs)

      state.pending.set(id, { resolve, reject, timer })
      send(
        canonicalPath,
        state,
        {
          type: "execute",
          id,
          pragma,
          argument,
          maxBufferBytes,
        },
        (error) => this.destroyWorker(canonicalPath, state, error)
      )
    })
  }

  async close(repositoryPath?: string): Promise<void> {
    if (repositoryPath !== undefined) {
      const canonicalPath = path.resolve(repositoryPath)
      const state = this.workers.get(canonicalPath)
      if (state) await this.closeWorker(canonicalPath, state)
      return
    }
    await Promise.all(
      [...this.workers.entries()].map(([key, state]) =>
        this.closeWorker(key, state)
      )
    )
  }

  private worker(repositoryPath: string): WorkerState {
    const existing = this.workers.get(repositoryPath)
    if (existing && !existing.closing) return existing

    const workerPath = path.join(__dirname, "graft-worker.js")
    const workerData: GraftWorkerInitData = {
      repositoryPath,
      extensionPath: getResourcePath("dist-sqlite-ext/libgraft"),
    }
    const worker = fork(workerPath, [], {
      execPath: process.execPath,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    })
    const state: WorkerState = {
      worker,
      nextRequestId: 1,
      pending: new Map(),
      idleTimer: null,
      closing: false,
    }
    this.workers.set(repositoryPath, state)
    send(repositoryPath, state, { type: "init", data: workerData }, (error) =>
      this.destroyWorker(repositoryPath, state, error)
    )
    worker.on("message", (response: GraftWorkerResponse) => {
      this.handleMessage(repositoryPath, state, response)
    })
    worker.on("error", (error) => {
      this.destroyWorker(repositoryPath, state, error)
    })
    worker.on("exit", (code) => {
      if (this.workers.get(repositoryPath) !== state) return
      this.destroyWorker(
        repositoryPath,
        state,
        code === 0
          ? new Error("Graft worker closed")
          : new Error(`Graft worker exited with code ${code}`),
        false
      )
    })
    return state
  }

  private handleMessage(
    repositoryPath: string,
    state: WorkerState,
    response: GraftWorkerResponse
  ): void {
    if (response.type === "closed") return
    const pending = state.pending.get(response.id)
    if (!pending) return
    state.pending.delete(response.id)
    clearTimeout(pending.timer)
    if (response.type === "error") {
      const error = new Error(response.message)
      error.name = response.name
      pending.reject(error)
    } else {
      pending.resolve(response.value)
    }
    if (state.pending.size === 0 && !state.closing) {
      state.idleTimer = setTimeout(() => {
        void this.closeWorker(repositoryPath, state)
      }, IDLE_CLOSE_MS)
    }
  }

  private async closeWorker(
    repositoryPath: string,
    state: WorkerState
  ): Promise<void> {
    if (state.closing) return
    state.closing = true
    if (state.idleTimer) clearTimeout(state.idleTimer)
    state.idleTimer = null

    await new Promise<void>((resolve) => {
      const fallback = setTimeout(() => {
        state.worker.kill()
        resolve()
      }, 1_000)
      state.worker.once("exit", () => {
        clearTimeout(fallback)
        resolve()
      })
      send(repositoryPath, state, { type: "close" }, () => {
        state.worker.kill()
      })
    })
    this.destroyWorker(
      repositoryPath,
      state,
      new Error("Graft repository connection was closed"),
      false
    )
  }

  private destroyWorker(
    repositoryPath: string,
    state: WorkerState,
    error: Error,
    terminate = true
  ): void {
    if (this.workers.get(repositoryPath) !== state) return
    this.workers.delete(repositoryPath)
    state.closing = true
    if (state.idleTimer) clearTimeout(state.idleTimer)
    for (const pending of state.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    state.pending.clear()
    if (terminate) state.worker.kill()
  }
}
