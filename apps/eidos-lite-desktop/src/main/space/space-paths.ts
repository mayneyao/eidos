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

export function isHiddenImplementationEntry(name: string): boolean {
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

export async function listSpaceDirectory(
  root: string,
  relativeDirectory: string | null,
  options: {
    maxEntries?: number
    ignoredPaths?(
      relativePaths: readonly string[]
    ): Promise<ReadonlySet<string>>
  } = {}
): Promise<SpaceTreeEntry[]> {
  const canonicalRoot = await fs.realpath(root)
  const absoluteDirectory = await resolveSpaceDirectory(
    canonicalRoot,
    relativeDirectory
  )
  const directoryEntries = (
    await fs.readdir(absoluteDirectory, { withFileTypes: true })
  ).filter((entry) => !isHiddenImplementationEntry(entry.name))
  const maxEntries = options.maxEntries ?? 100_000
  if (directoryEntries.length > maxEntries) {
    throw new Error(
      `Space directory contains more than ${maxEntries} visible entries`
    )
  }
  const candidates = directoryEntries.map((entry) => {
    const absolutePath = path.join(absoluteDirectory, entry.name)
    return {
      entry,
      absolutePath,
      relativePath: path
        .relative(canonicalRoot, absolutePath)
        .split(path.sep)
        .join("/"),
    }
  })
  const ignored = new Set<string>()
  if (options.ignoredPaths) {
    for (let offset = 0; offset < candidates.length; offset += 1_000) {
      const page = candidates
        .slice(offset, offset + 1_000)
        .map((candidate) => candidate.relativePath)
      for (const relativePath of await options.ignoredPaths(page)) {
        ignored.add(relativePath)
      }
    }
  }
  const visible = candidates.filter(
    (candidate) => !ignored.has(candidate.relativePath)
  )
  const result: SpaceTreeEntry[] = []
  for (let offset = 0; offset < visible.length; offset += 256) {
    const resolved = await Promise.all(
      visible.slice(offset, offset + 256).map(async (candidate) => ({
        candidate,
        stats: await fs.lstat(candidate.absolutePath),
      }))
    )
    for (const { candidate, stats } of resolved) {
      const kind = entryKind(candidate.entry.name, stats)
      result.push({
        name: candidate.entry.name,
        relativePath: candidate.relativePath,
        kind,
        size: stats.size,
        modifiedAtMs: stats.mtimeMs,
        ...(kind === "directory"
          ? { children: [], childrenLoaded: false }
          : {}),
      })
    }
  }
  return result.sort((left, right) => {
    if (left.kind === "directory" && right.kind !== "directory") return -1
    if (right.kind === "directory" && left.kind !== "directory") return 1
    return left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  })
}

export async function listSpaceTree(
  root: string,
  options: {
    maxEntries?: number
    ignoredPaths?(
      relativePaths: readonly string[]
    ): Promise<ReadonlySet<string>>
  } = {}
): Promise<SpaceTreeEntry[]> {
  const maxEntries = options.maxEntries ?? 100_000
  let seen = 0
  const result: SpaceTreeEntry[] = []
  let directories: Array<{
    absolutePath: string
    children: SpaceTreeEntry[]
  }> = [{ absolutePath: root, children: result }]

  while (directories.length > 0) {
    const directoryPages = await Promise.all(
      directories.map(async (directory) => ({
        directory,
        entries: await fs.readdir(directory.absolutePath, {
          withFileTypes: true,
        }),
      }))
    )
    const candidates = directoryPages.flatMap(({ directory, entries }) =>
      entries
        .filter((entry) => !isHiddenImplementationEntry(entry.name))
        .map((entry) => {
          const absolutePath = path.join(directory.absolutePath, entry.name)
          return {
            parent: directory.children,
            entry,
            absolutePath,
            relativePath: path
              .relative(root, absolutePath)
              .split(path.sep)
              .join("/"),
          }
        })
    )
    const ignored = options.ignoredPaths
      ? await options.ignoredPaths(
          candidates.map((candidate) => candidate.relativePath)
        )
      : new Set<string>()
    const visible = candidates.filter(
      (candidate) => !ignored.has(candidate.relativePath)
    )
    const nextDirectories: typeof directories = []

    for (let offset = 0; offset < visible.length; offset += 256) {
      const resolved = await Promise.all(
        visible.slice(offset, offset + 256).map(async (candidate) => ({
          candidate,
          stats: await fs.lstat(candidate.absolutePath),
        }))
      )
      for (const { candidate, stats } of resolved) {
        seen += 1
        if (seen > maxEntries) {
          throw new Error(
            `Space contains more than ${maxEntries} visible entries`
          )
        }
        const kind = entryKind(candidate.entry.name, stats)
        const treeEntry: SpaceTreeEntry = {
          name: candidate.entry.name,
          relativePath: candidate.relativePath,
          kind,
          size: stats.size,
          modifiedAtMs: stats.mtimeMs,
          ...(kind === "directory" ? { children: [] } : {}),
        }
        candidate.parent.push(treeEntry)
        if (kind === "directory") {
          nextDirectories.push({
            absolutePath: candidate.absolutePath,
            children: treeEntry.children!,
          })
        }
      }
    }
    directories = nextDirectories
  }

  const sortEntries = (entries: SpaceTreeEntry[]): void => {
    entries.sort((left, right) => {
      if (left.kind === "directory" && right.kind !== "directory") return -1
      if (right.kind === "directory" && left.kind !== "directory") return 1
      return left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    })
    for (const entry of entries) {
      if (entry.children) sortEntries(entry.children)
    }
  }
  sortEntries(result)
  return result
}

export function flattenSpaceTree(
  entries: readonly SpaceTreeEntry[]
): SpaceTreeEntry[] {
  return entries.flatMap((entry) => [
    entry,
    ...(entry.children ? flattenSpaceTree(entry.children) : []),
  ])
}
