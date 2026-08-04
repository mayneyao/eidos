import type { SpaceEntryKind, SpaceTreeEntry } from "../shared/contracts"

export type RecentFileKind = Exclude<SpaceEntryKind, "directory">

export interface RecentFileEntry {
  relativePath: string
  name: string
  kind: RecentFileKind
}

export const RECENT_FILE_LIMIT = 6

const RECENT_FILES_STORAGE_PREFIX = "eidos-lite:recent-files:"

type RecentFileStorage = Pick<Storage, "getItem" | "setItem">

export function recentFilesStorageKey(spaceId: string): string {
  return `${RECENT_FILES_STORAGE_PREFIX}${encodeURIComponent(spaceId)}`
}

function isRecentFileKind(value: unknown): value is RecentFileKind {
  return value === "eidos" || value === "file" || value === "symlink"
}

export function parseRecentFiles(value: string | null): RecentFileEntry[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    const paths = new Set<string>()
    return parsed
      .flatMap((candidate) => {
        if (
          !candidate ||
          typeof candidate !== "object" ||
          typeof candidate.relativePath !== "string" ||
          !candidate.relativePath ||
          typeof candidate.name !== "string" ||
          !candidate.name ||
          !isRecentFileKind(candidate.kind) ||
          paths.has(candidate.relativePath)
        ) {
          return []
        }
        paths.add(candidate.relativePath)
        return [
          {
            relativePath: candidate.relativePath,
            name: candidate.name,
            kind: candidate.kind,
          },
        ]
      })
      .slice(0, RECENT_FILE_LIMIT)
  } catch {
    return []
  }
}

export function loadRecentFiles(
  storage: RecentFileStorage,
  spaceId: string
): RecentFileEntry[] {
  try {
    return parseRecentFiles(storage.getItem(recentFilesStorageKey(spaceId)))
  } catch {
    return []
  }
}

export function storeRecentFiles(
  storage: RecentFileStorage,
  spaceId: string,
  files: readonly RecentFileEntry[]
): void {
  try {
    storage.setItem(
      recentFilesStorageKey(spaceId),
      JSON.stringify(files.slice(0, RECENT_FILE_LIMIT))
    )
  } catch {
    // Recent files are a convenience; opening files must still work without storage.
  }
}

export function rememberRecentFile(
  files: readonly RecentFileEntry[],
  entry: SpaceTreeEntry
): RecentFileEntry[] {
  if (entry.kind === "directory") return [...files]
  return [
    {
      relativePath: entry.relativePath,
      name: entry.name,
      kind: entry.kind,
    },
    ...files.filter((file) => file.relativePath !== entry.relativePath),
  ].slice(0, RECENT_FILE_LIMIT)
}

function fileName(relativePath: string): string {
  return relativePath.split("/").at(-1) ?? relativePath
}

export function remapRecentFiles(
  files: readonly RecentFileEntry[],
  sourcePath: string,
  destinationPath: string | null
): RecentFileEntry[] {
  return files.flatMap((file) => {
    if (
      file.relativePath !== sourcePath &&
      !file.relativePath.startsWith(`${sourcePath}/`)
    ) {
      return [file]
    }
    if (destinationPath === null) return []
    const relativePath = `${destinationPath}${file.relativePath.slice(sourcePath.length)}`
    return [{ ...file, relativePath, name: fileName(relativePath) }]
  })
}
