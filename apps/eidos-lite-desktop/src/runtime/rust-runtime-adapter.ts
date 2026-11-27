import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  EIDOS_RUNTIME_LIMITS,
  type RuntimeClient,
} from "@eidos.space/eidos-file"

export type EidosLiteRuntimeBackend = "js" | "rust" | "shadow"

export interface ShadowDiffRecord {
  method: string
  jsMs: number
  rustMs: number
  matched: boolean
  diffSummary?: string
}

interface NativeEidosRuntimeInstance {
  call(method: string, requestJson: string): string
  dataVersion(): string
  setSpaceFileColumns(fields: string[]): void
  loadExtension(extPath: string): void
  close(): void
}

interface NativeEidosRuntimeModule {
  NativeEidosRuntime: {
    create(filePath: string, title: string): NativeEidosRuntimeInstance
    open(filePath: string, readOnly: boolean): NativeEidosRuntimeInstance
  }
}

export interface RustRuntimeClient extends RuntimeClient {
  mutateRowsWithUndo?: (
    request: Parameters<RuntimeClient["mutateRows"]>[0],
    context: Parameters<RuntimeClient["mutateRows"]>[1]
  ) => ReturnType<RuntimeClient["mutateRows"]>
  revertRowDeletion?: (
    request: { undoToken: string; expectedRevision: string },
    context: Parameters<RuntimeClient["mutateRows"]>[1]
  ) => Promise<
    Awaited<ReturnType<RuntimeClient["mutateRows"]>> & { rowCount: string }
  >
  rustDataVersion(): string
  setSpaceFileColumns(fields: string[]): void
  rustLoadExtension(extPath: string): void
}

const require = createRequire(import.meta.url)
let cachedAddon: NativeEidosRuntimeModule | null = null

export function resolveEidosLiteRuntimeBackend(): EidosLiteRuntimeBackend {
  const raw = process.env.EIDOS_LITE_RUNTIME_BACKEND?.trim().toLowerCase()
  if (raw === "js" || raw === "shadow") return raw
  return "rust"
}

function candidateAddonPaths(): string[] {
  const explicit = process.env.EIDOS_RUST_RUNTIME_NAPI_PATH?.trim()
  const ext =
    process.platform === "darwin"
      ? "dylib"
      : process.platform === "win32"
        ? "dll"
        : "so"
  const prefix = process.platform === "win32" ? "" : "lib"
  const here = path.dirname(fileURLToPath(import.meta.url))
  const repoRoot = path.resolve(here, "../../../..")
  return [
    ...(explicit ? [explicit] : []),
    ...(process.resourcesPath
      ? [
          path.join(
            process.resourcesPath,
            "file-runtime",
            "eidos-file-runtime.node"
          ),
        ]
      : []),
    path.resolve(here, "../resources/file-runtime/eidos-file-runtime.node"),
    path.resolve(here, "../../resources/file-runtime/eidos-file-runtime.node"),
    path.join(
      repoRoot,
      "crates/eidos-file-runtime-napi/eidos-file-runtime-napi.node"
    ),
    path.join(
      repoRoot,
      `target/release/${prefix}eidos_file_runtime_napi.${ext}`
    ),
    path.join(repoRoot, `target/debug/${prefix}eidos_file_runtime_napi.${ext}`),
  ]
}

function loadAddon(): NativeEidosRuntimeModule {
  if (cachedAddon) return cachedAddon
  const candidates = candidateAddonPaths()
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue
    if (candidate.endsWith(".node")) {
      cachedAddon = require(candidate) as NativeEidosRuntimeModule
      return cachedAddon
    }
    const mod = { exports: {} as NativeEidosRuntimeModule }
    process.dlopen(mod, candidate)
    cachedAddon = mod.exports
    return cachedAddon
  }
  throw new Error(
    `Rust Runtime N-API addon not found. Build with: cargo build --release -p eidos-file-runtime-napi. Checked: ${candidates.join(", ")}`
  )
}

function decodeRustError(error: unknown): Error {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error)
  const marker = "__EIDOS_RT_ERR__:"
  const idx = message.indexOf(marker)
  if (idx !== -1) {
    try {
      const payload = JSON.parse(message.slice(idx + marker.length)) as Record<
        string,
        unknown
      >
      const out = new Error(
        typeof payload.message === "string"
          ? payload.message
          : "Rust runtime error"
      )
      Object.assign(out, payload)
      return out
    } catch {
      // fall through
    }
  }
  return error instanceof Error ? error : new Error(message)
}

function wrapNativeHandle(
  handle: NativeEidosRuntimeInstance
): RustRuntimeClient {
  const pending = new Map<string, () => void>()
  const invoke = async <T>(
    method: string,
    request: unknown,
    ctx?: Parameters<RuntimeClient["getSnapshot"]>[1]
  ): Promise<T> => {
    const id = ctx?.requestId
    if (
      ctx &&
      (typeof id !== "string" ||
        !id ||
        id.includes("\0") ||
        Buffer.byteLength(id) > 128)
    )
      throw Object.assign(new Error("Invalid requestId"), {
        code: "invalid-request",
        path: "/requestId",
      })
    const timeout =
      ctx?.deadlineMilliseconds ?? EIDOS_RUNTIME_LIMITS.foregroundTimeMsMax
    if (!Number.isSafeInteger(timeout) || timeout < 1)
      throw Object.assign(new Error("Invalid deadlineMilliseconds"), {
        code: "invalid-request",
      })
    if (id !== undefined && pending.has(id))
      throw Object.assign(new Error("requestId is already unresolved"), {
        code: "invalid-request",
      })
    const deadline =
      performance.now() +
      Math.min(timeout, EIDOS_RUNTIME_LIMITS.foregroundTimeMsMax)
    let cancelled = ctx?.signal?.aborted ?? false
    const cancel = () => {
      cancelled = true
    }
    const unsubscribe = ctx?.signal?.onAbort(cancel)
    if (id !== undefined) pending.set(id, cancel)
    try {
      await Promise.resolve()
      if (cancelled)
        throw Object.assign(new Error("Request was cancelled"), {
          code: "cancelled",
          retryable: true,
        })
      if (performance.now() > deadline)
        throw Object.assign(new Error("Request deadline exceeded"), {
          code: "deadline-exceeded",
          retryable: true,
        })
      const raw = handle.call(method, JSON.stringify(request ?? {}))
      return JSON.parse(raw) as T
    } catch (error) {
      throw decodeRustError(error)
    } finally {
      unsubscribe?.()
      if (id !== undefined) pending.delete(id)
    }
  }

  return {
    negotiate: (req, ctx) => invoke("negotiate", req, ctx),
    getSnapshot: (req, ctx) => invoke("getSnapshot", req, ctx),
    getSchemaPage: (req, ctx) => invoke("getSchemaPage", req, ctx),
    queryRows: (req, ctx) => invoke("queryRows", req, ctx),
    queryRowPages: (req, ctx) => invoke("queryRowPages", req, ctx),
    getRecordNeighbors: (req, ctx) => invoke("getRecordNeighbors", req, ctx),
    getRowIndex: (req, ctx) => invoke("getRowIndex", req, ctx),
    getRowsById: (req, ctx) => invoke("getRowsById", req, ctx),
    aggregate: (req, ctx) => invoke("aggregate", req, ctx),
    groupRows: (req, ctx) => invoke("groupRows", req, ctx),
    queryGroupRows: (req, ctx) => invoke("queryGroupRows", req, ctx),
    previewFormula: (req, ctx) => invoke("previewFormula", req, ctx),
    importCsv: ({ csv, ...request }, ctx) =>
      invoke(
        "importCsv",
        {
          ...request,
          csvUtf8: new TextDecoder("utf-8", { fatal: true }).decode(csv),
        },
        ctx
      ),
    exportCsv: async (req, ctx) => {
      const result = await invoke<{
        fileId: string
        tableId: string
        revision: string
        csv: string
      }>("exportCsv", req, ctx)
      return { ...result, csv: new TextEncoder().encode(result.csv) }
    },
    mutateRows: (req, ctx) => invoke("mutateRows", req, ctx),
    mutateRowsWithUndo: (req, ctx) => invoke("mutateRowsWithUndo", req, ctx),
    revertMutation: (req, ctx) => invoke("revertMutation", req, ctx),
    revertRowDeletion: (req, ctx) => invoke("revertRowDeletion", req, ctx),
    mutateView: (req, ctx) => invoke("mutateView", req, ctx),
    preflightSchema: (req, ctx) => invoke("preflightSchema", req, ctx),
    getSchemaPlanDependencies: (req, ctx) =>
      invoke("getSchemaPlanDependencies", req, ctx),
    mutateSchema: (req, ctx) => invoke("mutateSchema", req, ctx),
    validate: (req, ctx) => invoke("validate", req, ctx),
    cancel: async ({ requestId }) => {
      pending.get(requestId)?.()
    },
    close: async () => {
      try {
        handle.close()
      } catch (error) {
        throw decodeRustError(error)
      }
    },
    rustDataVersion: () => handle.dataVersion(),
    setSpaceFileColumns: (fields) => handle.setSpaceFileColumns(fields),
    rustLoadExtension: (extPath: string) => handle.loadExtension(extPath),
  }
}

export function createRustRuntimeService(
  filePath: string,
  title: string
): RustRuntimeClient {
  try {
    return wrapNativeHandle(
      loadAddon().NativeEidosRuntime.create(filePath, title)
    )
  } catch (error) {
    throw decodeRustError(error)
  }
}

export function openRustRuntimeService(
  filePath: string,
  readOnly: boolean
): RustRuntimeClient {
  const addon = loadAddon()
  try {
    return wrapNativeHandle(addon.NativeEidosRuntime.open(filePath, readOnly))
  } catch (error) {
    throw decodeRustError(error)
  }
}

/**
 * Shadow verification proxy: executes the primary JS RuntimeClient while
 * mirroring read-only calls to the Rust RuntimeClient to verify semantic parity
 * and capture live latency deltas without affecting user mutations.
 */
export function createShadowRuntimeClient(
  primary: RuntimeClient,
  rustReadOnly: RustRuntimeClient,
  onDiff?: (record: ShadowDiffRecord) => void
): RuntimeClient {
  const mirrorRead = async <T>(
    method: string,
    primaryCall: () => Promise<T>,
    rustCall: () => Promise<T>,
    normalize?: (v: T) => unknown
  ): Promise<T> => {
    const tJs0 = performance.now()
    const jsResult = await primaryCall()
    const jsMs = performance.now() - tJs0

    const tRust0 = performance.now()
    try {
      const rustResult = await rustCall()
      const rustMs = performance.now() - tRust0
      const a = JSON.stringify(normalize ? normalize(jsResult) : jsResult)
      const b = JSON.stringify(normalize ? normalize(rustResult) : rustResult)
      onDiff?.({
        method,
        jsMs,
        rustMs,
        matched: a === b,
        ...(a === b
          ? {}
          : { diffSummary: `js=${a.slice(0, 120)} rust=${b.slice(0, 120)}` }),
      })
    } catch (error) {
      const rustMs = performance.now() - tRust0
      onDiff?.({
        method,
        jsMs,
        rustMs,
        matched: false,
        diffSummary: `rust threw: ${error instanceof Error ? error.message : String(error)}`,
      })
    }
    return jsResult
  }

  const overrides: Partial<RuntimeClient> = {
    getSnapshot: (req, ctx) =>
      mirrorRead(
        "getSnapshot",
        () => primary.getSnapshot(req, ctx),
        () => rustReadOnly.getSnapshot(req, ctx)
      ),
    queryRows: (req, ctx) =>
      mirrorRead(
        "queryRows",
        () => primary.queryRows(req, ctx),
        () => rustReadOnly.queryRows(req, ctx),
        (page) => ({
          tableId: page.tableId,
          revision: page.revision,
          rows: page.rows.map((r) => ({ id: r.id, values: r.values })),
        })
      ),
    aggregate: (req, ctx) =>
      mirrorRead(
        "aggregate",
        () => primary.aggregate(req, ctx),
        () => rustReadOnly.aggregate(req, ctx),
        (res) => res.results
      ),
    validate: (req, ctx) =>
      mirrorRead(
        "validate",
        () => primary.validate(req, ctx),
        () => rustReadOnly.validate(req, ctx),
        (rep) => ({ valid: rep.valid, level: rep.level })
      ),
    close: async (ctx) => {
      try {
        await rustReadOnly.close(ctx)
      } finally {
        await primary.close(ctx)
      }
    },
  }

  return new Proxy(primary, {
    get(target, prop, receiver) {
      if (typeof prop === "string" && prop in overrides) {
        return overrides[prop as keyof RuntimeClient]
      }
      const value = Reflect.get(target, prop, receiver) as unknown
      return typeof value === "function" ? value.bind(target) : value
    },
  })
}
