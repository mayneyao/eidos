import type { DatabaseSnapshot, RelationDetails, RelationPage } from "../types"
import type {
  SQLiteViewerAction,
  SQLiteViewerRequest,
  SQLiteViewerResponse,
  SQLiteViewerResult,
} from "./protocol"

export interface SQLiteViewerClient {
  close(): Promise<void>
  getDetails(name: string): Promise<RelationDetails>
  getPage(name: string, offset: number, limit: number): Promise<RelationPage>
  open(fileName: string, bytes: ArrayBuffer): Promise<DatabaseSnapshot>
  terminate(): void
}

interface PendingCall {
  reject(reason: Error): void
  resolve(value: SQLiteViewerResult): void
}

export class SQLiteViewerWorkerClient implements SQLiteViewerClient {
  private readonly pending = new Map<number, PendingCall>()
  private readonly worker: Worker
  private nextId = 1
  private terminated = false

  constructor() {
    this.worker = new Worker(
      new URL("./sqlite-viewer.worker.ts", import.meta.url),
      { name: "sqlite-web-viewer", type: "module" }
    )
    this.worker.addEventListener(
      "message",
      (event: MessageEvent<SQLiteViewerResponse>) => {
        const pending = this.pending.get(event.data.id)
        if (!pending) return
        this.pending.delete(event.data.id)
        if (event.data.ok) {
          pending.resolve(event.data.result)
        } else {
          const error = new Error(event.data.error.message)
          error.name = event.data.error.name
          if (event.data.error.stack) error.stack = event.data.error.stack
          pending.reject(error)
        }
      }
    )
    this.worker.addEventListener("error", (event) => {
      const error = new Error(
        event.message || "The SQLite WebAssembly worker stopped unexpectedly"
      )
      for (const pending of this.pending.values()) pending.reject(error)
      this.pending.clear()
    })
  }

  private call<T extends SQLiteViewerResult>(
    action: SQLiteViewerAction,
    transfers: Transferable[] = []
  ): Promise<T> {
    if (this.terminated) {
      return Promise.reject(new Error("The SQLite viewer worker is closed"))
    }
    const id = this.nextId++
    const request: SQLiteViewerRequest = { action, id }
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        reject,
        resolve: (value) => resolve(value as T),
      })
      this.worker.postMessage(request, transfers)
    })
  }

  open(fileName: string, bytes: ArrayBuffer): Promise<DatabaseSnapshot> {
    return this.call({ bytes, fileName, type: "open" }, [bytes])
  }

  getDetails(name: string): Promise<RelationDetails> {
    return this.call({ name, type: "details" })
  }

  getPage(name: string, offset: number, limit: number): Promise<RelationPage> {
    return this.call({ limit, name, offset, type: "page" })
  }

  async close(): Promise<void> {
    await this.call({ type: "close" })
  }

  terminate(): void {
    if (this.terminated) return
    this.terminated = true
    this.worker.terminate()
    const error = new Error("The SQLite viewer worker was closed")
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
}
