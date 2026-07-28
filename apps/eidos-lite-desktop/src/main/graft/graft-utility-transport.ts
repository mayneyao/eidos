import path from "node:path"
import { utilityProcess, type UtilityProcess } from "electron"

import type {
  GraftSdkCommand,
  GraftSdkWorkerRequest,
  GraftSdkWorkerResponse,
} from "../../shared/graft-sdk-contracts"
import type { GraftSdkTransport } from "./graft-sdk-transport"

interface PendingRequest {
  resolve(value: unknown): void
  reject(error: Error): void
}

function isWorkerResponse(value: unknown): value is GraftSdkWorkerResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "requestId" in value &&
    typeof value.requestId === "number" &&
    "ok" in value &&
    typeof value.ok === "boolean"
  )
}

export class GraftUtilityTransport implements GraftSdkTransport {
  private child: UtilityProcess | null = null
  private pending = new Map<number, PendingRequest>()
  private nextRequestId = 1
  private expectedExit = false
  private openInFlight: Promise<void> | null = null
  target: string | null = null

  constructor(private readonly workerPath: string) {}

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
    this.expectedExit = true
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

  command(command: GraftSdkCommand, args: unknown[] = []): Promise<unknown> {
    if (!this.child) {
      return Promise.reject(new Error("Graft SDK utility process is closed"))
    }
    return this.request({
      requestId: this.nextRequestId++,
      type: "command",
      command,
      args,
    })
  }

  async clone(
    targetDirectory: string,
    remoteUrl: string,
    token?: string
  ): Promise<unknown> {
    const transport = new GraftUtilityTransport(this.workerPath)
    await transport.open(targetDirectory)
    try {
      return await transport.command("cloneRepository", [
        {
          remoteUrl,
          branch: "main",
          ...(token ? { bearerToken: token } : {}),
        },
      ])
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
    })
    this.child = child
    this.target = target
    this.expectedExit = false
    child.on("message", (message) => this.receive(message))
    child.on("exit", (code) => {
      const expected = this.expectedExit
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
      for (const pending of this.pending.values()) pending.reject(error)
      this.pending.clear()
      this.expectedExit = false
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

  private request(request: GraftSdkWorkerRequest): Promise<unknown> {
    const child = this.child
    if (!child) {
      return Promise.reject(new Error("Graft SDK utility process is closed"))
    }
    return new Promise((resolve, reject) => {
      this.pending.set(request.requestId, { resolve, reject })
      child.postMessage(request)
    })
  }

  private receive(message: unknown): void {
    if (!isWorkerResponse(message)) return
    const pending = this.pending.get(message.requestId)
    if (!pending) return
    this.pending.delete(message.requestId)
    if (message.ok) {
      pending.resolve(message.result)
      return
    }
    const error = new Error(message.error.message)
    error.name = message.error.name
    if (message.error.stack) error.stack = message.error.stack
    if (message.error.code) Object.assign(error, { code: message.error.code })
    pending.reject(error)
  }
}
