import path from "node:path"
import { utilityProcess, type UtilityProcess } from "electron"

import type {
  GraftSdkCommand,
  GraftSdkWorkerRequest,
  GraftSdkWorkerResponse,
  GraftTransferProgress,
} from "../../shared/graft-sdk-contracts"
import type {
  SpaceVersionTextContentDiff,
  SpaceVersionTextContentRequest,
} from "../../shared/contracts"
import {
  createTextLineBuffer,
  eidosLiteLogger,
  logCorrelationKey,
} from "../logging"
import type { GraftSdkTransport } from "./graft-sdk-transport"

interface PendingRequest {
  child: UtilityProcess
  operation: string
  repositoryKey: string | null
  startedAtMs: number
  onProgress?: (progress: GraftTransferProgress) => void
  cleanup(): void
  resolve(value: unknown): void
  reject(error: Error): void
}

interface GraftUtilityTransportOptions {
  repositoryKey?(root: string): string
}

function isWorkerResponse(
  value: unknown
): value is Exclude<GraftSdkWorkerResponse, { type: "progress" }> {
  return (
    typeof value === "object" &&
    value !== null &&
    "requestId" in value &&
    typeof value.requestId === "number" &&
    "ok" in value &&
    typeof value.ok === "boolean"
  )
}

function isWorkerProgress(
  value: unknown
): value is Extract<GraftSdkWorkerResponse, { type: "progress" }> {
  return (
    typeof value === "object" &&
    value !== null &&
    "requestId" in value &&
    typeof value.requestId === "number" &&
    "type" in value &&
    value.type === "progress" &&
    "progress" in value
  )
}

export class GraftUtilityTransport implements GraftSdkTransport {
  private child: UtilityProcess | null = null
  private pending = new Map<number, PendingRequest>()
  private nextRequestId = 1
  private readonly expectedExits = new WeakSet<UtilityProcess>()
  private openInFlight: Promise<void> | null = null
  target: string | null = null

  constructor(
    private readonly workerPath: string,
    private readonly options: GraftUtilityTransportOptions = {}
  ) {}

  async open(root: string): Promise<void> {
    const target = path.resolve(root)
    if (this.openInFlight) {
      await this.openInFlight
      if (this.child && this.target === target) return
    }
    if (this.child && this.target === target) return
    this.openInFlight = this.openWorker(target).finally(() => {
      this.openInFlight = null
    })
    return this.openInFlight
  }

  async reopen(): Promise<void> {
    if (!this.target) throw new Error("Graft repository session is not open")
    await this.open(this.target)
    await this.request({
      requestId: this.nextRequestId++,
      type: "reopen",
    })
  }

  async close(): Promise<void> {
    const child = this.child
    this.target = null
    if (!child) return
    this.expectedExits.add(child)
    try {
      await this.request({
        requestId: this.nextRequestId++,
        type: "close",
      })
    } finally {
      if (this.child === child) this.child = null
      child.kill()
    }
  }

  command(
    command: GraftSdkCommand,
    args: unknown[] = [],
    options: {
      signal?: AbortSignal
      onProgress?: (progress: GraftTransferProgress) => void
    } = {}
  ): Promise<unknown> {
    if (!this.child) {
      return Promise.reject(new Error("Graft SDK utility process is closed"))
    }
    return this.request(
      {
        requestId: this.nextRequestId++,
        type: "command",
        command,
        args,
      },
      options.signal,
      options.onProgress
    )
  }

  revisionTextDiff(
    request: SpaceVersionTextContentRequest
  ): Promise<SpaceVersionTextContentDiff> {
    if (!this.child) {
      return Promise.reject(new Error("Graft SDK utility process is closed"))
    }
    return this.request({
      requestId: this.nextRequestId++,
      type: "revisionTextDiff",
      ...request,
    }) as Promise<SpaceVersionTextContentDiff>
  }

  async clone(
    targetDirectory: string,
    remoteUrl: string,
    token?: string,
    options: { onProgress?: (progress: GraftTransferProgress) => void } = {}
  ): Promise<unknown> {
    const transport = new GraftUtilityTransport(this.workerPath, this.options)
    await transport.open(targetDirectory)
    try {
      return await transport.command(
        "cloneRepository",
        [
          {
            remoteUrl,
            branch: "main",
            ...(token ? { bearerToken: token } : {}),
          },
        ],
        options
      )
    } finally {
      await transport.close()
    }
  }

  async terminateForTesting(): Promise<void> {
    const child = this.child
    if (!child) throw new Error("Graft SDK utility process is closed")
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve())
      child.kill()
    })
  }

  private async openWorker(target: string): Promise<void> {
    if (this.child) await this.close()
    const child = utilityProcess.fork(this.workerPath, [], {
      serviceName: `Graft · ${path.basename(target)}`,
      stdio: "pipe",
      env: {
        ...process.env,
        GRAFT_PUSH_TRACE: "1",
      },
    })
    const repositoryKey = this.repositoryKey(target)
    eidosLiteLogger()?.record("info", "graft-worker", "graft.worker.started", {
      repositoryKey,
      pid: child.pid,
    })
    this.child = child
    this.target = target
    child.stdout?.on("data", (chunk: Buffer | string) => {
      eidosLiteLogger()?.record(
        "debug",
        "graft-worker",
        "graft.worker.stdout",
        {
          repositoryKey,
          output: String(chunk),
        }
      )
    })
    const stderrLines = createTextLineBuffer((line) => {
      const output = line.trim()
      if (!output) return
      const tracePrefix = "graft-push-trace "
      if (output.startsWith(tracePrefix)) {
        let trace: unknown = output.slice(tracePrefix.length)
        try {
          trace = JSON.parse(String(trace))
        } catch {
          // A partial trace line remains useful as sanitized text.
        }
        eidosLiteLogger()?.record("debug", "graft-worker", "graft.http.trace", {
          repositoryKey,
          trace,
        })
      } else {
        eidosLiteLogger()?.record(
          "warn",
          "graft-worker",
          "graft.worker.stderr",
          {
            repositoryKey,
            output,
          }
        )
      }
    })
    child.stderr?.on("data", stderrLines.write)
    child.stderr?.once("end", stderrLines.end)
    child.on("message", (message) => this.receive(child, message))
    child.on("exit", (code) => {
      const expected = this.expectedExits.has(child)
      eidosLiteLogger()?.record(
        expected ? "info" : "error",
        "graft-worker",
        "graft.worker.exited",
        {
          repositoryKey,
          expected,
          exitCode: code,
        }
      )
      if (this.child === child) this.child = null
      const error = Object.assign(
        new Error(
          expected
            ? "Graft SDK utility process closed"
            : `Graft SDK utility process crashed with exit code ${code}`
        ),
        {
          code: expected
            ? "EIDOS_LITE_GRAFT_WORKER_CLOSED"
            : "EIDOS_LITE_GRAFT_WORKER_CRASHED",
        }
      )
      for (const [requestId, pending] of this.pending) {
        if (pending.child !== child) continue
        pending.cleanup()
        this.logRequestCompleted(pending, error)
        pending.reject(error)
        this.pending.delete(requestId)
      }
    })
    try {
      await this.request({
        requestId: this.nextRequestId++,
        type: "open",
        root: target,
      })
    } catch (error) {
      if (this.child === child) this.child = null
      child.kill()
      throw error
    }
  }

  private request(
    request: Exclude<GraftSdkWorkerRequest, { type: "cancel" }>,
    signal?: AbortSignal,
    onProgress?: (progress: GraftTransferProgress) => void
  ): Promise<unknown> {
    const child = this.child
    if (!child) {
      return Promise.reject(new Error("Graft SDK utility process is closed"))
    }
    if (signal?.aborted) return Promise.reject(abortError())
    const operation =
      request.type === "command" ? request.command : request.type
    const repositoryKey = this.target ? this.repositoryKey(this.target) : null
    const startedAtMs = Date.now()
    eidosLiteLogger()?.record(
      this.remoteOperation(operation) ? "info" : "debug",
      "graft-worker",
      "graft.command.started",
      {
        repositoryKey,
        requestId: request.requestId,
        operation,
      }
    )
    return new Promise((resolve, reject) => {
      const cancel = () => {
        if (this.child === child) {
          child.postMessage({ type: "cancel", requestId: request.requestId })
        }
      }
      const cleanup = () => signal?.removeEventListener("abort", cancel)
      signal?.addEventListener("abort", cancel, { once: true })
      this.pending.set(request.requestId, {
        child,
        operation,
        repositoryKey,
        startedAtMs,
        onProgress,
        cleanup,
        resolve,
        reject,
      })
      child.postMessage(request)
    })
  }

  private receive(child: UtilityProcess, message: unknown): void {
    if (isWorkerProgress(message)) {
      const pending = this.pending.get(message.requestId)
      if (pending?.child === child) pending.onProgress?.(message.progress)
      return
    }
    if (!isWorkerResponse(message)) return
    const pending = this.pending.get(message.requestId)
    if (!pending || pending.child !== child) return
    this.pending.delete(message.requestId)
    pending.cleanup()
    if (message.ok) {
      this.logRequestCompleted(pending)
      pending.resolve(message.result)
      return
    }
    const error = new Error(message.error.message)
    error.name = message.error.name
    if (message.error.stack) error.stack = message.error.stack
    if (message.error.code) Object.assign(error, { code: message.error.code })
    this.logRequestCompleted(pending, error)
    pending.reject(error)
  }

  private repositoryKey(root: string): string {
    return this.options.repositoryKey?.(root) ?? logCorrelationKey(root)
  }

  private remoteOperation(operation: string): boolean {
    return ["push", "fetch", "pull", "cloneRepository"].includes(operation)
  }

  private logRequestCompleted(pending: PendingRequest, error?: Error): void {
    const level = error
      ? "error"
      : this.remoteOperation(pending.operation)
        ? "info"
        : "debug"
    eidosLiteLogger()?.record(
      level,
      "graft-worker",
      error ? "graft.command.failed" : "graft.command.completed",
      {
        repositoryKey: pending.repositoryKey,
        operation: pending.operation,
        durationMs: Math.max(0, Date.now() - pending.startedAtMs),
      },
      error
    )
  }
}

function abortError(): Error {
  const error = new Error("The Graft operation was cancelled")
  error.name = "AbortError"
  return error
}
