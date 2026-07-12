import type {
  BaseCsvImportOptions,
  BaseCsvImportPlan,
  BaseCsvImportResult,
} from "@eidos.space/base"
import path from "node:path"
import { Worker } from "node:worker_threads"

import { Injectable, Inject } from "../../common/di"
import type {
  BaseCsvFileFingerprint,
  BaseCsvWorkerRequest,
  BaseCsvWorkerResponse,
} from "./base-csv-worker-protocol"
import { SpaceResourceLifecycle } from "./space-resource-lifecycle"

const PLAN_TIMEOUT_MS = 2 * 60_000
const IMPORT_TIMEOUT_MS = 10 * 60_000

@Injectable()
export class BaseCsvWorkerRunner {
  private readonly workers = new Map<Worker, string>()

  constructor(
    @Inject(SpaceResourceLifecycle) resourceLifecycle: SpaceResourceLifecycle
  ) {
    resourceLifecycle.register(
      "base-csv-workers",
      (spacePath) => this.close(spacePath),
      () => this.close()
    )
  }

  async plan(
    spacePath: string,
    sourcePath: string,
    fileName: string,
    fingerprint: BaseCsvFileFingerprint,
    options: BaseCsvImportOptions = {}
  ): Promise<BaseCsvImportPlan> {
    const response = await this.run(
      { operation: "plan", sourcePath, fileName, fingerprint, options },
      PLAN_TIMEOUT_MS,
      spacePath
    )
    if (!response.ok) throw this.error(response.name, response.message)
    if (response.operation !== "plan") {
      throw new Error("Base CSV worker returned an unexpected response")
    }
    return response.plan
  }

  async import(
    spacePath: string,
    sourcePath: string,
    fileName: string,
    fingerprint: BaseCsvFileFingerprint,
    targetPath: string,
    options: BaseCsvImportOptions = {}
  ): Promise<BaseCsvImportResult> {
    const response = await this.run(
      {
        operation: "import",
        sourcePath,
        fileName,
        fingerprint,
        targetPath,
        options,
      },
      IMPORT_TIMEOUT_MS,
      spacePath
    )
    if (!response.ok) throw this.error(response.name, response.message)
    if (response.operation !== "import") {
      throw new Error("Base CSV worker returned an unexpected response")
    }
    return response.result
  }

  close(spacePath?: string): void {
    const canonicalPath = spacePath ? path.resolve(spacePath) : undefined
    for (const [worker, ownerPath] of this.workers) {
      if (canonicalPath && ownerPath !== canonicalPath) continue
      void worker.terminate()
      this.workers.delete(worker)
    }
  }

  private run(
    request: BaseCsvWorkerRequest,
    timeoutMs: number,
    spacePath: string
  ): Promise<BaseCsvWorkerResponse> {
    const worker = new Worker(path.join(__dirname, "base-csv-worker.js"), {
      workerData: request,
    })
    this.workers.set(worker, path.resolve(spacePath))
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (operation: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        this.workers.delete(worker)
        operation()
      }
      const timer = setTimeout(() => {
        finish(() => {
          void worker.terminate()
          reject(new Error(`Base CSV operation timed out after ${timeoutMs}ms`))
        })
      }, timeoutMs)
      worker.once("message", (response: BaseCsvWorkerResponse) => {
        finish(() => resolve(response))
      })
      worker.once("error", (error) => finish(() => reject(error)))
      worker.once("exit", (code) => {
        finish(() =>
          reject(
            new Error(
              code === 0
                ? "Base CSV worker exited without a response"
                : `Base CSV worker exited with code ${code}`
            )
          )
        )
      })
    })
  }

  private error(name: string, message: string): Error {
    const error = new Error(message)
    error.name = name
    return error
  }
}
