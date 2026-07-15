import { lstat, mkdir, realpath, stat } from "node:fs/promises"
import path from "node:path"

interface DirectoryIdentity {
  dev: number
  ino: number
}

export interface ExtensionProjectPaths {
  spaceRoot: string
  eidosRoot?: string
  extensionsRoot?: string
  extensionsIdentity?: DirectoryIdentity
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  )
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  )
}

async function canonicalSpaceRoot(spacePath: string): Promise<string> {
  const resolved = path.resolve(spacePath)
  const canonical = await realpath(resolved)
  const stats = await stat(canonical)
  if (!stats.isDirectory()) throw new Error("Space root must be a directory")
  return canonical
}

async function realChildDirectory(
  spaceRoot: string,
  parent: string,
  name: string,
  create: boolean,
  mode: number
): Promise<string | undefined> {
  const candidate = path.join(parent, name)
  let stats
  try {
    stats = await lstat(candidate)
  } catch (error) {
    if (!isMissing(error)) throw error
    if (!create) return undefined
    try {
      await mkdir(candidate, { mode })
    } catch (mkdirError) {
      if (
        !(
          mkdirError instanceof Error &&
          "code" in mkdirError &&
          (mkdirError as NodeJS.ErrnoException).code === "EEXIST"
        )
      ) {
        throw mkdirError
      }
    }
    stats = await lstat(candidate)
  }

  if (stats.isSymbolicLink()) {
    throw new Error(`Extension path cannot use a symbolic link: ${name}`)
  }
  if (!stats.isDirectory()) {
    throw new Error(`Extension path must be a directory: ${name}`)
  }
  const canonical = await realpath(candidate)
  if (!isWithinRoot(spaceRoot, canonical)) {
    throw new Error("Extension path resolves outside its Space")
  }
  return canonical
}

export async function resolveExtensionProjectPaths(
  spacePath: string,
  create = false
): Promise<ExtensionProjectPaths> {
  const spaceRoot = await canonicalSpaceRoot(spacePath)
  const eidosRoot = await realChildDirectory(
    spaceRoot,
    spaceRoot,
    ".eidos",
    create,
    0o700
  )
  if (!eidosRoot) return { spaceRoot }
  const extensionsRoot = await realChildDirectory(
    spaceRoot,
    eidosRoot,
    "extensions",
    create,
    0o700
  )
  if (!extensionsRoot) return { spaceRoot, eidosRoot }
  const stats = await stat(extensionsRoot)
  return {
    spaceRoot,
    eidosRoot,
    extensionsRoot,
    extensionsIdentity: { dev: stats.dev, ino: stats.ino },
  }
}

export async function ensureExtensionStagingRoot(
  paths: Required<ExtensionProjectPaths>
): Promise<string> {
  let current = paths.eidosRoot
  for (const name of ["cache", "extensions", "staging"]) {
    current = (await realChildDirectory(
      paths.spaceRoot,
      current,
      name,
      true,
      0o700
    ))!
  }
  return current
}

export async function ensureExtensionStateDatabasePath(
  spacePath: string
): Promise<string> {
  const paths = await resolveExtensionProjectPaths(spacePath, true)
  if (!paths.eidosRoot) {
    throw new Error("Unable to prepare the extension state directory")
  }
  const stateRoot = await realChildDirectory(
    paths.spaceRoot,
    paths.eidosRoot,
    "state",
    true,
    0o700
  )
  if (!stateRoot) {
    throw new Error("Unable to prepare the extension state directory")
  }
  const databasePath = path.join(stateRoot, "extensions.sqlite3")
  try {
    const stats = await lstat(databasePath)
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error("Extension state path must be a regular file")
    }
    const canonical = await realpath(databasePath)
    if (!isWithinRoot(paths.spaceRoot, canonical)) {
      throw new Error("Extension state path resolves outside its Space")
    }
  } catch (error) {
    if (!isMissing(error)) throw error
  }
  return databasePath
}

export async function extensionRootIsUnchanged(
  spacePath: string,
  expected: Required<ExtensionProjectPaths>
): Promise<boolean> {
  const current = await resolveExtensionProjectPaths(spacePath)
  return (
    current.extensionsRoot === expected.extensionsRoot &&
    current.extensionsIdentity?.dev === expected.extensionsIdentity.dev &&
    current.extensionsIdentity?.ino === expected.extensionsIdentity.ino
  )
}
