import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

import type { RuntimeClient } from "@eidos.space/eidos-file"

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
  rustLoadExtension(extPath: string): void
}

const require = createRequire(import.meta.url)
let cachedAddon: NativeEidosRuntimeModule | null = null

// Open lazily so files without eligible statistics never need a second handle.
export function nativeColumnStatistics(filePath: string) {
  let reader: NativeEidosRuntimeInstance | undefined
  return {
    aggregate(
      request: Parameters<RuntimeClient["aggregate"]>[0]
    ): Awaited<ReturnType<RuntimeClient["aggregate"]>> | undefined {
      try {
        reader ??= loadAddon().NativeEidosRuntime.open(filePath, true)
        return JSON.parse(reader.call("aggregate", JSON.stringify(request)))
      } catch {
        // The canonical read already holds a snapshot and can finish this request.
        return undefined
      }
    },
    close() {
      reader?.close()
      reader = undefined
    },
  }
}

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
  const invoke = async <T>(method: string, request: unknown): Promise<T> => {
    try {
      const raw = handle.call(method, JSON.stringify(request ?? {}))
      return JSON.parse(raw) as T
    } catch (error) {
      throw decodeRustError(error)
    }
  }

  return {
    negotiate: (req) => invoke("negotiate", req),
    getSnapshot: (req) => invoke("getSnapshot", req),
    getSchemaPage: (req) => invoke("getSchemaPage", req),
    queryRows: (req) => invoke("queryRows", req),
    queryRowPages: (req) => invoke("queryRowPages", req),
    getRecordNeighbors: (req) => invoke("getRecordNeighbors", req),
    getRowIndex: (req) => invoke("getRowIndex", req),
    getRowsById: (req) => invoke("getRowsById", req),
    aggregate: (req) => invoke("aggregate", req),
    groupRows: (req) => invoke("groupRows", req),
    queryGroupRows: (req) => invoke("queryGroupRows", req),
    previewFormula: (req) => invoke("previewFormula", req),
    mutateRows: (req) => invoke("mutateRows", req),
    mutateRowsWithUndo: (req) => invoke("mutateRowsWithUndo", req),
    revertMutation: (req) => invoke("revertMutation", req),
    revertRowDeletion: (req) => invoke("revertRowDeletion", req),
    mutateView: (req) => invoke("mutateView", req),
    preflightSchema: (req) => invoke("preflightSchema", req),
    getSchemaPlanDependencies: (req) =>
      invoke("getSchemaPlanDependencies", req),
    mutateSchema: (req) => invoke("mutateSchema", req),
    validate: (req) => invoke("validate", req),
    cancel: (req) => invoke("cancel", req),
    close: async () => {
      try {
        handle.close()
      } catch (error) {
        throw decodeRustError(error)
      }
    },
    rustDataVersion: () => handle.dataVersion(),
    rustLoadExtension: (extPath: string) => handle.loadExtension(extPath),
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
