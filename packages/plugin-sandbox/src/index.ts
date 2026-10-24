import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
export {
  scanBluetoothDevices,
  type BluetoothDeviceInfo,
} from "./bluetooth-discovery.js"
import { mkdtemp, writeFile, rm, access } from "node:fs/promises"
import { constants } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { BackgroundExit, BackgroundOptions, JsonValue } from "./types.js"
export type {
  BackgroundExit,
  BackgroundOptions,
  BluetoothPolicy,
  JsonValue,
  SandboxLimits,
  SandboxPermissions,
} from "./types.js"

const MAX_FRAME = 1024 * 1024
const MAX_PENDING = 4 * MAX_FRAME

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
function integer(
  value: number,
  min: number,
  max: number,
  name: string
): number {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new RangeError(`${name} must be ${min}..${max}`)
  return value
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** No PATH lookup or automatic download. The host selects its executable. */
export function defaultBinaryPath(): string {
  return fileURLToPath(
    new URL(
      `../bin/${process.platform}-${process.arch}/plugin-sandbox${process.platform === "win32" ? ".exe" : ""}`,
      import.meta.url
    )
  )
}

/** One plugin process. Instances are created with startBackground or BackgroundManager. */
export class PluginBackground {
  #state: "starting" | "running" | "stopping" | "exited" = "starting"
  #options: BackgroundOptions
  #child?: ChildProcessWithoutNullStreams
  #directory?: string
  #ready = deferred<void>()
  #exit = deferred<BackgroundExit>()
  #error?: Error
  #stopRequested = false
  #finished = false
  #pendingBytes = 0
  #stderrTail = ""
  #startupTimer?: ReturnType<typeof setTimeout>
  #stopTimer?: ReturnType<typeof setTimeout>
  #killTimer?: ReturnType<typeof setTimeout>
  #abort?: () => void
  #messages = new Set<(message: JsonValue) => void>()
  #logs = new Set<(line: string) => void>()

  private constructor(options: BackgroundOptions) {
    this.#options = options
    // A rejection is still observable through start/ready, without an early unhandled rejection.
    void this.#ready.promise.catch(() => {})
    if (options.onMessage)
      this.#messages.add((message) =>
        options.onMessage!(message, (value) => this.#writeMessage(value, true))
      )
    if (options.onLog) this.#logs.add(options.onLog)
  }
  get state() {
    return this.#state
  }
  get pid() {
    return this.#child?.pid
  }
  get ready(): Promise<void> {
    return this.#ready.promise
  }
  /** Always resolves, including spawn failure, crash, or host-requested stop. */
  get exited(): Promise<BackgroundExit> {
    return this.#exit.promise
  }
  onMessage(listener: (message: JsonValue) => void): () => void {
    this.#messages.add(listener)
    return () => {
      this.#messages.delete(listener)
    }
  }
  onLog(listener: (line: string) => void): () => void {
    this.#logs.add(listener)
    return () => {
      this.#logs.delete(listener)
    }
  }

  static async start(options: BackgroundOptions): Promise<PluginBackground> {
    // Snapshot host configuration before the first await; later mutations cannot change grants.
    const snapshot = {
      ...options,
      permissions: options.permissions
        ? (JSON.parse(
            JSON.stringify(options.permissions)
          ) as BackgroundOptions["permissions"])
        : undefined,
      limits: options.limits ? { ...options.limits } : undefined,
    }
    const instance = new PluginBackground(snapshot)
    await instance.#launch()
    try {
      await instance.ready
    } catch (error) {
      await instance.stop()
      throw error
    }
    return instance
  }

  #notifyError(error: Error) {
    try {
      this.#options.onError?.(error)
    } catch {
      /* Host callbacks must not break process cleanup. */
    }
  }
  #callback<T>(callback: (value: T) => void, value: T) {
    try {
      callback(value)
    } catch (error) {
      this.#notifyError(asError(error))
    }
  }
  #fail(error: Error) {
    if (this.#finished) return
    this.#error ??= error
    this.#ready.reject(error)
    this.#notifyError(error)
    void this.stop()
  }

  async #launch(): Promise<void> {
    try {
      const o = this.#options
      if (!path.isAbsolute(o.entry))
        throw new Error("entry must be an absolute path")
      const binary = o.binaryPath ?? defaultBinaryPath()
      if (!path.isAbsolute(binary))
        throw new Error("binaryPath must be an absolute path")
      const startup = integer(
        o.startupTimeoutMs ?? 30000,
        1,
        300000,
        "startupTimeoutMs"
      )
      integer(o.stopTimeoutMs ?? 5000, 1, 30000, "stopTimeoutMs")
      const limits = o.limits ?? {}
      const args = [
        "run",
        o.entry,
        "--listen",
        "--control-protocol",
        "--memory-mb",
        String(integer(limits.memoryMb ?? 64, 8, 1024, "memoryMb")),
        "--turn-budget-ms",
        String(integer(limits.turnBudgetMs ?? 100, 1, 10000, "turnBudgetMs")),
        "--max-duration-ms",
        String(
          integer(limits.maxDurationMs ?? 0, 0, 31536000000, "maxDurationMs")
        ),
      ]
      for (const origin of o.permissions?.network?.origins ?? [])
        args.push("--allow-net", origin)
      if (o.permissions?.network?.allowPrivateAddresses)
        args.push("--allow-private-net")
      if (o.bluetoothMock) args.push("--bluetooth-mock")
      if (o.signal?.aborted) throw new Error("Background start aborted")
      await access(binary, constants.X_OK).catch(() => {
        throw new Error(
          `Sandbox executable unavailable: ${binary}. Build with pnpm --filter @eidos.space/plugin-sandbox build:native or supply binaryPath.`
        )
      })
      await access(o.entry, constants.R_OK)
      if (o.permissions?.bluetooth) {
        const policy = JSON.stringify(o.permissions.bluetooth)
        if (Buffer.byteLength(policy) > 65536)
          throw new Error("Bluetooth policy exceeds 64 KiB")
        this.#directory = await mkdtemp(
          path.join(tmpdir(), "eidos-plugin-sandbox-")
        )
        const file = path.join(this.#directory, "bluetooth.json")
        await writeFile(file, policy, { mode: 0o600, flag: "wx" })
        args.push("--bluetooth-policy", file)
      }
      if (o.signal?.aborted) throw new Error("Background start aborted")
      const child = spawn(binary, args, {
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      })
      this.#child = child
      child.once("error", (error) => this.#fail(error))
      child.stdin.on("error", (error) => {
        if (!this.#stopRequested) this.#fail(error)
      })
      child.once("close", (code, signal) => {
        void this.#finish(code, signal)
      })
      this.#readLines(child.stdout, (line) => this.#frame(line), true)
      this.#readLines(
        child.stderr,
        (line) => {
          this.#stderrTail = (this.#stderrTail + line + "\n").slice(-8192)
          for (const listener of this.#logs) this.#callback(listener, line)
        },
        false
      )
      this.#startupTimer = setTimeout(
        () => this.#fail(new Error("Background startup timed out")),
        startup
      )
      this.#abort = () => {
        void this.stop()
      }
      o.signal?.addEventListener("abort", this.#abort, { once: true })
      if (o.signal?.aborted) this.#abort()
    } catch (error) {
      this.#error = asError(error)
      this.#notifyError(this.#error)
      this.#ready.reject(this.#error)
      await this.#finish(null, null)
    }
  }

  #readLines(
    stream: NodeJS.ReadableStream,
    line: (value: string) => void,
    protocol: boolean
  ) {
    let chunks: Buffer[] = [],
      size = 0,
      total = 0
    let windowStart = performance.now()
    stream.on("data", (chunk: Buffer) => {
      if (this.#finished || this.#error) return
      const now = performance.now()
      if (now - windowStart >= 1000) {
        windowStart = now
        total = 0
      }
      total += chunk.length
      if (total > 32 * MAX_FRAME)
        return this.#fail(new Error("Sandbox output exceeds 32 MiB per second"))
      let offset = 0
      while (offset < chunk.length) {
        const newline = chunk.indexOf(10, offset)
        const end = newline < 0 ? chunk.length : newline
        const part = chunk.subarray(offset, end)
        size += part.length
        if (size > MAX_FRAME + 128)
          return this.#fail(new Error("Sandbox output frame exceeds 1 MiB"))
        chunks.push(part)
        if (newline >= 0) {
          const value = Buffer.concat(chunks, size).toString("utf8")
          chunks = []
          size = 0
          try {
            line(value)
          } catch (error) {
            return this.#fail(asError(error))
          }
        }
        offset = end + 1
      }
    })
    stream.on("end", () => {
      if (!size || this.#finished) return
      if (protocol) this.#fail(new Error("Truncated sandbox protocol frame"))
      else line(Buffer.concat(chunks, size).toString("utf8"))
    })
    stream.on("error", (error: Error) => this.#fail(error))
  }

  #frame(line: string) {
    const frame: unknown = JSON.parse(line)
    if (!record(frame)) throw new Error("Invalid sandbox protocol frame")
    if (
      frame.type === "ready" &&
      frame.protocol === 1 &&
      this.#state === "starting"
    ) {
      clearTimeout(this.#startupTimer)
      this.#state = "running"
      this.#ready.resolve()
    } else if (frame.type === "message" && Object.hasOwn(frame, "data")) {
      for (const listener of this.#messages)
        this.#callback(listener, frame.data as JsonValue)
    } else if (!this.#stopRequested)
      throw new Error("Unsupported sandbox protocol frame/version")
  }

  async postMessage(message: JsonValue): Promise<void> {
    return this.#writeMessage(message, false)
  }
  async #writeMessage(
    message: JsonValue,
    initializing: boolean
  ): Promise<void> {
    if (
      (this.#state !== "running" &&
        !(initializing && this.#state === "starting")) ||
      !this.#child
    )
      throw new Error("Background is not running")
    const data = JSON.stringify(message)
    if (data === undefined)
      throw new TypeError("Message must be JSON serializable")
    const frame = `{"type":"message","data":${data}}\n`
    const bytes = Buffer.byteLength(frame)
    if (bytes > MAX_FRAME) throw new RangeError("Message frame exceeds 1 MiB")
    if (this.#pendingBytes + bytes > MAX_PENDING)
      throw new RangeError("Background input queue exceeds 4 MiB")
    this.#pendingBytes += bytes
    await new Promise<void>((resolve, reject) => {
      this.#child!.stdin.write(frame, (error) => {
        this.#pendingBytes -= bytes
        if (error) reject(error)
        else resolve()
      })
    })
  }

  /** Graceful host stop, then SIGTERM/SIGKILL if the runtime cannot respond. Idempotent. */
  stop(): Promise<BackgroundExit> {
    if (this.#finished || this.#stopRequested) return this.exited
    this.#stopRequested = true
    this.#state = "stopping"
    clearTimeout(this.#startupTimer)
    this.#ready.reject(new Error("Background stopped before ready"))
    const child = this.#child
    if (child) {
      if (child.stdin.writable) child.stdin.end('{"type":"stop"}\n')
      this.#stopTimer = setTimeout(() => {
        child.kill("SIGTERM")
        this.#killTimer = setTimeout(() => {
          child.kill("SIGKILL")
        }, 1000)
      }, this.#options.stopTimeoutMs ?? 5000)
    }
    return this.exited
  }

  async #finish(code: number | null, signal: NodeJS.Signals | null) {
    if (this.#finished) return
    this.#finished = true
    clearTimeout(this.#startupTimer)
    clearTimeout(this.#stopTimer)
    clearTimeout(this.#killTimer)
    if (this.#abort)
      this.#options.signal?.removeEventListener("abort", this.#abort)
    const beforeReady = this.#state === "starting"
    this.#state = "exited"
    if (!this.#error && !this.#stopRequested && (code !== 0 || beforeReady)) {
      this.#error = new Error(
        `Sandbox exited ${beforeReady ? "before ready " : ""}(code=${code}, signal=${signal})${this.#stderrTail ? ": " + this.#stderrTail.trim() : ""}`
      )
      this.#notifyError(this.#error)
    }
    this.#ready.reject(this.#error ?? new Error("Sandbox exited before ready"))
    if (this.#directory) {
      try {
        await rm(this.#directory, { recursive: true, force: true })
      } catch (error) {
        this.#notifyError(asError(error))
      }
    }
    const exit: BackgroundExit = {
      code,
      signal,
      reason: this.#error
        ? "failed"
        : this.#stopRequested
          ? "stopped"
          : "exited",
      ...(this.#error ? { error: this.#error } : {}),
    }
    this.#exit.resolve(exit)
    if (this.#options.onExit) this.#callback(this.#options.onExit, exit)
    this.#messages.clear()
    this.#logs.clear()
  }
}

export async function startBackground(
  options: BackgroundOptions
): Promise<PluginBackground> {
  return PluginBackground.start(options)
}

/** One background per host-chosen key. Scope keys to a space if grants differ by space. */
export class BackgroundManager {
  #entries = new Map<
    string,
    {
      controller: AbortController
      promise: Promise<PluginBackground>
      background?: PluginBackground
    }
  >()
  #disposed = false
  #disposal?: Promise<void>
  constructor(private readonly options: { binaryPath?: string } = {}) {}
  get size() {
    return this.#entries.size
  }
  get(id: string): PluginBackground | undefined {
    return this.#entries.get(id)?.background
  }
  start(
    id: string,
    options: Omit<BackgroundOptions, "binaryPath" | "signal">
  ): Promise<PluginBackground> {
    if (this.#disposed)
      return Promise.reject(new Error("Background manager is disposed"))
    if (!id || this.#entries.has(id))
      return Promise.reject(
        new Error(`Background already exists or key is empty: ${id}`)
      )
    const controller = new AbortController()
    const promise = startBackground({
      ...options,
      binaryPath: this.options.binaryPath,
      signal: controller.signal,
    })
    const entry = {
      controller,
      promise,
      background: undefined as PluginBackground | undefined,
    }
    this.#entries.set(id, entry)
    const remove = () => {
      if (this.#entries.get(id) === entry) this.#entries.delete(id)
    }
    void promise.then((background) => {
      entry.background = background
      void background.exited.then(remove)
    }, remove)
    return promise
  }
  async stop(id: string): Promise<void> {
    const entry = this.#entries.get(id)
    if (!entry) return
    entry.controller.abort()
    const background = await entry.promise.catch(() => undefined)
    if (background) await background.stop()
  }
  dispose(): Promise<void> {
    if (!this.#disposal) {
      this.#disposed = true
      this.#disposal = Promise.all(
        [...this.#entries.keys()].map((id) => this.stop(id))
      ).then(() => {})
    }
    return this.#disposal
  }
}
