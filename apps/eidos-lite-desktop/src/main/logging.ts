import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import type {
  EidosLiteDiagnosticLogEntry,
  EidosLiteDiagnosticLogError,
  EidosLiteLogLevel,
} from "../shared/contracts"

const LOG_FILE = "eidos-lite.jsonl"
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024
const DEFAULT_MAX_FILES = 4
const DEFAULT_RECENT_LIMIT = 80
const MAX_CONTEXT_DEPTH = 5
const MAX_CONTEXT_KEYS = 40
const MAX_ARRAY_ITEMS = 20
const MAX_STRING_LENGTH = 4_000

const URL_PATTERN = /\b(?:https?|file):\/\/[^\s<>"')\]]+/gi
const POSIX_PATH_PATTERN =
  /\/(?:Users|home|private|var|tmp|Volumes|Applications|Library)(?:\/[^\s<>"')\],;]+)+/g
const WINDOWS_PATH_PATTERN = /\b[A-Za-z]:\\[^\s<>"')\],;]+/g
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+){1,2}\b/g
const LONG_IDENTIFIER_PATTERN = /\b(?:[a-f0-9]{20,}|[A-Za-z0-9_-]{32,})\b/gi
const BEARER_PATTERN = /\bBearer\s+[^\s,;]+/gi
const SECRET_ASSIGNMENT_PATTERN =
  /\b(access[_-]?token|refresh[_-]?token|authorization|password|secret|credential|cookie)\s*[:=]\s*["']?[^"',;\s]+/gi

export interface EidosLiteLogSummary {
  format: "jsonl"
  retainedFiles: number
  currentBytes: number
  recent: EidosLiteDiagnosticLogEntry[]
}

export interface EidosLiteLoggerOptions {
  maxBytes?: number
  maxFiles?: number
  now?: () => Date
  onWriteError?: (error: unknown) => void
}

function logFilePath(directory: string, index = 0): string {
  if (index === 0) return path.join(directory, LOG_FILE)
  return path.join(directory, `eidos-lite.${index}.jsonl`)
}

function compactString(value: string): string {
  return value.length <= MAX_STRING_LENGTH
    ? value
    : `${value.slice(0, MAX_STRING_LENGTH)}…`
}

function safeRemoteUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return "<url>"
  }
  if (url.protocol === "file:") return "file://<path>"
  const segments = url.pathname.split("/").filter(Boolean)
  if (
    segments[0] === "api" &&
    segments[1] === "graft" &&
    segments[2] === "repositories"
  ) {
    return "<service>/api/graft/repositories/<repository>"
  }
  if (segments.length >= 3) {
    const operation = segments[2]
    const objectNamespace = ["objects", "refs", "segments", "locks"].includes(
      segments[3] ?? ""
    )
      ? `/${segments[3]}/<object>`
      : segments.length > 3
        ? "/<object>"
        : ""
    return `<service>/<namespace>/<repository>/${operation}${objectNamespace}`
  }
  return segments.length === 0 ? "<service>" : "<service>/<path>"
}

export function sanitizeLogText(value: string): string {
  const urls: string[] = []
  let safe = value.replace(URL_PATTERN, (candidate) => {
    const index = urls.push(safeRemoteUrl(candidate)) - 1
    return `\u0000EIDOS_URL_${index}\u0000`
  })
  safe = safe
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(SECRET_ASSIGNMENT_PATTERN, "$1=[redacted]")
    .replace(JWT_PATTERN, "[token]")
    .replace(EMAIL_PATTERN, "[email]")
    .replace(WINDOWS_PATH_PATTERN, "<path>")
    .replace(POSIX_PATH_PATTERN, "<path>")
    .replace(LONG_IDENTIFIER_PATTERN, "<id>")
  safe = safe.replace(/\u0000EIDOS_URL_(\d+)\u0000/g, (_match, index) => {
    return urls[Number(index)] ?? "<url>"
  })
  return compactString(safe)
}

function sensitiveKey(key: string): "secret" | "path" | "identifier" | null {
  if (/(token|authorization|password|secret|credential|cookie)/i.test(key)) {
    return "secret"
  }
  if (
    /(?:^|_)(?:path|root|directory|cwd)$/i.test(key) ||
    /(?:Path|Root|Directory)$/.test(key)
  ) {
    return "path"
  }
  if (
    /^(?:spaceId|repository|repositoryId|namespace|userId|subject|email)$/i.test(
      key
    )
  ) {
    return "identifier"
  }
  return null
}

function sanitizeContextValue(
  value: unknown,
  key: string,
  depth: number,
  seen: WeakSet<object>
): unknown {
  const sensitivity = sensitiveKey(key)
  if (sensitivity === "secret") return "[redacted]"
  if (sensitivity === "path") return "<path>"
  if (sensitivity === "identifier") return "<id>"
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number"
  ) {
    return value
  }
  if (typeof value === "string") return sanitizeLogText(value)
  if (typeof value === "bigint") return value.toString()
  if (typeof value === "undefined") return undefined
  if (typeof value === "function" || typeof value === "symbol") {
    return `[${typeof value}]`
  }
  if (depth >= MAX_CONTEXT_DEPTH) return "[truncated]"
  if (value instanceof Error) return sanitizeLogError(value, depth + 1, seen)
  if (typeof value !== "object") return sanitizeLogText(String(value))
  if (seen.has(value)) return "[circular]"
  seen.add(value)
  try {
    if (Array.isArray(value)) {
      return value
        .slice(0, MAX_ARRAY_ITEMS)
        .map((entry) => sanitizeContextValue(entry, key, depth + 1, seen))
    }
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, MAX_CONTEXT_KEYS)
        .flatMap(([entryKey, entryValue]) => {
          const sanitized = sanitizeContextValue(
            entryValue,
            entryKey,
            depth + 1,
            seen
          )
          return sanitized === undefined ? [] : [[entryKey, sanitized]]
        })
    )
  } finally {
    seen.delete(value)
  }
}

export function sanitizeLogContext(
  context: Record<string, unknown>
): Record<string, unknown> {
  return sanitizeContextValue(context, "context", 0, new WeakSet()) as Record<
    string,
    unknown
  >
}

function errorCode(error: Error): string | undefined {
  if (!("code" in error)) return undefined
  const code = (error as Error & { code?: unknown }).code
  return typeof code === "string" ? sanitizeLogText(code) : undefined
}

export function sanitizeLogError(
  error: unknown,
  depth = 0,
  seen = new WeakSet<object>()
): EidosLiteDiagnosticLogError {
  if (!(error instanceof Error)) {
    return { name: "Error", message: sanitizeLogText(String(error)) }
  }
  if (seen.has(error) || depth >= MAX_CONTEXT_DEPTH) {
    return { name: error.name || "Error", message: "[truncated]" }
  }
  seen.add(error)
  const cause = "cause" in error ? error.cause : undefined
  const code = errorCode(error)
  return {
    name: sanitizeLogText(error.name || "Error"),
    message: sanitizeLogText(error.message),
    ...(code ? { code } : {}),
    ...(error.stack ? { stack: sanitizeLogText(error.stack) } : {}),
    ...(cause === undefined
      ? {}
      : { cause: sanitizeLogError(cause, depth + 1, seen) }),
  }
}

export function logCorrelationKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12)
}

export function createTextLineBuffer(onLine: (line: string) => void): {
  write(chunk: Buffer | string): void
  end(): void
} {
  let pending = ""
  return {
    write(chunk) {
      const lines = `${pending}${String(chunk)}`.split(/\r?\n/)
      pending = lines.pop() ?? ""
      for (const line of lines) onLine(line)
    },
    end() {
      if (pending) onLine(pending)
      pending = ""
    },
  }
}

export class EidosLiteLogger {
  private readonly maxBytes: number
  private readonly maxFiles: number
  private readonly now: () => Date
  private readonly onWriteError: (error: unknown) => void
  private sequence = 0
  private writable = true

  constructor(
    private readonly directory: string,
    options: EidosLiteLoggerOptions = {}
  ) {
    this.maxBytes = Math.max(1_024, options.maxBytes ?? DEFAULT_MAX_BYTES)
    this.maxFiles = Math.max(1, options.maxFiles ?? DEFAULT_MAX_FILES)
    this.now = options.now ?? (() => new Date())
    this.onWriteError = options.onWriteError ?? (() => undefined)
    try {
      fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 })
      fs.chmodSync(this.directory, 0o700)
    } catch (error) {
      this.writable = false
      this.onWriteError(error)
    }
  }

  debug(
    event: string,
    context?: Record<string, unknown>,
    error?: unknown
  ): void {
    this.write("debug", event, context, error)
  }

  info(
    event: string,
    context?: Record<string, unknown>,
    error?: unknown
  ): void {
    this.write("info", event, context, error)
  }

  warn(
    event: string,
    context?: Record<string, unknown>,
    error?: unknown
  ): void {
    this.write("warn", event, context, error)
  }

  error(
    event: string,
    context?: Record<string, unknown>,
    error?: unknown
  ): void {
    this.write("error", event, context, error)
  }

  record(
    level: EidosLiteLogLevel,
    source: EidosLiteDiagnosticLogEntry["source"],
    event: string,
    context?: Record<string, unknown>,
    error?: unknown
  ): void {
    this.write(level, event, context, error, source)
  }

  summary(limit = DEFAULT_RECENT_LIMIT): EidosLiteLogSummary {
    const files = Array.from({ length: this.maxFiles }, (_entry, index) =>
      logFilePath(this.directory, index)
    ).filter((filePath) => fs.existsSync(filePath))
    let currentBytes = 0
    try {
      currentBytes = fs.statSync(logFilePath(this.directory)).size
    } catch {
      currentBytes = 0
    }
    const entries: EidosLiteDiagnosticLogEntry[] = []
    for (const filePath of files.reverse()) {
      let contents = ""
      try {
        contents = fs.readFileSync(filePath, "utf8")
      } catch {
        continue
      }
      for (const line of contents.split("\n")) {
        if (!line) continue
        try {
          const entry = JSON.parse(line) as EidosLiteDiagnosticLogEntry
          if (entry.schemaVersion === 1) entries.push(entry)
        } catch {
          // A partial final line after a crash is ignored.
        }
      }
    }
    return {
      format: "jsonl",
      retainedFiles: files.length,
      currentBytes,
      recent: entries.slice(-Math.max(0, limit)),
    }
  }

  private write(
    level: EidosLiteLogLevel,
    event: string,
    context?: Record<string, unknown>,
    error?: unknown,
    source: EidosLiteDiagnosticLogEntry["source"] = "main"
  ): void {
    const entry: EidosLiteDiagnosticLogEntry = {
      schemaVersion: 1,
      timestamp: this.now().toISOString(),
      sequence: ++this.sequence,
      level,
      source,
      event: sanitizeLogText(event),
      ...(context ? { context: sanitizeLogContext(context) } : {}),
      ...(error === undefined ? {} : { error: sanitizeLogError(error) }),
    }
    this.append(`${JSON.stringify(entry)}\n`)
  }

  private append(line: string): void {
    if (!this.writable) return
    try {
      const filePath = logFilePath(this.directory)
      const currentBytes = fs.existsSync(filePath)
        ? fs.statSync(filePath).size
        : 0
      const nextBytes = Buffer.byteLength(line)
      if (currentBytes > 0 && currentBytes + nextBytes > this.maxBytes) {
        this.rotate()
      }
      fs.appendFileSync(filePath, line, { encoding: "utf8", mode: 0o600 })
      fs.chmodSync(filePath, 0o600)
    } catch (error) {
      this.writable = false
      this.onWriteError(error)
    }
  }

  private rotate(): void {
    const oldest = logFilePath(this.directory, this.maxFiles - 1)
    if (fs.existsSync(oldest)) fs.unlinkSync(oldest)
    for (let index = this.maxFiles - 2; index >= 0; index -= 1) {
      const source = logFilePath(this.directory, index)
      if (!fs.existsSync(source)) continue
      fs.renameSync(source, logFilePath(this.directory, index + 1))
    }
  }
}

let activeLogger: EidosLiteLogger | null = null

export function initializeEidosLiteLogger(
  directory: string,
  options: EidosLiteLoggerOptions = {}
): EidosLiteLogger {
  activeLogger = new EidosLiteLogger(directory, options)
  return activeLogger
}

export function eidosLiteLogger(): EidosLiteLogger | null {
  return activeLogger
}

export function eidosLiteLogSummary(): EidosLiteLogSummary {
  return (
    activeLogger?.summary() ?? {
      format: "jsonl",
      retainedFiles: 0,
      currentBytes: 0,
      recent: [],
    }
  )
}

export function installConsoleLogging(logger: EidosLiteLogger): () => void {
  const originalWarn = console.warn
  const originalError = console.error
  console.warn = (...values: unknown[]) => {
    logger.warn("console.warn", { values })
    originalWarn(...values)
  }
  console.error = (...values: unknown[]) => {
    const error = values.find((value) => value instanceof Error)
    logger.error("console.error", { values }, error)
    originalError(...values)
  }
  return () => {
    console.warn = originalWarn
    console.error = originalError
  }
}
