import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

let cachedAddon = null

function candidateBinaryPaths() {
  const explicit = process.env.EIDOS_RUST_RUNTIME_NAPI_PATH?.trim()
  const ext =
    process.platform === "darwin"
      ? "dylib"
      : process.platform === "win32"
        ? "dll"
        : "so"
  const prefix = process.platform === "win32" ? "" : "lib"
  const repoRoot = path.resolve(__dirname, "../..")
  return [
    ...(explicit ? [explicit] : []),
    path.join(__dirname, "eidos-file-runtime-napi.node"),
    path.join(repoRoot, `target/release/${prefix}eidos_file_runtime_napi.${ext}`),
    path.join(repoRoot, `target/debug/${prefix}eidos_file_runtime_napi.${ext}`),
  ]
}

export function loadRustRuntimeAddon() {
  if (cachedAddon) return cachedAddon
  const candidates = candidateBinaryPaths()
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue
    // Node's dlopen requires `.node` extension on some loaders; if loading a .dylib/.so/.dll,
    // use process.dlopen directly into a module object.
    if (candidate.endsWith(".node")) {
      cachedAddon = require(candidate)
      return cachedAddon
    }
    const mod = { exports: {} }
    process.dlopen(mod, candidate)
    cachedAddon = mod.exports
    return cachedAddon
  }
  throw new Error(
    `Could not locate eidos-file-runtime-napi binary. Checked:\n${candidates.join("\n")}\nBuild it with: cargo build --release -p eidos-file-runtime-napi`
  )
}

function decodeRustError(err) {
  const msg = typeof err?.message === "string" ? err.message : String(err)
  const marker = "__EIDOS_RT_ERR__:"
  const idx = msg.indexOf(marker)
  if (idx !== -1) {
    try {
      const payload = JSON.parse(msg.slice(idx + marker.length))
      const out = new Error(payload.message ?? "Rust runtime error")
      Object.assign(out, payload)
      return out
    } catch {
      // fall through
    }
  }
  return err
}

function wrapHandle(handle) {
  const invoke = async (method, request = {}) => {
    try {
      const raw = handle.call(method, JSON.stringify(request ?? {}))
      return JSON.parse(raw)
    } catch (err) {
      throw decodeRustError(err)
    }
  }

  return {
    __nativeHandle: handle,
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
      } catch (err) {
        throw decodeRustError(err)
      }
    },
    dataVersion: () => handle.dataVersion(),
    loadExtension: (extPath) => handle.loadExtension(extPath),
  }
}

export async function createRustRuntimeClient(filePath, options = {}) {
  const { NativeEidosRuntime } = loadRustRuntimeAddon()
  try {
    const handle = NativeEidosRuntime.create(
      filePath,
      options.title ?? "Untitled"
    )
    return wrapHandle(handle)
  } catch (err) {
    throw decodeRustError(err)
  }
}

export async function openRustRuntimeClient(filePath, options = {}) {
  const { NativeEidosRuntime } = loadRustRuntimeAddon()
  try {
    const handle = NativeEidosRuntime.open(filePath, Boolean(options.readOnly))
    return wrapHandle(handle)
  } catch (err) {
    throw decodeRustError(err)
  }
}
