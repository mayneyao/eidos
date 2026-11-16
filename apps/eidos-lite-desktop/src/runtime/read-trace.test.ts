import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { readTraceValueKey, RuntimeReadTrace } from "./read-trace"

describe("bounded Runtime read diagnostics", () => {
  let directory: string
  const traces: RuntimeReadTrace[] = []
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "eidos-read-trace-"))
  })
  afterEach(() => {
    for (const trace of traces.splice(0)) trace.stop()
    vi.useRealTimers()
    fs.rmSync(directory, { recursive: true, force: true })
  })
  const open = (deadline = Date.now() + 30_000) => {
    const trace = new RuntimeReadTrace({
      directory,
      deadline,
      sqlThresholdMs: 0,
    })
    traces.push(trace)
    return trace
  }
  const entries = () =>
    fs
      .readdirSync(directory)
      .filter((file) => file.endsWith(".jsonl"))
      .flatMap((file) =>
        fs
          .readFileSync(path.join(directory, file), "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line) as Record<string, unknown>)
      )

  it("is inert without explicit configuration and preserves returned promises", async () => {
    const trace = new RuntimeReadTrace({ directory })
    traces.push(trace)
    const value = { rows: ["PRIVATE BODY"] }
    const promise = Promise.resolve(value)
    expect(trace.span("read", {}, () => promise)).toBe(promise)
    expect(await promise).toBe(value)
    const opaque = Object.defineProperty({}, "then", {
      get: () => {
        throw new Error("must not inspect")
      },
    })
    expect(trace.span("opaque", {}, () => opaque)).toBe(opaque)
    trace.installSql(DatabaseSync.prototype)
    expect(trace.enabled).toBe(false)
    expect(fs.readdirSync(directory)).toEqual([])
  })

  it("retains success and failure identity and correlates async spans without bodies or error text", async () => {
    const trace = open()
    const value = { rows: ["PRIVATE BODY"] }
    const promise = Promise.resolve(value)
    expect(
      trace.span("ipc-call", { method: "getPage", offset: 100 }, () => promise)
    ).toBe(promise)
    expect(await promise).toBe(value)
    const error = new Error("PRIVATE ERROR")
    expect(() =>
      trace.span("sync-failure", {}, () => {
        throw error
      })
    ).toThrow(error)
    const rejected = Promise.reject(error)
    expect(trace.span("async-failure", {}, () => rejected)).toBe(rejected)
    await expect(rejected).rejects.toBe(error)
    await trace.span("outer", {}, async () => {
      await Promise.resolve()
      trace.point("inner")
    })
    trace.stop()
    const events = entries()
    expect(events.find((e) => e.phase === "inner")?.spanId).toBe(
      events.find((e) => e.phase === "outer-start")?.spanId
    )
    expect(events.filter((e) => e.failed === true)).toHaveLength(2)
    const raw = JSON.stringify(events)
    expect(raw).not.toContain("PRIVATE BODY")
    expect(raw).not.toContain("PRIVATE ERROR")
    for (const file of fs.readdirSync(directory))
      expect(fs.statSync(path.join(directory, file)).mode & 0o777).toBe(0o600)
  })

  it("records SQL hashes while preserving rows and restoring live statements and the connection prototype", () => {
    const trace = open()
    const original = DatabaseSync.prototype.prepare
    const database = new DatabaseSync(":memory:")
    try {
      trace.installSql(DatabaseSync.prototype)
      const statement = database.prepare(
        "WITH logical AS (SELECT 'PRIVATE SQL TEXT' AS value) SELECT * FROM logical LIMIT ?"
      )
      const all = Object.getPrototypeOf(statement).all
      const iterate = Object.getPrototypeOf(statement).iterate
      const rows = [...statement.iterate(1)]
      expect(rows[0]?.value).toBe("PRIVATE SQL TEXT")
      expect(statement.all(1)).toEqual(rows)
      trace.stop()
      expect(DatabaseSync.prototype.prepare).toBe(original)
      expect(statement.all).toBe(all)
      expect(statement.iterate).toBe(iterate)
      expect(statement.all(1)).toEqual(rows)
      const sql = entries().filter((e) => e.phase === "sqlite")
      expect(sql).toHaveLength(2)
      expect(
        sql.every((e) => e.kind === "page" && typeof e.sqlKey === "string")
      ).toBe(true)
      expect(JSON.stringify(entries())).not.toContain("PRIVATE SQL TEXT")
    } finally {
      trace.stop()
      database.close()
    }
  })

  it("stops on its absolute deadline and restores wrappers before later reads", async () => {
    vi.useFakeTimers()
    const original = DatabaseSync.prototype.prepare
    const trace = open(Date.now() + 20)
    trace.installSql(DatabaseSync.prototype)
    expect(DatabaseSync.prototype.prepare).not.toBe(original)
    await vi.advanceTimersByTimeAsync(20)
    expect(trace.enabled).toBe(false)
    expect(DatabaseSync.prototype.prepare).toBe(original)
    const count = entries().length
    trace.point("after-deadline")
    expect(entries()).toHaveLength(count)
    expect(entries().at(-1)).toMatchObject({
      phase: "trace-stop",
      reason: "deadline",
      restoreFailures: 0,
    })
  })

  it("rejects protected destinations, symlink aliases and expired sessions without creating logs", () => {
    const protectedRoot = path.join(directory, "protected")
    fs.mkdirSync(protectedRoot)
    const alias = path.join(directory, "alias")
    fs.symlinkSync(protectedRoot, alias)
    for (const destination of [protectedRoot, alias]) {
      const trace = new RuntimeReadTrace({
        directory: destination,
        protectedRoot,
        deadline: Date.now() + 1_000,
      })
      traces.push(trace)
      expect(trace.enabled).toBe(false)
    }
    const expired = new RuntimeReadTrace({
      directory,
      deadline: Date.now() - 1,
    })
    traces.push(expired)
    expect(expired.enabled).toBe(false)
    expect(fs.readdirSync(protectedRoot)).toEqual([])
  })

  it("bounds diagnostic events and handles cyclic query identities safely", () => {
    const trace = open()
    for (let i = 0; i < 5_100; i++) trace.point("test-point")
    expect(trace.enabled).toBe(false)
    expect(entries().at(-1)).toMatchObject({
      phase: "trace-stop",
      reason: "event-limit",
    })
    const cycle: { self?: unknown } = {}
    cycle.self = cycle
    expect(readTraceValueKey(cycle)).toBeUndefined()
  })

  it("rejects deadlines beyond five minutes and unavailable destinations without changing calls", () => {
    const far = open(Date.now() + 600_000)
    expect(far.enabled).toBe(false)
    const unavailable = new RuntimeReadTrace({
      directory: path.join(directory, "missing"),
      deadline: Date.now() + 1_000,
    })
    traces.push(unavailable)
    expect(unavailable.enabled).toBe(false)
    const value = { rows: [1] }
    expect(unavailable.span("read", {}, () => value)).toBe(value)
    expect(fs.readdirSync(directory)).toEqual([])
  })

  it("bounds retained statement observations and restores a partially consumed iterator", () => {
    const trace = open()
    const original = DatabaseSync.prototype.prepare
    const database = new DatabaseSync(":memory:")
    try {
      trace.installSql(DatabaseSync.prototype)
      const statement = database.prepare("SELECT 1 AS value UNION ALL SELECT 2")
      for (const row of statement.iterate()) {
        expect(row.value).toBe(1)
        break
      }
      expect(entries().find((e) => e.phase === "sqlite")).toMatchObject({
        fullyConsumed: false,
      })
      for (let i = 0; i < 2_050; i++) database.prepare("SELECT 1")
      expect(trace.enabled).toBe(false)
      expect(DatabaseSync.prototype.prepare).toBe(original)
      expect(Object.hasOwn(statement, "iterate")).toBe(false)
      expect(statement.all()).toHaveLength(2)
      expect(entries().at(-1)).toMatchObject({
        phase: "trace-stop",
        reason: "statement-limit",
        restoreFailures: 0,
      })
    } finally {
      trace.stop()
      database.close()
    }
  })

  it("stops promptly through an external control marker and removes its process listener", async () => {
    const listeners = process.listenerCount("exit")
    const original = DatabaseSync.prototype.prepare
    const trace = open()
    trace.installSql(DatabaseSync.prototype)
    expect(process.listenerCount("exit")).toBe(listeners + 1)
    fs.writeFileSync(path.join(directory, "STOP"), "")
    await vi.waitFor(() => expect(trace.enabled).toBe(false))
    expect(DatabaseSync.prototype.prepare).toBe(original)
    expect(process.listenerCount("exit")).toBe(listeners)
    expect(
      entries()
        .filter((e) => e.phase === "trace-stop")
        .at(-1)
    ).toMatchObject({ reason: "stop-file", restoreFailures: 0 })
    const second = open()
    expect(second.enabled).toBe(false)
  })

  it("preserves native receivers and synchronous iterator argument failures", () => {
    const trace = open()
    const database = new DatabaseSync(":memory:")
    try {
      trace.installSql(DatabaseSync.prototype)
      const statement = database.prepare("SELECT ? AS value")
      const detached = statement.all
      expect(() => detached(1)).toThrow()
      expect(() => statement.iterate({ bad: "parameter" })).toThrow()
      expect(statement.get(7)).toMatchObject({ value: 7 })
    } finally {
      trace.stop()
      database.close()
    }
  })
})
