import { AsyncLocalStorage } from "node:async_hooks"
import { createHash } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { performance } from "node:perf_hooks"
import type { DatabaseSync, SQLOutputValue, StatementSync } from "node:sqlite"

interface ReadTraceMeta {
  type?: string
  method?: string
  requestId?: number
  utilityPid?: number
  offset?: number
  limit?: number
  readOnly?: boolean
  sessionKey?: string
  queryKey?: string
  assetKey?: string
  purpose?: "thumbnail" | "preview" | "download"
  thumbnailSize?: number
  thumbnailKey?: string
  cacheState?: "hit" | "negative-hit" | "miss" | "join" | "queue-full"
  queueMs?: number
  queued?: number
  active?: number
}

interface TraceContext {
  spanId: number
}

interface ReadTraceOptions {
  directory?: string
  deadline?: number
  sqlThresholdMs?: number
  protectedRoot?: string
}

/** Internal, opt-in diagnostic. No statement text, arguments or row bodies. */
export class RuntimeReadTrace {
  private fd: number | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private watcher: fs.FSWatcher | null = null
  private deadline = 0
  private readonly onExit = () => this.stop("process-exit")
  private sequence = 0
  private events = 0
  private prepared = 0
  private readonly context = new AsyncLocalStorage<TraceContext>()
  private readonly restorers: Array<() => void> = []
  private readonly sqlThresholdMs: number

  constructor(options: ReadTraceOptions) {
    this.sqlThresholdMs = options.sqlThresholdMs ?? 5
    if (!options.directory || !options.deadline) return
    const remaining = options.deadline - Date.now()
    if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 300_000)
      return
    try {
      // The caller creates this directory beforehand. Resolving existing paths
      // rejects a symlink into Desktop before opening a diagnostic file.
      const directory = fs.realpathSync(options.directory)
      const protectedPath = path.resolve(
        options.protectedRoot ?? path.join(os.homedir(), "Desktop")
      )
      const protectedRoot = fs.existsSync(protectedPath)
        ? fs.realpathSync(protectedPath)
        : protectedPath
      if (
        directory === protectedRoot ||
        directory.startsWith(`${protectedRoot}${path.sep}`)
      )
        return
      const stopPath = path.join(directory, "STOP")
      if (fs.existsSync(stopPath)) return
      this.deadline = options.deadline
      this.fd = fs.openSync(
        path.join(directory, `read-trace-${process.pid}.jsonl`),
        "ax",
        0o600
      )
      this.watcher = fs.watch(directory, (_event, filename) => {
        if (filename?.toString() === "STOP") this.stop("stop-file")
      })
      this.watcher.on("error", () => this.stop("control-unavailable"))
      this.watcher.unref()
      process.once("exit", this.onExit)
      this.point("trace-start", { type: process.type ?? "node" })
      if (fs.existsSync(stopPath)) this.stop("stop-file")
      if (!this.enabled) return
      this.timer = setTimeout(() => this.stop("deadline"), remaining)
      this.timer.unref?.()
    } catch {
      // Diagnostics may never prevent opening or using a local file.
      this.stop("unavailable")
    }
  }

  get enabled(): boolean {
    if (this.fd !== null && Date.now() >= this.deadline) this.stop("deadline")
    return this.fd !== null
  }

  point(phase: string, meta: ReadTraceMeta = {}): void {
    this.write({ phase, ...meta })
  }

  /** Preserve the issuing asset's context when another request drains a queue. */
  bind<T>(operation: () => T): () => T {
    if (!this.enabled) return operation
    const context = this.context.getStore()
    return () =>
      context
        ? this.context.run(context, operation)
        : this.context.exit(operation)
  }

  span<T>(phase: string, meta: ReadTraceMeta, operation: () => T): T {
    if (!this.enabled) return operation()
    const parentSpanId = this.context.getStore()?.spanId
    const spanId = ++this.sequence
    return this.context.run({ spanId }, () => {
      const start = performance.now()
      const cpu = process.cpuUsage()
      this.write({ phase: `${phase}-start`, ...meta, parentSpanId })
      const finish = (failed: boolean) => {
        this.write({
          phase: `${phase}-end`,
          ...meta,
          parentSpanId,
          ms: performance.now() - start,
          cpu: process.cpuUsage(cpu),
          failed,
        })
      }
      try {
        const value = operation()
        if (value instanceof Promise)
          void value.then(
            () => finish(false),
            () => finish(true)
          )
        else finish(false)
        return value
      } catch (error) {
        finish(true)
        throw error
      }
    })
  }

  installSql(prototype: Pick<DatabaseSync, "prepare">): void {
    if (!this.enabled) return
    const trace = this
    const original = prototype.prepare
    const wrapped: typeof original = function (this: DatabaseSync, sql) {
      const statement = Reflect.apply(original, this, [sql])
      if (!trace.enabled) return statement
      if (trace.prepared++ >= 2_048) {
        trace.stop("statement-limit")
        return statement
      }
      const statementRef = new WeakRef(statement)
      const sqlKey = readTraceKey(sql)
      const kind = /json_each\(/i.test(sql)
        ? "json-scan"
        : /\bcount\(\*\)/i.test(sql)
          ? "count"
          : /SELECT \* FROM logical/i.test(sql)
            ? "page"
            : "other"
      const describe = (method: string, start: number, failed: boolean) => {
        const ms = performance.now() - start
        if (ms >= trace.sqlThresholdMs)
          trace.write({
            phase: "sqlite",
            method,
            kind,
            sqlKey,
            hasWhere: /\bWHERE\b/i.test(sql),
            hasOffset: /\bOFFSET\b/i.test(sql),
            ms,
            ...(method === "iterate" ? { fullyConsumed: !failed } : { failed }),
          })
      }
      for (const method of ["all", "get"] as const) {
        const call = statement[method]
        const descriptor = Object.getOwnPropertyDescriptor(statement, method)
        const wrapper = function (
          this: StatementSync,
          ...args: unknown[]
        ): ReturnType<typeof call> {
          if (!trace.enabled)
            return Reflect.apply(call, this, args) as ReturnType<typeof call>
          const start = performance.now()
          let failed = true
          try {
            const value = Reflect.apply(call, this, args) as ReturnType<
              typeof call
            >
            failed = false
            return value
          } finally {
            describe(method, start, failed)
          }
        }
        Object.defineProperty(statement, method, {
          configurable: true,
          writable: true,
          value: wrapper,
        })
        const wrapperRef = new WeakRef(wrapper)
        trace.restorers.push(() => {
          const value = statementRef.deref()
          if (value && value[method] === wrapperRef.deref()) {
            if (descriptor) Object.defineProperty(value, method, descriptor)
            else Reflect.deleteProperty(value, method)
          }
        })
      }
      const iterate = statement.iterate
      const iteratorDescriptor = Object.getOwnPropertyDescriptor(
        statement,
        "iterate"
      )
      const iteratorWrapper = function (
        this: StatementSync,
        ...args: unknown[]
      ): ReturnType<typeof iterate> {
        const start = performance.now()
        let iterator: ReturnType<typeof iterate> &
          Iterable<Record<string, SQLOutputValue>>
        try {
          iterator = Reflect.apply(iterate, this, args) as typeof iterator
        } catch (error) {
          describe("iterate", start, true)
          throw error
        }
        if (!trace.enabled) return iterator
        return (function* (): Generator<
          Record<string, SQLOutputValue>,
          undefined,
          unknown
        > {
          let failed = true
          try {
            yield* iterator
            failed = false
            return undefined
          } finally {
            // Includes adapter consumption; not pure sqlite3_step time.
            describe("iterate", start, failed)
          }
        })()
      }
      Object.defineProperty(statement, "iterate", {
        configurable: true,
        writable: true,
        value: iteratorWrapper,
      })
      const iteratorRef = new WeakRef(iteratorWrapper)
      trace.restorers.push(() => {
        const value = statementRef.deref()
        if (value && value.iterate === iteratorRef.deref()) {
          if (iteratorDescriptor)
            Object.defineProperty(value, "iterate", iteratorDescriptor)
          else Reflect.deleteProperty(value, "iterate")
        }
      })
      return statement
    }
    prototype.prepare = wrapped
    this.restorers.push(() => {
      if (prototype.prepare === wrapped) prototype.prepare = original
    })
  }

  stop(reason = "requested"): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    try {
      this.watcher?.close()
    } catch {
      /* Diagnostics must not affect a call. */
    }
    this.watcher = null
    process.removeListener("exit", this.onExit)
    let restoreFailures = 0
    for (const restore of this.restorers.splice(0)) {
      try {
        restore()
      } catch {
        restoreFailures += 1
      }
    }
    const fd = this.fd
    this.fd = null
    if (fd === null) return
    try {
      fs.writeSync(
        fd,
        JSON.stringify({
          phase: "trace-stop",
          wall: Date.now(),
          pid: process.pid,
          reason,
          events: this.events,
          restoreFailures,
        }) + "\n"
      )
    } catch {
      // An unavailable diagnostic destination cannot affect Runtime results.
    } finally {
      try {
        fs.closeSync(fd)
      } catch {
        /* Already closed or unavailable. */
      }
    }
  }

  private write(event: Record<string, unknown>): void {
    const fd = this.fd
    if (fd === null || !this.enabled) return
    if (this.events >= 5_000) {
      this.stop("event-limit")
      return
    }
    try {
      fs.writeSync(
        fd,
        JSON.stringify({
          wall: Date.now(),
          t: performance.now(),
          pid: process.pid,
          spanId: this.context.getStore()?.spanId,
          ...event,
        }) + "\n"
      )
      this.events += 1
    } catch {
      this.stop("write-unavailable")
    }
  }
}

export function readTraceKey(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export function readTraceValueKey(value: unknown): string | undefined {
  try {
    return readTraceKey(JSON.stringify(value) ?? "undefined")
  } catch {
    return undefined
  }
}

export const runtimeReadTrace = new RuntimeReadTrace({
  directory: process.env.EIDOS_LITE_READ_TRACE_DIR,
  deadline: Number(process.env.EIDOS_LITE_READ_TRACE_UNTIL),
})
