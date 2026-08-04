import { randomUUID } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { utilityProcess, type UtilityProcess } from "electron"

import type {
  EidosFileIssue,
  OpenEidosFileResult,
  RuntimeCalls,
  RuntimeMethod,
  RuntimeWorkerRequest,
  RuntimeWorkerResponse,
} from "../../shared/contracts"
import { resolveSpacePath } from "../space/space-paths"
import {
  classifyEidosFileIssue,
  createEidosFileIssue,
  EidosFileRuntimeError,
} from "./eidos-file-issue"

interface PendingRequest {
  resolve(value: unknown): void
  reject(error: Error): void
}

interface RuntimeEntry {
  sessionId: string
  relativePath: string
  filePath: string
  canonicalPath: string
  fileIdentity: { device: number; inode: number } | null
  child: UtilityProcess | null
  pending: Map<number, PendingRequest>
  nextRequestId: number
  crashed: boolean
  lastAccess: number
}

export const DEFAULT_MAX_RESIDENT_RUNTIMES = 3

function defaultRuntimeWorkerPath(): string {
  const workerUrl = new URL("./runtime-worker.js", import.meta.url)
  if (workerUrl.protocol === "file:") return fileURLToPath(workerUrl)
  if (process.env.VITEST) {
    // Vitest may execute Electron main modules from an in-memory data URL. Tests
    // that exercise the pool inject their own worker; SpaceSession unit tests only
    // need a stable placeholder while runtime opening is mocked.
    return path.resolve(
      process.cwd(),
      "apps/eidos-lite-desktop/src/main/runtime/runtime-worker.js"
    )
  }
  throw new Error("Eidos File runtime worker must be loaded from a file URL")
}

export interface RuntimeResidencyCandidate {
  sessionId: string
  resident: boolean
  lastAccess: number
}

export function selectLruRuntimeToEvict(
  candidates: readonly RuntimeResidencyCandidate[],
  excludedSessionId?: string
): string | null {
  return (
    candidates
      .filter(
        (candidate) =>
          candidate.resident && candidate.sessionId !== excludedSessionId
      )
      .sort((left, right) =>
        left.lastAccess === right.lastAccess
          ? left.sessionId.localeCompare(right.sessionId)
          : left.lastAccess - right.lastAccess
      )[0]?.sessionId ?? null
  )
}

function isWorkerResponse(value: unknown): value is RuntimeWorkerResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "requestId" in value &&
    typeof value.requestId === "number" &&
    "ok" in value &&
    typeof value.ok === "boolean"
  )
}

export class RuntimePool {
  private readonly entriesBySession = new Map<string, RuntimeEntry>()
  private readonly sessionByCanonicalPath = new Map<string, string>()
  private readonly suspendedSessionIds = new Set<string>()
  private readonly pendingInvalidations: EidosFileIssue[] = []
  private accessSequence = 0
  private residencyTail: Promise<void> = Promise.resolve()

  constructor(
    private readonly spaceRoot: string,
    private readonly workerPath = defaultRuntimeWorkerPath(),
    private readonly maxResidentRuntimes = DEFAULT_MAX_RESIDENT_RUNTIMES
  ) {
    if (!Number.isInteger(maxResidentRuntimes) || maxResidentRuntimes < 1) {
      throw new Error("Runtime LRU capacity must be a positive integer")
    }
  }

  async open(relativePath: string): Promise<OpenEidosFileResult> {
    const invalidations = await this.reconcilePaths()
    this.pendingInvalidations.push(
      ...invalidations.filter((issue) => issue.relativePath !== relativePath)
    )
    const filePath = resolveSpacePath(this.spaceRoot, relativePath)
    if (path.extname(filePath).toLowerCase() !== ".eidos") {
      throw new Error("Only .eidos files use the Eidos File runtime")
    }
    const canonicalPath = await fs.realpath(filePath)
    const fileStats = await fs.stat(canonicalPath)
    const relativeToSpace = path.relative(this.spaceRoot, canonicalPath)
    if (
      relativeToSpace === ".." ||
      relativeToSpace.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeToSpace)
    ) {
      throw new Error("Eidos File symlink escapes the Space")
    }
    const existingSession = this.sessionByCanonicalPath.get(canonicalPath)
    if (existingSession) {
      const entry = this.requireEntry(existingSession)
      this.touch(entry)
      const reopenedSnapshot = await this.ensureResident(entry)
      return {
        sessionId: entry.sessionId,
        relativePath: entry.relativePath,
        snapshot:
          reopenedSnapshot ??
          (await this.call(entry.sessionId, "getSnapshot", [])),
        readOnly: false,
      }
    }

    const entry: RuntimeEntry = {
      sessionId: randomUUID(),
      relativePath,
      filePath,
      canonicalPath,
      fileIdentity: { device: fileStats.dev, inode: fileStats.ino },
      child: null,
      pending: new Map(),
      nextRequestId: 1,
      crashed: false,
      lastAccess: ++this.accessSequence,
    }
    this.entriesBySession.set(entry.sessionId, entry)
    this.sessionByCanonicalPath.set(canonicalPath, entry.sessionId)
    try {
      const snapshot = await this.ensureResident(entry)
      if (!snapshot) throw new Error("Eidos File runtime did not open")
      return {
        sessionId: entry.sessionId,
        relativePath,
        snapshot,
        readOnly: false,
      }
    } catch (error) {
      this.entriesBySession.delete(entry.sessionId)
      this.sessionByCanonicalPath.delete(canonicalPath)
      throw error
    }
  }

  async create(
    relativePath: string,
    title: string
  ): Promise<OpenEidosFileResult> {
    const filePath = resolveSpacePath(this.spaceRoot, relativePath)
    if (path.extname(filePath).toLowerCase() !== ".eidos") {
      throw new Error("New Eidos Files must use the .eidos extension")
    }
    try {
      await fs.lstat(filePath)
      throw new Error("A file or folder already exists at this path")
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !("code" in error) ||
        error.code !== "ENOENT"
      ) {
        throw error
      }
    }
    const entry: RuntimeEntry = {
      sessionId: randomUUID(),
      relativePath,
      filePath,
      canonicalPath: filePath,
      fileIdentity: null,
      child: null,
      pending: new Map(),
      nextRequestId: 1,
      crashed: false,
      lastAccess: ++this.accessSequence,
    }
    this.entriesBySession.set(entry.sessionId, entry)
    try {
      const snapshot = await this.ensureResident(entry, title)
      if (!snapshot) throw new Error("Eidos File runtime did not create")
      entry.canonicalPath = await fs.realpath(filePath)
      const fileStats = await fs.stat(entry.canonicalPath)
      entry.fileIdentity = { device: fileStats.dev, inode: fileStats.ino }
      this.sessionByCanonicalPath.set(entry.canonicalPath, entry.sessionId)
      return {
        sessionId: entry.sessionId,
        relativePath,
        snapshot,
        readOnly: false,
      }
    } catch (error) {
      await this.closeEntry(entry).catch(() => undefined)
      this.entriesBySession.delete(entry.sessionId)
      await fs.rm(filePath, { force: true }).catch(() => undefined)
      throw error
    }
  }

  async call<M extends RuntimeMethod>(
    sessionId: string,
    method: M,
    args: RuntimeCalls[M]["args"]
  ): Promise<RuntimeCalls[M]["result"]> {
    const entry = this.requireEntry(sessionId)
    const issue = await this.entryIssue(entry)
    if (issue) {
      await this.closeSession(sessionId)
      throw new EidosFileRuntimeError(issue)
    }
    this.touch(entry)
    await this.ensureResident(entry)
    return this.request(entry, {
      type: "call",
      requestId: entry.nextRequestId++,
      method,
      args,
    }) as Promise<RuntimeCalls[M]["result"]>
  }

  async closeSession(sessionId: string): Promise<void> {
    const entry = this.requireEntry(sessionId)
    await this.closeEntry(entry)
    this.entriesBySession.delete(sessionId)
    this.sessionByCanonicalPath.delete(entry.canonicalPath)
    this.suspendedSessionIds.delete(sessionId)
  }

  async closeHandles(): Promise<void> {
    this.suspendedSessionIds.clear()
    for (const entry of this.entriesBySession.values()) {
      if (entry.child) this.suspendedSessionIds.add(entry.sessionId)
    }
    await Promise.all(
      [...this.entriesBySession.values()].map((entry) => this.closeEntry(entry))
    )
  }

  async reopenHandles(): Promise<void> {
    const suspended = new Set(this.suspendedSessionIds)
    this.suspendedSessionIds.clear()
    for (const entry of [...this.entriesBySession.values()]) {
      if (await this.refreshEntryIdentity(entry)) continue
      this.pendingInvalidations.push(
        (await this.entryIssue(entry)) ??
          createEidosFileIssue(entry.relativePath, "replaced", entry.sessionId)
      )
      await this.closeSession(entry.sessionId)
    }
    const entries = [...suspended]
      .map((sessionId) => this.entriesBySession.get(sessionId))
      .filter((entry): entry is RuntimeEntry => entry !== undefined)
      .sort((left, right) => left.lastAccess - right.lastAccess)
    for (const entry of entries) await this.ensureResident(entry)
  }

  async validateOpenFiles(): Promise<void> {
    await this.validatePaths(this.openRelativePaths())
  }

  async validatePaths(relativePaths: readonly string[]): Promise<void> {
    for (const relativePath of relativePaths) {
      const filePath = resolveSpacePath(this.spaceRoot, relativePath)
      const canonicalPath = await fs.realpath(filePath)
      const fileStats = await fs.stat(canonicalPath)
      const probe: RuntimeEntry = {
        sessionId: randomUUID(),
        relativePath,
        filePath,
        canonicalPath,
        fileIdentity: { device: fileStats.dev, inode: fileStats.ino },
        child: null,
        pending: new Map(),
        nextRequestId: 1,
        crashed: false,
        lastAccess: 0,
      }
      await this.spawnAndOpen(probe)
      await this.closeEntry(probe)
    }
  }

  async destroy(): Promise<void> {
    await this.closeHandles()
    this.entriesBySession.clear()
    this.sessionByCanonicalPath.clear()
    this.suspendedSessionIds.clear()
    this.pendingInvalidations.length = 0
  }

  openRelativePaths(): string[] {
    return [...this.entriesBySession.values()].map(
      (entry) => entry.relativePath
    )
  }

  residentRelativePaths(): string[] {
    return [...this.entriesBySession.values()]
      .filter((entry) => entry.child !== null)
      .sort((left, right) => right.lastAccess - left.lastAccess)
      .map((entry) => entry.relativePath)
  }

  relativePathForSession(sessionId: string): string {
    return this.requireEntry(sessionId).relativePath
  }

  async verifyCrashRecoveryForTesting(sessionId: string): Promise<boolean> {
    if (!process.env.EIDOS_LITE_SMOKE_RESULT) {
      throw new Error("Runtime crash recovery probe is available only to smoke")
    }
    const before = await this.call(sessionId, "getSnapshot", [])
    const entry = this.requireEntry(sessionId)
    const child = entry.child
    if (!child) throw new Error("Eidos File runtime is not resident")
    const exited = new Promise<void>((resolve) => {
      child.once("exit", () => resolve())
    })
    child.kill()
    await exited
    const after = await this.call(sessionId, "getSnapshot", [])
    return (
      before.metadata.fileId === after.metadata.fileId &&
      before.metadata.revision === after.metadata.revision &&
      before.tables.length === after.tables.length &&
      before.tables.every((table, index) => {
        const reopened = after.tables[index]
        return (
          reopened?.table.id === table.table.id &&
          reopened.rowCount === table.rowCount
        )
      })
    )
  }

  async closeSessionsForPath(relativePath: string): Promise<string[]> {
    const normalized = relativePath.replace(/\/$/, "")
    const entries = [...this.entriesBySession.values()].filter(
      (entry) =>
        entry.relativePath === normalized ||
        entry.relativePath.startsWith(`${normalized}/`)
    )
    for (const entry of entries) await this.closeSession(entry.sessionId)
    return entries.map((entry) => entry.sessionId)
  }

  async reconcilePaths(
    canInvalidate: () => boolean = () => true
  ): Promise<EidosFileIssue[]> {
    if (!canInvalidate()) return []
    const invalidated = this.pendingInvalidations.splice(0)
    for (const entry of [...this.entriesBySession.values()]) {
      const issue = await this.entryIssue(entry)
      if (!issue) continue
      if (!canInvalidate()) return invalidated
      invalidated.push(issue)
      await this.closeSession(entry.sessionId)
    }
    return invalidated
  }

  async inspectPath(relativePath: string): Promise<EidosFileIssue | null> {
    const filePath = resolveSpacePath(this.spaceRoot, relativePath)
    try {
      const linkStats = await fs.lstat(filePath)
      if (linkStats.isSymbolicLink()) {
        return createEidosFileIssue(relativePath, "unsafe-link")
      }
      if (!linkStats.isFile()) {
        return createEidosFileIssue(relativePath, "unsupported")
      }
      const canonicalPath = await fs.realpath(filePath)
      const relativeToSpace = path.relative(this.spaceRoot, canonicalPath)
      if (
        relativeToSpace === ".." ||
        relativeToSpace.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativeToSpace)
      ) {
        return createEidosFileIssue(relativePath, "unsafe-link")
      }
      await this.validatePaths([relativePath])
      return null
    } catch (error) {
      return classifyEidosFileIssue(relativePath, error)
    }
  }

  private async entryIssue(
    entry: RuntimeEntry
  ): Promise<EidosFileIssue | null> {
    if (!entry.fileIdentity) {
      return createEidosFileIssue(
        entry.relativePath,
        "replaced",
        entry.sessionId
      )
    }
    try {
      const linkStats = await fs.lstat(entry.filePath)
      if (linkStats.isSymbolicLink()) {
        return createEidosFileIssue(
          entry.relativePath,
          "unsafe-link",
          entry.sessionId
        )
      }
      if (!linkStats.isFile()) {
        return createEidosFileIssue(
          entry.relativePath,
          "unsupported",
          entry.sessionId
        )
      }
      const canonicalPath = await fs.realpath(entry.filePath)
      const relativeToSpace = path.relative(this.spaceRoot, canonicalPath)
      if (
        relativeToSpace === ".." ||
        relativeToSpace.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativeToSpace)
      ) {
        return createEidosFileIssue(
          entry.relativePath,
          "unsafe-link",
          entry.sessionId
        )
      }
      const stats = await fs.stat(canonicalPath)
      if (
        canonicalPath !== entry.canonicalPath ||
        stats.dev !== entry.fileIdentity.device ||
        stats.ino !== entry.fileIdentity.inode
      ) {
        return createEidosFileIssue(
          entry.relativePath,
          "replaced",
          entry.sessionId
        )
      }
      return null
    } catch (error) {
      return classifyEidosFileIssue(entry.relativePath, error, entry.sessionId)
    }
  }

  private async refreshEntryIdentity(entry: RuntimeEntry): Promise<boolean> {
    try {
      const linkStats = await fs.lstat(entry.filePath)
      if (!linkStats.isFile() || linkStats.isSymbolicLink()) return false
      const canonicalPath = await fs.realpath(entry.filePath)
      const relativeToSpace = path.relative(this.spaceRoot, canonicalPath)
      if (
        relativeToSpace === ".." ||
        relativeToSpace.startsWith(`..${path.sep}`) ||
        path.isAbsolute(relativeToSpace)
      ) {
        return false
      }
      const stats = await fs.stat(canonicalPath)
      this.sessionByCanonicalPath.delete(entry.canonicalPath)
      entry.canonicalPath = canonicalPath
      entry.fileIdentity = { device: stats.dev, inode: stats.ino }
      this.sessionByCanonicalPath.set(canonicalPath, entry.sessionId)
      return true
    } catch {
      return false
    }
  }

  private touch(entry: RuntimeEntry): void {
    entry.lastAccess = ++this.accessSequence
  }

  private ensureResident(
    entry: RuntimeEntry,
    createTitle?: string
  ): Promise<RuntimeCalls["getSnapshot"]["result"] | null> {
    return this.withResidencyLock(async () => {
      if (entry.child) return null
      while (this.residentCount() >= this.maxResidentRuntimes) {
        const sessionId = selectLruRuntimeToEvict(
          [...this.entriesBySession.values()].map((candidate) => ({
            sessionId: candidate.sessionId,
            resident: candidate.child !== null,
            lastAccess: candidate.lastAccess,
          })),
          entry.sessionId
        )
        if (!sessionId) {
          throw new Error("Runtime LRU could not free a resident handle")
        }
        await this.closeEntry(this.requireEntry(sessionId))
      }
      return this.spawnAndOpen(entry, createTitle)
    })
  }

  private residentCount(): number {
    return [...this.entriesBySession.values()].filter(
      (entry) => entry.child !== null
    ).length
  }

  private async withResidencyLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.residencyTail
    let release!: () => void
    this.residencyTail = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }

  private async spawnAndOpen(
    entry: RuntimeEntry,
    createTitle?: string
  ): Promise<RuntimeCalls["getSnapshot"]["result"]> {
    if (entry.child) throw new Error("Eidos File runtime is already open")
    const child = utilityProcess.fork(this.workerPath, [], {
      serviceName: `Eidos File · ${path.basename(entry.filePath)}`,
      stdio: "pipe",
    })
    entry.child = child
    entry.crashed = false
    child.on("message", (message) => this.receive(entry, message))
    child.on("exit", (code) => {
      const wasExpected = entry.child === null
      entry.child = null
      entry.crashed = !wasExpected && code !== 0
      for (const pending of entry.pending.values()) {
        pending.reject(
          new Error(
            code === 0
              ? "Eidos File runtime closed"
              : `Eidos File runtime crashed with exit code ${code}`
          )
        )
      }
      entry.pending.clear()
    })
    try {
      return (await this.request(
        entry,
        createTitle === undefined
          ? {
              type: "open",
              requestId: entry.nextRequestId++,
              filePath: entry.filePath,
            }
          : {
              type: "create",
              requestId: entry.nextRequestId++,
              filePath: entry.filePath,
              title: createTitle,
            }
      )) as RuntimeCalls["getSnapshot"]["result"]
    } catch (error) {
      child.kill()
      entry.child = null
      throw error
    }
  }

  private async closeEntry(entry: RuntimeEntry): Promise<void> {
    const child = entry.child
    if (!child) return
    try {
      await this.request(entry, {
        type: "close",
        requestId: entry.nextRequestId++,
      })
    } finally {
      entry.child = null
      child.kill()
    }
  }

  private request(
    entry: RuntimeEntry,
    request: RuntimeWorkerRequest
  ): Promise<unknown> {
    const child = entry.child
    if (!child) return Promise.reject(new Error("Eidos File runtime is closed"))
    return new Promise((resolve, reject) => {
      entry.pending.set(request.requestId, { resolve, reject })
      child.postMessage(request)
    })
  }

  private receive(entry: RuntimeEntry, message: unknown): void {
    if (!isWorkerResponse(message)) return
    const pending = entry.pending.get(message.requestId)
    if (!pending) return
    entry.pending.delete(message.requestId)
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

  private requireEntry(sessionId: string): RuntimeEntry {
    const entry = this.entriesBySession.get(sessionId)
    if (!entry) throw new Error("Unknown or closed Eidos File session")
    return entry
  }
}
