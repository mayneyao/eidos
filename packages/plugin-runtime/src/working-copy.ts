import { randomUUID } from "node:crypto"
import type {
  TextDocument,
  TextSnapshot,
  ObserverErrorHandler,
} from "./contracts"
import { PluginError, TEXT_LIMIT } from "./errors"
import type { Scope } from "./lifecycle"

export interface DiskSnapshot {
  text: string
  revision: string
  encoding: TextSnapshot["encoding"]
  bom: boolean
}
export interface DocumentBackend {
  read(): Promise<DiskSnapshot>
  write(
    text: string,
    expectedRevision: string
  ): Promise<
    { status: "saved"; snapshot: DiskSnapshot } | { status: "conflict" }
  >
}
interface HistoryEntry {
  before: string
  after: string
  owner: string
  group?: string
  at: number
}
interface Observer {
  listener: (state: TextSnapshot) => void
  error?: ObserverErrorHandler
  active: boolean
  pending: number
}

/** Shared per canonical document, independent of any plugin or renderer lifetime. */
export class WorkingCopy {
  persistedRevision(): string {
    return this.disk.revision
  }
  private version = randomUUID()
  private text: string
  private conflicted = false
  private readonly observers = new Set<Observer>()
  private readonly history: HistoryEntry[] = []
  private readonly redoHistory: HistoryEntry[] = []
  private groupBoundary = true
  private saves: Promise<unknown> = Promise.resolve()
  constructor(
    private disk: DiskSnapshot,
    private readonly backend: DocumentBackend,
    private readonly diagnostic: (error: unknown) => void = () => {},
    private readonly now = Date.now
  ) {
    this.checkSize(disk.text)
    this.text = disk.text
  }
  private encodedSize(text: string, format = this.disk): number {
    return (
      Buffer.byteLength(
        text,
        format.encoding === "utf-8" ? "utf8" : "utf16le"
      ) + (format.bom ? (format.encoding === "utf-8" ? 3 : 2) : 0)
    )
  }
  private checkSize(text: string, format = this.disk) {
    if (this.encodedSize(text, format) > TEXT_LIMIT)
      throw new PluginError(
        "TOO_LARGE",
        "Text exceeds 2 MiB in its original encoding"
      )
  }
  snapshot(): TextSnapshot {
    return {
      text: this.text,
      version: this.version,
      encoding: this.disk.encoding,
      bom: this.disk.bom,
      dirty: this.text !== this.disk.text,
      conflicted: this.conflicted,
    }
  }
  private publish() {
    const snapshot = this.snapshot()
    for (const observer of this.observers) {
      const fail = (error: unknown) => {
        if (!observer.active) return
        observer.active = false
        this.observers.delete(observer)
        const failure = {
          code: "IO_ERROR",
          message: "Document observer failed; resubscribe",
        }
        try {
          if (observer.error) observer.error(failure)
          else this.diagnostic(error)
        } catch (reportError) {
          this.diagnostic(reportError)
        }
      }
      if (++observer.pending > 64) {
        fail(new PluginError("IO_ERROR", "Observer queue exceeded its limit"))
        continue
      }
      // Promise settlement of observe's initial snapshot precedes notifications.
      setTimeout(() => {
        observer.pending--
        if (!observer.active) return
        try {
          void Promise.resolve(observer.listener({ ...snapshot })).catch(fail)
        } catch (error) {
          fail(error)
        }
      }, 0)
    }
  }
  private change(text: string) {
    if (text !== this.text) {
      this.text = text
      this.version = randomUUID()
    }
    this.publish()
  }
  private trimHistory() {
    const size = (h: HistoryEntry) =>
      this.encodedSize(h.before) + this.encodedSize(h.after)
    let bytes = [...this.history, ...this.redoHistory].reduce(
      (total, h) => total + size(h),
      0
    )
    while (
      this.history.length + this.redoHistory.length > 100 ||
      bytes > 16 * 1024 * 1024
    ) {
      const removed = this.history.shift() ?? this.redoHistory.shift()
      if (!removed) break
      bytes -= size(removed)
    }
  }
  bind(scope: Scope, access: "read" | "write"): TextDocument {
    const owner = randomUUID()
    const requireWrite = () => {
      scope.assertActive()
      if (access !== "write")
        throw new PluginError("PERMISSION_DENIED", "Document is read-only")
    }
    return {
      read: async () => {
        scope.assertActive()
        return this.snapshot()
      },
      observe: async (listener, onError) => {
        scope.assertActive()
        const observer: Observer = {
          listener,
          error: onError,
          active: true,
          pending: 0,
        }
        const snapshot = this.snapshot()
        this.observers.add(observer)
        const subscription = scope.subscriptions.add({
          dispose: () => {
            observer.active = false
            this.observers.delete(observer)
          },
        })
        return { snapshot, subscription }
      },
      edit: async (change) => {
        requireWrite()
        if (
          typeof change.text !== "string" ||
          typeof change.expectedVersion !== "string" ||
          (change.group !== undefined &&
            (typeof change.group !== "string" ||
              !change.group ||
              change.group.length > 128)) ||
          (change.label !== undefined &&
            (typeof change.label !== "string" ||
              !change.label ||
              change.label.length > 128))
        )
          throw new PluginError("INVALID_REQUEST", "Invalid text change")
        this.checkSize(change.text)
        if (change.expectedVersion !== this.version)
          return { status: "stale", snapshot: this.snapshot() }
        if (change.text !== this.text) {
          const last = this.history.at(-1)
          const time = this.now()
          if (
            !this.groupBoundary &&
            change.group &&
            last?.group === change.group &&
            last.owner === owner &&
            time - last.at <= 2000
          ) {
            last.after = change.text
            last.at = time
          } else
            this.history.push({
              before: this.text,
              after: change.text,
              owner,
              group: change.group,
              at: time,
            })
          this.groupBoundary = false
          this.redoHistory.length = 0
          this.trimHistory()
          this.change(change.text)
        }
        return { status: "applied", snapshot: this.snapshot() }
      },
      save: async () => {
        requireWrite()
        this.groupBoundary = true
        const operation = this.saves.then(async () => {
          requireWrite()
          if (this.conflicted)
            return { status: "conflict" as const, snapshot: this.snapshot() }
          const text = this.text
          const result = await this.backend.write(text, this.disk.revision)
          if (result.status === "conflict") {
            this.conflicted = true
            this.publish()
            return { status: "conflict" as const, snapshot: this.snapshot() }
          }
          this.disk = result.snapshot
          this.conflicted = false
          this.groupBoundary = true
          this.publish()
          return { status: "saved" as const, snapshot: this.snapshot() }
        })
        this.saves = operation.catch(() => {})
        return operation
      },
      undo: async () => {
        requireWrite()
        this.groupBoundary = true
        const entry = this.history.pop()
        if (entry) {
          this.redoHistory.push(entry)
          this.change(entry.before)
        }
        return this.snapshot()
      },
      redo: async () => {
        requireWrite()
        this.groupBoundary = true
        const entry = this.redoHistory.pop()
        if (entry) {
          this.history.push(entry)
          this.change(entry.after)
        }
        return this.snapshot()
      },
    }
  }
  /** Called by the host file watcher, not exposed as a guest discard operation. */
  async refresh(): Promise<void> {
    const operation = this.saves.then(async () => {
      const current = await this.backend.read()
      if (current.revision === this.disk.revision) return
      this.checkSize(current.text, current)
      this.groupBoundary = true
      if (this.snapshot().dirty && current.text !== this.text) {
        this.conflicted = true
        this.publish()
      } else {
        this.disk = current
        this.conflicted = false
        this.history.length = this.redoHistory.length = 0
        this.change(current.text)
      }
    })
    this.saves = operation.catch(() => {})
    return operation
  }
}

export class WorkingCopyRegistry {
  private readonly spaces = new Map<string, Map<string, Promise<WorkingCopy>>>()
  open(
    spaceSession: string,
    canonicalPath: string,
    backend: DocumentBackend
  ): Promise<WorkingCopy> {
    let space = this.spaces.get(spaceSession)
    if (!space) {
      space = new Map()
      this.spaces.set(spaceSession, space)
    }
    let copy = space.get(canonicalPath)
    if (!copy) {
      const entries = space
      copy = backend
        .read()
        .then((disk) => new WorkingCopy(disk, backend))
        .catch((error) => {
          entries.delete(canonicalPath)
          throw error
        })
      space.set(canonicalPath, copy)
    }
    return copy
  }
  /** Host calls only after its save/discard/cancel flow has completed. */
  releaseSpace(spaceSession: string): void {
    this.spaces.delete(spaceSession)
  }
}
