import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { createHash } from "node:crypto"
import { PluginError } from "@eidos.space/plugin-runtime/rpc"
import type { PluginErrorCode } from "@eidos.space/plugin-runtime"
import type { DiskSnapshot } from "@eidos.space/plugin-runtime/working-copy"
import { decodeText, encodeText } from "../space/text-file-preview"

const FRAME_LIMIT = 3 * 1024 * 1024
const TEXT_LIMIT = 2 * 1024 * 1024
const codes = new Set<PluginErrorCode>([
  "INVALID_REQUEST",
  "PERMISSION_DENIED",
  "DOCUMENT_UNAVAILABLE",
  "ALREADY_EXISTS",
  "STALE_REVISION",
  "TOO_LARGE",
  "IO_ERROR",
])
type Operation =
  | { method: "read" | "list"; path: string }
  | { method: "create"; path: string; bytes: string }
  | { method: "write"; path: string; bytes: string; revision: string }
interface Pending {
  resolve(value: unknown): void
  reject(error: unknown): void
  timer: ReturnType<typeof setTimeout>
}

/** Host-only transport. The caller must authorize each operation and protect
 * plugin source/config roots before creating it. Closing aborts all pending I/O.
 * No paths or process handles are supplied to the plugin iframe.
 */
export class PluginFilesystem {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<number, Pending>()
  private readonly ready: Promise<void>
  private resolveReady!: () => void
  private rejectReady!: (error: unknown) => void
  private buffer = Buffer.alloc(0)
  private sequence = 0
  private closed = false
  private initialized = false
  private readonly startup: ReturnType<typeof setTimeout>
  private readonly abort = () => this.dispose()

  static async open(options: {
    executable: string
    root: string
    identity: { dev: string; ino: string }
    denied: string[]
    signal: AbortSignal
  }): Promise<PluginFilesystem> {
    if (options.signal.aborted)
      throw new PluginError("INSTANCE_CLOSED", "Resource lifetime ended")
    const filesystem = new PluginFilesystem(options)
    await filesystem.ready
    return filesystem
  }

  private constructor(
    private readonly options: {
      executable: string
      root: string
      identity: { dev: string; ino: string }
      denied: string[]
      signal: AbortSignal
    }
  ) {
    this.ready = new Promise((resolve, reject) => {
      this.resolveReady = resolve
      this.rejectReady = reject
    })
    this.child = spawn(
      options.executable,
      [
        "plugin",
        "fs",
        "--root",
        options.root,
        ...options.denied.flatMap((name) => ["--deny", name]),
      ],
      {
        stdio: "pipe",
        windowsHide: true,
      }
    )
    this.startup = setTimeout(
      () =>
        this.fail(new PluginError("TIMEOUT", "Filesystem startup timed out")),
      5000
    )
    this.child.stdout.on("data", (chunk: Buffer) => this.receive(chunk))
    // Do not accumulate native diagnostics or expose filesystem paths to guests.
    this.child.stderr.resume()
    this.child.on("error", () =>
      this.fail(
        new PluginError("IO_ERROR", "Could not start native filesystem")
      )
    )
    this.child.on("exit", () =>
      this.fail(new PluginError("IO_ERROR", "Native filesystem exited"))
    )
    this.child.stdin.on("error", () =>
      this.fail(new PluginError("IO_ERROR", "Native filesystem input closed"))
    )
    options.signal.addEventListener("abort", this.abort, { once: true })
    if (options.signal.aborted) this.dispose()
  }

  private receive(chunk: Buffer): void {
    if (this.closed) return
    this.buffer = Buffer.concat([this.buffer, chunk])
    for (;;) {
      const end = this.buffer.indexOf(10)
      if (end < 0) {
        if (this.buffer.length > FRAME_LIMIT)
          this.fail(
            new PluginError("TOO_LARGE", "Native response exceeds limit")
          )
        return
      }
      if (end > FRAME_LIMIT) {
        this.fail(new PluginError("TOO_LARGE", "Native response exceeds limit"))
        return
      }
      const frame = this.buffer.subarray(0, end)
      this.buffer = this.buffer.subarray(end + 1)
      try {
        const value: unknown = JSON.parse(frame.toString("utf8"))
        if (!value || typeof value !== "object")
          throw new Error("Invalid frame")
        const response = value as Record<string, unknown>
        if (!this.initialized) {
          if (
            response.ready !== 1 ||
            response.dev !== this.options.identity.dev ||
            response.ino !== this.options.identity.ino
          )
            throw new Error("Space identity changed")
          this.initialized = true
          clearTimeout(this.startup)
          this.resolveReady()
          continue
        }
        if (typeof response.id !== "number")
          throw new Error("Missing request ID")
        const pending = this.pending.get(response.id)
        if (!pending) throw new Error("Unknown request ID")
        this.pending.delete(response.id)
        clearTimeout(pending.timer)
        if (response.error) {
          const code = (response.error as { code?: PluginErrorCode }).code
          pending.reject(
            new PluginError(
              code && codes.has(code) ? code : "IO_ERROR",
              "Native resource operation failed"
            )
          )
        } else pending.resolve(response.result)
      } catch {
        this.fail(
          new PluginError(
            "IO_ERROR",
            "Invalid native response or Space identity"
          )
        )
        return
      }
    }
  }

  private request(operation: Operation): Promise<unknown> {
    if (this.closed)
      return Promise.reject(
        new PluginError("INSTANCE_CLOSED", "Resource lifetime ended")
      )
    if (this.pending.size >= 32)
      return Promise.reject(
        new PluginError("BUSY", "Too many resource operations")
      )
    const id = ++this.sequence
    const frame = JSON.stringify({ id, operation }) + "\n"
    if (Buffer.byteLength(frame) > FRAME_LIMIT)
      return Promise.reject(
        new PluginError("TOO_LARGE", "Resource request exceeds limit")
      )
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () =>
          this.fail(
            new PluginError("TIMEOUT", "Native resource operation timed out")
          ),
        10000
      )
      this.pending.set(id, { resolve, reject, timer })
      this.child.stdin.write(frame)
    })
  }

  async read(path: string): Promise<DiskSnapshot> {
    const value = (await this.request({ method: "read", path })) as {
      bytes: string
      revision: string
    }
    const bytes = Buffer.from(value.bytes, "base64")
    if (bytes.length > TEXT_LIMIT)
      throw new PluginError("TOO_LARGE", "Text exceeds 2 MiB")
    if (createHash("sha256").update(bytes).digest("hex") !== value.revision)
      throw new PluginError("IO_ERROR", "Native snapshot integrity mismatch")
    const decoded = decodeText(bytes, false)
    if (!decoded)
      throw new PluginError(
        "DOCUMENT_UNAVAILABLE",
        "Resource is not an ordinary text file"
      )
    return {
      text: decoded.content,
      encoding: decoded.encoding,
      bom: decoded.bom,
      revision: value.revision,
    }
  }

  async list(path: string): Promise<string[]> {
    const value = (await this.request({ method: "list", path })) as {
      files: unknown
    }
    if (
      !Array.isArray(value.files) ||
      value.files.some((file) => typeof file !== "string")
    )
      throw new PluginError("IO_ERROR", "Invalid native directory listing")
    return value.files as string[]
  }

  async create(path: string, text: string): Promise<DiskSnapshot> {
    const snapshot = { text, encoding: "utf-8" as const, bom: false }
    const bytes = this.encode(snapshot)
    const result = (await this.request({
      method: "create",
      path,
      bytes: bytes.toString("base64"),
    })) as { revision: string }
    return { ...snapshot, revision: result.revision }
  }

  async write(
    path: string,
    text: string,
    expected: DiskSnapshot
  ): Promise<DiskSnapshot> {
    const snapshot = { text, encoding: expected.encoding, bom: expected.bom }
    const bytes = this.encode(snapshot)
    const result = (await this.request({
      method: "write",
      path,
      bytes: bytes.toString("base64"),
      revision: expected.revision,
    })) as { revision: string }
    return { ...snapshot, revision: result.revision }
  }

  private encode(snapshot: Omit<DiskSnapshot, "revision">): Buffer {
    for (const character of snapshot.text) {
      const point = character.codePointAt(0)!
      if (point >= 0xd800 && point <= 0xdfff)
        throw new PluginError(
          "INVALID_REQUEST",
          "Text contains an unpaired Unicode surrogate"
        )
    }
    const bytes = encodeText(snapshot.text, snapshot.encoding, snapshot.bom)
    if (bytes.length > TEXT_LIMIT)
      throw new PluginError("TOO_LARGE", "Text exceeds 2 MiB")
    if (!decodeText(bytes, false))
      throw new PluginError(
        "DOCUMENT_UNAVAILABLE",
        "Resource is not ordinary text"
      )
    return bytes
  }

  private fail(error: PluginError): void {
    if (this.closed) return
    this.closed = true
    clearTimeout(this.startup)
    this.options.signal.removeEventListener("abort", this.abort)
    this.rejectReady(error)
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
    this.buffer = Buffer.alloc(0)
    this.child.kill()
  }

  dispose(): void {
    this.fail(new PluginError("INSTANCE_CLOSED", "Resource lifetime ended"))
  }
}
