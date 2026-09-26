import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { DatabaseSync } from "node:sqlite"

export function assertPortableFsMeta(database: DatabaseSync): void {
  try {
    const result = database.prepare("SELECT fs_meta_root_mode() AS mode").get()
    if (result?.mode === "database") return
  } catch {
    /* Older extensions do not expose the capability probe. */
  }
  throw new Error(
    "The fs_meta extension is too old: database-relative paths and SQL quote decoding are required. Update the native extension."
  )
}

/**
 * Resolves the absolute path to an authorized native SQLite virtual table extension.
 * Currently supports 'fs_meta'.
 */
export function resolveVTabExtensionPath(moduleName: string): string | null {
  if (moduleName !== "fs_meta" && moduleName !== "vtab:fs_meta") {
    return null
  }

  const platform = process.platform
  let binaryName: string
  if (platform === "darwin") {
    binaryName = "libfs_meta.dylib"
  } else if (platform === "win32") {
    binaryName = "fs_meta.dll"
  } else {
    binaryName = "libfs_meta.so"
  }

  // 1. Check process.resourcesPath (packaged Electron app)
  if (typeof process !== "undefined" && "resourcesPath" in process) {
    const packagedPath = path.join(
      (process as unknown as { resourcesPath: string }).resourcesPath,
      "vtab",
      binaryName
    )
    if (fs.existsSync(packagedPath)) {
      return packagedPath
    }
  }

  // 2. Check local workspace resources/vtab directory
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const localResourcePath = path.resolve(
    currentDir,
    "../../resources/vtab",
    binaryName
  )
  if (fs.existsSync(localResourcePath)) {
    return localResourcePath
  }
  const altResourcePath = path.resolve(
    currentDir,
    "../resources/vtab",
    binaryName
  )
  if (fs.existsSync(altResourcePath)) {
    return altResourcePath
  }

  // 3. Fallback to environment variables or relative sibling checkout
  if (
    process.env.SQLITE_FS_META_PATH &&
    fs.existsSync(process.env.SQLITE_FS_META_PATH)
  ) {
    return process.env.SQLITE_FS_META_PATH
  }
  if (
    process.env.EIDOS_FS_META_PATH &&
    fs.existsSync(process.env.EIDOS_FS_META_PATH)
  ) {
    return process.env.EIDOS_FS_META_PATH
  }

  const siblingRepo = path.resolve(currentDir, "../../../../../sqlite-fs-meta")
  const devBuildPath = path.resolve(siblingRepo, "target/release", binaryName)
  if (fs.existsSync(devBuildPath)) {
    return devBuildPath
  }

  const devDebugPath = path.resolve(siblingRepo, "target/debug", binaryName)
  if (fs.existsSync(devDebugPath)) {
    return devDebugPath
  }

  return null
}
