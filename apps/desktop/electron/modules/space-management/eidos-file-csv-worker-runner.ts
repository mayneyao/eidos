import type {
  EidosFileCsvExportOptions,
  EidosFileCsvExportResult,
  EidosFileCsvImportOptions,
  EidosFileCsvImportPlan,
  EidosFileCsvImportResult,
} from "@eidos.space/eidos-file"
import path from "node:path"
import { Worker } from "node:worker_threads"

import { Injectable, Inject } from "../../common/di"
import type {
  EidosFileCsvFileFingerprint,
  EidosFileCsvWorkerMessage,
  EidosFileCsvWorkerProgress,
  EidosFileCsvWorkerRequest,
  EidosFileCsvWorkerResponse,
} from "./eidos-file-csv-worker-protocol"
import { SpaceResourceLifecycle } from "./space-resource-lifecycle"

const PLAN_TIMEOUT_MS = 2 * 60_000
const IMPORT_TIMEOUT_MS = 10 * 60_000
const EXPORT_TIMEOUT_MS = 30 * 60_000

export interface EidosFileCsvWorkerOperation {
  id: string
  onProgress?: (progress: EidosFileCsvWorkerProgress["progress"]) => void
}

interface ActiveEidosFileCsvOperation {
  spacePath: string
  cancel: () => void
}

function isProgressMessage(
  message: EidosFileCsvWorkerMessage
): message is EidosFileCsvWorkerProgress {
  return "type" in message && message.type === "progress"
}

@Injectable()
export class EidosFileCsvWorkerRunner {
  private readonly workers = new Map<Worker, string>()
  private readonly operations = new Map<string, ActiveEidosFileCsvOperation>()

  constructor(
    @Inject(SpaceResourceLifecycle) resourceLifecycle: SpaceResourceLifecycle
  ) {
    resourceLifecycle.register(
      "eidos-file-csv-workers",
      (spacePath) => this.close(spacePath),
      () => this.close()
    )
  }

  async plan(
    spacePath: string,
    sourcePath: string,
    fileName: string,
    fingerprint: EidosFileCsvFileFingerprint,
    options: EidosFileCsvImportOptions = {},
    operation?: EidosFileCsvWorkerOperation
  ): Promise<EidosFileCsvImportPlan> {
    const response = await this.run(
      { operation: "plan", sourcePath, fileName, fingerprint, options },
      PLAN_TIMEOUT_MS,
      spacePath,
      operation
    )
    if (!response.ok) throw this.error(response.name, response.message)
    if (response.operation !== "plan") {
      throw new Error("Eidos File CSV worker returned an unexpected response")
    }
    return response.plan
  }

  async import(
    spacePath: string,
    sourcePath: string,
    fileName: string,
    fingerprint: EidosFileCsvFileFingerprint,
    targetPath: string,
    options: EidosFileCsvImportOptions = {},
    operation?: EidosFileCsvWorkerOperation
  ): Promise<EidosFileCsvImportResult> {
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
      spacePath,
      operation
    )
    if (!response.ok) throw this.error(response.name, response.message)
    if (response.operation !== "import") {
      throw new Error("Eidos File CSV worker returned an unexpected response")
    }
    return response.result
  }

  async export(
    spacePath: string,
    sourcePath: string,
    targetPath: string,
    tableId: string,
    options: EidosFileCsvExportOptions,
    operation?: EidosFileCsvWorkerOperation
  ): Promise<EidosFileCsvExportResult> {
    const response = await this.run(
      {
        operation: "export",
        sourcePath,
        targetPath,
        tableId,
        options,
      },
      EXPORT_TIMEOUT_MS,
      spacePath,
      operation
    )
    if (!response.ok) throw this.error(response.name, response.message)
    if (response.operation !== "export") {
      throw new Error("Eidos File CSV worker returned an unexpected response")
    }
    return response.result
  }

  close(spacePath?: string): void {
    const canonicalPath = spacePath ? path.resolve(spacePath) : undefined
    for (const operation of this.operations.values()) {
      if (canonicalPath && operation.spacePath !== canonicalPath) continue
      operation.cancel()
    }
    for (const [worker, ownerPath] of this.workers) {
      if (canonicalPath && ownerPath !== canonicalPath) continue
      void worker.terminate()
      this.workers.delete(worker)
    }
  }

  cancel(operationId: string): boolean {
    const operation = this.operations.get(operationId)
    if (!operation) return false
    operation.cancel()
    return true
  }

  private run(
    request: EidosFileCsvWorkerRequest,
    timeoutMs: number,
    spacePath: string,
    operation?: EidosFileCsvWorkerOperation
  ): Promise<EidosFileCsvWorkerResponse> {
    if (operation && this.operations.has(operation.id)) {
      throw new Error(
        `Eidos File CSV operation already exists: ${operation.id}`
      )
    }
    const canonicalSpacePath = path.resolve(spacePath)
    const worker = new Worker(
      path.join(__dirname, "eidos-file-csv-worker.js"),
      {
        workerData: request,
      }
    )
    this.workers.set(worker, canonicalSpacePath)
    return new Promise((resolve, reject) => {
      let settled = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const finish = (action: () => void) => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        this.workers.delete(worker)
        if (operation?.id) this.operations.delete(operation.id)
        action()
      }
      const terminateAndReject = (error: Error) => {
        void worker.terminate().then(
          () => reject(error),
          () => reject(error)
        )
      }
      const cancel = () => {
        const error = new Error("Eidos File CSV operation canceled")
        error.name = "EidosFileCsvCanceledError"
        finish(() => terminateAndReject(error))
      }
      if (operation) {
        this.operations.set(operation.id, {
          spacePath: canonicalSpacePath,
          cancel,
        })
      }
      timer = setTimeout(() => {
        const error = new Error(
          `Eidos File CSV operation timed out after ${timeoutMs}ms`
        )
        finish(() => terminateAndReject(error))
      }, timeoutMs)
      worker.on("message", (message: EidosFileCsvWorkerMessage) => {
        if (isProgressMessage(message)) {
          operation?.onProgress?.(message.progress)
          return
        }
        finish(() => resolve(message))
      })
      worker.once("error", (error) => finish(() => reject(error)))
      worker.once("exit", (code) => {
        finish(() =>
          reject(
            new Error(
              code === 0
                ? "Eidos File CSV worker exited without a response"
                : `Eidos File CSV worker exited with code ${code}`
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
