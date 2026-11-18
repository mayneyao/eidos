import { utilityProcess, type UtilityProcess } from "electron"
import type {
  SpacePathSearchHit,
  RuntimeWorkerRequest,
  RuntimeWorkerResponse,
} from "../../shared/contracts"
import type {
  MarkdownLinkBatchOperation,
  MarkdownLinkBatchResult,
  MarkdownLinkMove,
  PreparedMarkdownLinkBatch,
} from "../../shared/markdown-link-batch"
import { defaultRuntimeWorkerPath } from "./runtime-pool"
import {
  captureMarkdownLinkSnapshot,
  planMarkdownLinkMoves,
  applyMarkdownLinkMove,
  type MarkdownLinkSnapshot,
} from "../space/markdown-link-maintenance"

export interface MarkdownLinkMaintenance {
  prepare(
    root: string,
    files: SpacePathSearchHit[]
  ): Promise<PreparedMarkdownLinkBatch>
  apply(moves: MarkdownLinkMove[]): Promise<MarkdownLinkBatchResult>
  skipped(moves: MarkdownLinkMove[]): MarkdownLinkBatchResult
  abort(): void
  dispose(): Promise<void>
}

function skippedOwners(
  owners: string[],
  moves: MarkdownLinkMove[]
): MarkdownLinkBatchResult {
  const moved = (value: string) =>
    moves.reduce(
      (path, move) =>
        path === move.source || path.startsWith(`${move.source}/`)
          ? move.relativePath + path.slice(move.source.length)
          : path,
      value
    )
  return { updatedPaths: [], skippedPaths: owners.map(moved) }
}

/** Preserve the small Markdown-only path without paying process startup. */
export class LocalMarkdownLinkMaintenance implements MarkdownLinkMaintenance {
  private root = ""
  private snapshot: MarkdownLinkSnapshot | null = null
  async prepare(
    root: string,
    files: SpacePathSearchHit[]
  ): Promise<PreparedMarkdownLinkBatch> {
    this.root = root
    this.snapshot = await captureMarkdownLinkSnapshot(root, files)
    return {
      owners: this.owners(),
      stats: {
        snapshots: 1,
        files: files.length,
        parsedDocuments: this.snapshot.documents.length,
        contentDocuments: 0,
        eidosReads: 0,
      },
    }
  }
  private owners(): string[] {
    return [
      ...new Set([
        ...(this.snapshot?.documents.map((document) => document.owner) ?? []),
        ...(this.snapshot?.issues ?? []),
      ]),
    ]
  }
  async apply(moves: MarkdownLinkMove[]): Promise<MarkdownLinkBatchResult> {
    if (!this.snapshot) throw new Error("Markdown batch is not prepared")
    let nextYield = performance.now() + 8
    return applyMarkdownLinkMove(
      this.root,
      await planMarkdownLinkMoves(this.snapshot, moves, async () => {
        if (performance.now() < nextYield) return
        await new Promise<void>((resolve) => setImmediate(resolve))
        nextYield = performance.now() + 8
      })
    )
  }
  skipped(moves: MarkdownLinkMove[]): MarkdownLinkBatchResult {
    return skippedOwners(this.owners(), moves)
  }
  abort(): void {
    this.snapshot = null
  }
  async dispose(): Promise<void> {
    this.snapshot = null
  }
}

/** One private process per filesystem mutation batch, with no UI RuntimePool entries. */
export class MarkdownLinkWorker implements MarkdownLinkMaintenance {
  private readonly child: UtilityProcess
  private readonly pending = new Map<
    number,
    {
      resolve(value: unknown): void
      reject(error: Error): void
      timer: ReturnType<typeof setTimeout>
    }
  >()
  private readonly inFlight = new Set<Promise<unknown>>()
  private sequence = 0
  private exited = false
  private aborted = false
  private readonly exitPromise: Promise<void>
  private settleExit: () => void = () => undefined
  private disposed: Promise<void> | null = null
  private prepared: PreparedMarkdownLinkBatch | null = null
  private completed = false

  get reusable(): boolean {
    return this.completed && !this.exited && !this.aborted && !this.disposed
  }

  constructor(workerPath = defaultRuntimeWorkerPath()) {
    this.exitPromise = new Promise((resolve) => {
      this.settleExit = resolve
    })
    this.child = utilityProcess.fork(workerPath, [], {
      serviceName: "Eidos link maintenance",
      stdio: "pipe",
    })
    this.child.on("message", (message: RuntimeWorkerResponse) => {
      const pending = this.pending.get(message.requestId)
      if (!pending) return
      this.pending.delete(message.requestId)
      clearTimeout(pending.timer)
      if (message.ok) pending.resolve(message.result)
      else pending.reject(new Error(message.error.message))
    })
    this.child.on("exit", () => {
      this.exited = true
      this.rejectPending(new Error("Markdown link worker closed"))
      this.settleExit()
    })
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }

  private request(
    request:
      | Omit<
          Extract<RuntimeWorkerRequest, { type: "markdownLinks" }>,
          "requestId"
        >
      | { type: "close" }
  ): Promise<unknown> {
    if (this.exited || this.aborted)
      return Promise.reject(new Error("Markdown link worker is closed"))
    const requestId = ++this.sequence
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId)
        reject(new Error("Markdown link maintenance timed out"))
        this.abort()
      }, 120_000)
      this.pending.set(requestId, { resolve, reject, timer })
      try {
        this.child.postMessage({ ...request, requestId })
      } catch (cause) {
        clearTimeout(timer)
        this.pending.delete(requestId)
        reject(cause)
        this.abort()
      }
    })
  }

  private async call(operation: MarkdownLinkBatchOperation): Promise<unknown> {
    if (this.disposed) throw new Error("Markdown link worker is closing")
    const request = this.request({ type: "markdownLinks", operation })
    this.inFlight.add(request)
    try {
      return await request
    } finally {
      this.inFlight.delete(request)
    }
  }

  async prepare(
    root: string,
    files: SpacePathSearchHit[]
  ): Promise<PreparedMarkdownLinkBatch> {
    this.completed = false
    this.prepared = (await this.call({
      kind: "prepare",
      root,
      files,
    })) as PreparedMarkdownLinkBatch
    return this.prepared
  }

  async apply(moves: MarkdownLinkMove[]): Promise<MarkdownLinkBatchResult> {
    try {
      return (await this.call({
        kind: "apply",
        moves,
      })) as MarkdownLinkBatchResult
    } finally {
      this.completed = true
    }
  }

  skipped(moves: MarkdownLinkMove[]): MarkdownLinkBatchResult {
    return skippedOwners(this.prepared?.owners ?? [], moves)
  }

  abort(): void {
    this.aborted = true
    this.rejectPending(new Error("Markdown link worker was stopped"))
    if (!this.exited) this.child.kill()
  }

  dispose(): Promise<void> {
    this.disposed ??= (async () => {
      await Promise.allSettled([...this.inFlight])
      if (this.exited) return
      try {
        if (!this.aborted) await this.request({ type: "close" })
      } finally {
        if (!this.exited) this.child.kill()
        let timer: ReturnType<typeof setTimeout> | undefined
        await Promise.race([
          this.exitPromise,
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, 2000)
          }),
        ])
        clearTimeout(timer)
      }
    })()
    return this.disposed
  }
}
