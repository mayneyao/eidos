import { createHash } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"

import type { SpaceTreeEntry } from "../../shared/contracts"

const HIDDEN_IMPLEMENTATION_NAMES = new Set([".graft"])
const LOCAL_NOISE_NAMES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"])
const PORTABLE_INVALID_NAME = /[<>:"/\\|?*\u0000-\u001f]/

export interface CanonicalSpace {
  id: string
  root: string
  name: string
  displayPath: string
  identity: string
}

function normalizedIdentityPath(value: string): string {
  const normalized = path.normalize(value)
  return process.platform === "win32" ? normalized.toLowerCase() : normalized
}

export async function canonicalizeSpaceRoot(
  requestedPath: string
): Promise<CanonicalSpace> {
  const root = await fs.realpath(path.resolve(requestedPath))
  const stats = await fs.stat(root)
  if (!stats.isDirectory()) throw new Error("A Space must be a folder")
  const identity = `${normalizedIdentityPath(root)}:${stats.dev}:${stats.ino}`
  return {
    id: createHash("sha256").update(identity).digest("hex").slice(0, 24),
    root,
    name: path.basename(root) || root,
    displayPath: root,
    identity,
  }
}

export function normalizeRelativePath(value: string): string {
  if (!value || value.includes("\0") || path.isAbsolute(value)) {
    throw new Error("Path must be a non-empty Space-relative path")
  }
  const native = value.split("/").join(path.sep)
  const normalized = path.normalize(native)
  if (
    normalized === ".." ||
    normalized.startsWith(`..${path.sep}`) ||
    path.isAbsolute(normalized)
  ) {
    throw new Error("Path escapes the Space")
  }
  return normalized.split(path.sep).join("/")
}

export function normalizeMutableRelativePath(value: string): string {
  const normalized = normalizeRelativePath(value)
  if (normalized === ".") throw new Error("The Space root cannot be changed")
  if (
    normalized
      .split("/")
      .some((component) => component.toLowerCase() === ".graft")
  ) {
    throw new Error("The .graft implementation directory is protected")
  }
  return normalized
}

export function normalizeSpaceEntryName(value: string): string {
  const name = value.trim()
  if (!name || name === "." || name === "..") {
    throw new Error("A file or folder name is required")
  }
  if (
    PORTABLE_INVALID_NAME.test(name) ||
    name.endsWith(".") ||
    name.endsWith(" ")
  ) {
    throw new Error("The name contains characters unsupported by a Space")
  }
  if (name.toLowerCase() === ".graft") {
    throw new Error("The .graft implementation directory is protected")
  }
  return name
}

export function joinSpaceRelativePath(
  parentRelativePath: string | null,
  name: string
): string {
  const safeName = normalizeSpaceEntryName(name)
  return parentRelativePath
    ? `${normalizeMutableRelativePath(parentRelativePath)}/${safeName}`
    : safeName
}

export async function resolveSpaceDirectory(
  root: string,
  relativePath: string | null
): Promise<string> {
  const candidate = relativePath
    ? resolveSpacePath(root, normalizeMutableRelativePath(relativePath))
    : root
  const resolved = await fs.realpath(candidate)
  if (path.resolve(candidate) !== resolved) {
    throw new Error("A symlink cannot be used as a Space target folder")
  }
  const relative = path.relative(root, resolved)
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Directory symlink escapes the Space")
  }
  if (!(await fs.stat(resolved)).isDirectory()) {
    throw new Error("The target must be a Space folder")
  }
  return resolved
}

export function resolveSpacePath(root: string, relativePath: string): string {
  const normalized = normalizeRelativePath(relativePath)
  const candidate = path.resolve(root, ...normalized.split("/"))
  const relative = path.relative(root, candidate)
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error("Path escapes the Space")
  }
  return candidate
}

function isHiddenImplementationEntry(name: string): boolean {
  return HIDDEN_IMPLEMENTATION_NAMES.has(name) || LOCAL_NOISE_NAMES.has(name)
}

function entryKind(
  name: string,
  stats: Awaited<ReturnType<typeof fs.lstat>>
): SpaceTreeEntry["kind"] {
  if (stats.isSymbolicLink()) return "symlink"
  if (stats.isDirectory()) return "directory"
  if (path.extname(name).toLowerCase() === ".eidos") return "eidos"
  return "file"
}

export async function listSpaceTree(
  root: string,
  options: { maxEntries?: number } = {}
): Promise<SpaceTreeEntry[]> {
  const maxEntries = options.maxEntries ?? 100_000
  let seen = 0

  const visit = async (
    absoluteDirectory: string
  ): Promise<SpaceTreeEntry[]> => {
    const directoryEntries = await fs.readdir(absoluteDirectory, {
      withFileTypes: true,
    })
    const visible = directoryEntries.filter(
      (entry) => !isHiddenImplementationEntry(entry.name)
    )
    const resolved = await Promise.all(
      visible.map(async (entry): Promise<SpaceTreeEntry> => {
        seen += 1
        if (seen > maxEntries) {
          throw new Error(
            `Space contains more than ${maxEntries} visible entries`
          )
        }
        const absolutePath = path.join(absoluteDirectory, entry.name)
        const stats = await fs.lstat(absolutePath)
        const relativePath = path
          .relative(root, absolutePath)
          .split(path.sep)
          .join("/")
        const kind = entryKind(entry.name, stats)
        return {
          name: entry.name,
          relativePath,
          kind,
          size: stats.size,
          modifiedAtMs: stats.mtimeMs,
          ...(kind === "directory"
            ? { children: await visit(absolutePath) }
            : {}),
        }
      })
    )
    return resolved.sort((left, right) => {
      if (left.kind === "directory" && right.kind !== "directory") return -1
      if (right.kind === "directory" && left.kind !== "directory") return 1
      return left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    })
  }

  return visit(root)
}

export function flattenSpaceTree(
  entries: readonly SpaceTreeEntry[]
): SpaceTreeEntry[] {
  return entries.flatMap((entry) => [
    entry,
    ...(entry.children ? flattenSpaceTree(entry.children) : []),
  ])
}
