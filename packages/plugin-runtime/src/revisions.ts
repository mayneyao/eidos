import fs from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"
import { constants } from "node:fs"
import { watch, type FSWatcher } from "chokidar"
import type { Disposable, PluginManifest, PluginPackage } from "./contracts"
import {
  compilePlugin,
  CompilationError,
  type CompiledPlugin,
} from "./compiler"
import { PluginError } from "./errors"
import { Scope } from "./lifecycle"
import { decodePackage, packageHash } from "./package"

export interface RevisionEvent {
  schemaVersion: 1
  sessionId: string
  sequence: number
  phase:
    | "checking"
    | "awaiting-authorization"
    | "activating"
    | "ready"
    | "failed"
    | "stopped"
    | "rolled-back"
  revision?: string
  diagnostics?: Array<{
    code: string
    message: string
    file?: string
    line?: number
    column?: number
  }>
}
export interface RevisionHost {
  /** The trusted host decides using current grants, never plugin code. */
  authorize(manifest: PluginManifest): Promise<boolean>
  /** Host must create an isolated sandbox, not import the entry in this process. */
  activate(program: PluginPackage, scope: Scope): Promise<Disposable>
  event(event: RevisionEvent): void
  persistAccepted(revision: string, bytes: Uint8Array): Promise<void>
}

/** One authorized authoring session. Serialized candidate changes never replay actions. */
export class RevisionSession implements Disposable {
  readonly id = randomUUID()
  private sequence = 0
  private closed = false
  private tail: Promise<unknown> = Promise.resolve()
  private active?: { candidate: CompiledPlugin; scope: Scope }
  private accepted?: CompiledPlugin
  private readonly retained = new Map<string, CompiledPlugin>()
  private readonly mounting = new Set<Scope>()
  constructor(private readonly host: RevisionHost) {}
  private emit(
    phase: RevisionEvent["phase"],
    candidate?: CompiledPlugin,
    error?: unknown
  ) {
    const diagnostic =
      error === undefined
        ? undefined
        : {
            code: error instanceof PluginError ? error.code : "IO_ERROR",
            message:
              error instanceof Error
                ? error.message
                : "Plugin operation failed",
          }
    this.host.event({
      schemaVersion: 1,
      sessionId: this.id,
      sequence: ++this.sequence,
      phase,
      revision: candidate?.revision,
      ...(diagnostic
        ? {
            diagnostics:
              error instanceof CompilationError
                ? error.diagnostics
                : [diagnostic],
          }
        : {}),
    })
  }
  private assertOpen() {
    if (this.closed)
      throw new PluginError("INSTANCE_CLOSED", "Authoring session is closed")
  }
  private async mount(candidate: CompiledPlugin): Promise<Scope> {
    this.assertOpen()
    const scope = new Scope()
    this.mounting.add(scope)
    let timer: ReturnType<typeof setTimeout> | undefined
    const activation = this.host
      .activate(candidate.program, scope)
      .then((resource) => {
        scope.subscriptions.add(resource)
      })
    try {
      await Promise.race([
        activation,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new PluginError("TIMEOUT", "Activation exceeded 10 seconds")
              ),
            10000
          )
        }),
      ])
      this.assertOpen()
      return scope
    } catch (error) {
      scope.dispose()
      throw error
    } finally {
      clearTimeout(timer)
      this.mounting.delete(scope)
    }
  }
  update(compile: () => Promise<CompiledPlugin>): Promise<void> {
    const run = this.tail.then(async () => {
      this.assertOpen()
      this.emit("checking")
      let candidate: CompiledPlugin | undefined
      try {
        candidate = await compile()
        this.assertOpen()
        this.emit("awaiting-authorization", candidate)
        if (!(await this.host.authorize(candidate.program.manifest)))
          throw new PluginError(
            "PERMISSION_DENIED",
            "Candidate exceeds current authorization"
          )
        this.assertOpen()
        if (this.active?.candidate.revision === candidate.revision) {
          this.emit("ready", candidate)
          return
        }
        const previous = this.active?.candidate
        this.active?.scope.dispose()
        this.active = undefined
        this.emit("activating", candidate)
        try {
          const scope = await this.mount(candidate)
          this.active = { candidate, scope }
          this.retained.set(candidate.revision, candidate)
          // Bound session memory to accepted + last good + current trial.
          const keep = new Set([
            candidate.revision,
            previous?.revision,
            this.accepted?.revision,
          ])
          for (const revision of this.retained.keys())
            if (!keep.has(revision)) this.retained.delete(revision)
          this.emit("ready", candidate)
        } catch (error) {
          if (
            previous &&
            !this.closed &&
            (await this.host.authorize(previous.program.manifest))
          ) {
            this.active = {
              candidate: previous,
              scope: await this.mount(previous),
            }
            this.emit("rolled-back", previous)
          }
          throw error
        }
      } catch (error) {
        this.emit("failed", candidate, error)
        throw error
      }
    })
    this.tail = run.catch(() => {})
    return run
  }
  accept(revision: string): Promise<void> {
    const operation = this.tail.then(async () => {
      this.assertOpen()
      const candidate = this.active?.candidate
      if (!candidate || candidate.revision !== revision)
        throw new PluginError(
          "STALE_REVISION",
          "Accept requires the exact running revision"
        )
      if (!(await this.host.authorize(candidate.program.manifest)))
        throw new PluginError("PERMISSION_DENIED", "Grants were revoked")
      this.assertOpen()
      await this.host.persistAccepted(revision, candidate.bytes)
      this.accepted = candidate
    })
    this.tail = operation.catch(() => {})
    return operation
  }
  rollback(revision: string): Promise<void> {
    return this.update(async () => {
      const candidate = this.retained.get(revision)
      if (!candidate)
        throw new PluginError("STALE_REVISION", "Revision is not retained")
      return candidate
    })
  }
  inspect() {
    return {
      sessionId: this.id,
      active: this.active?.candidate.revision,
      accepted: this.accepted?.revision,
      retained: [...this.retained.keys()],
    }
  }
  dispose() {
    if (this.closed) return
    this.closed = true
    for (const scope of this.mounting) scope.dispose()
    this.active?.scope.dispose()
    this.active = undefined
    this.retained.clear()
    this.emit("stopped")
  }
}

export async function watchSource(
  source: string,
  session: RevisionSession
): Promise<Disposable> {
  let closed = false,
    running = false,
    again = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let watcher: FSWatcher | undefined
  const dependencies = new Set<string>()
  const rebuild = async () => {
    if (closed) return
    if (running) {
      again = true
      return
    }
    running = true
    try {
      do {
        again = false
        try {
          await session.update(async () => {
            const candidate = await compilePlugin(source)
            for (const file of candidate.dependencies) dependencies.add(file)
            watcher?.add(candidate.dependencies)
            return candidate
          })
        } catch {
          /* session emits structured diagnostics and retains last good code */
        }
      } while (again && !closed)
    } finally {
      running = false
    }
  }
  const root = (await fs.stat(source)).isDirectory()
    ? source
    : path.dirname(source)
  watcher = watch(root, {
    ignoreInitial: true,
    ignored: (file) => {
      const parts = file.split(path.sep)
      if (parts.some((part) => part === ".git" || part === "dist")) return true
      return (
        parts.includes("node_modules") &&
        ![...dependencies].some(
          (dependency) =>
            dependency === file || dependency.startsWith(`${file}${path.sep}`)
        )
      )
    },
  })
  watcher.on("all", () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      void rebuild()
    }, 100)
  })
  await rebuild()
  return {
    dispose() {
      closed = true
      clearTimeout(timer)
      void watcher?.close()
      session.dispose()
    },
  }
}

/** Content-addressed artifact store; revision labels never become filesystem paths. */
export class ArtifactStore {
  constructor(private readonly directory: string) {}
  async put(bytes: Uint8Array): Promise<string> {
    decodePackage(bytes)
    const hash = packageHash(bytes)
    await fs.mkdir(this.directory, { recursive: true })
    const target = path.join(this.directory, `${hash}.eidos-plugin`)
    const temporary = path.join(this.directory, `${randomUUID()}.tmp`)
    try {
      const handle = await fs.open(temporary, "wx", 0o600)
      try {
        await handle.writeFile(bytes)
        await handle.sync()
      } finally {
        await handle.close()
      }
      try {
        await fs.link(temporary, target)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
        await this.read(hash)
      }
    } finally {
      await fs.rm(temporary, { force: true })
    }
    return hash
  }
  async read(hash: string): Promise<PluginPackage> {
    if (!/^[a-f0-9]{64}$/.test(hash))
      throw new PluginError("INVALID_REQUEST", "Invalid artifact hash")
    const file = path.join(this.directory, `${hash}.eidos-plugin`)
    const handle = await fs.open(
      file,
      constants.O_RDONLY | constants.O_NOFOLLOW
    )
    let bytes: Buffer
    try {
      const stats = await handle.stat()
      if (!stats.isFile() || stats.size > 16 * 1024 * 1024)
        throw new PluginError("INVALID_REQUEST", "Invalid artifact file")
      const buffer = Buffer.alloc(stats.size + 1)
      let count = 0
      while (count < buffer.length) {
        const result = await handle.read(
          buffer,
          count,
          buffer.length - count,
          null
        )
        if (!result.bytesRead) break
        count += result.bytesRead
      }
      if (count > stats.size)
        throw new PluginError(
          "STALE_REVISION",
          "Artifact changed while reading"
        )
      bytes = buffer.subarray(0, count)
    } finally {
      await handle.close()
    }
    if (packageHash(bytes) !== hash)
      throw new PluginError("INVALID_REQUEST", "Artifact integrity mismatch")
    return decodePackage(bytes)
  }
}
