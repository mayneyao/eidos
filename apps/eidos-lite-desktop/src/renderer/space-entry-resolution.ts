import type { SpaceSnapshot, SpaceTreeEntry } from "../shared/contracts"

export function findSpaceEntry(
  entries: readonly SpaceTreeEntry[],
  relativePath: string
): SpaceTreeEntry | null {
  for (const entry of entries) {
    if (entry.relativePath === relativePath) return entry
    const nested = entry.children
      ? findSpaceEntry(entry.children, relativePath)
      : null
    if (nested) return nested
  }
  return null
}

export async function resolveSpaceEntry(
  initialSnapshot: SpaceSnapshot,
  relativePath: string,
  loadDirectory: (relativePath: string) => Promise<SpaceSnapshot>,
  refreshSnapshot?: () => Promise<SpaceSnapshot | null>
): Promise<{ snapshot: SpaceSnapshot; entry: SpaceTreeEntry | null }> {
  let snapshot = initialSnapshot
  let directoryPath = ""
  for (const segment of relativePath.split("/").slice(0, -1)) {
    directoryPath = directoryPath ? `${directoryPath}/${segment}` : segment
    const directory = findSpaceEntry(snapshot.entries, directoryPath)
    if (directory?.kind !== "directory") {
      return { snapshot, entry: null }
    }
    if (directory.childrenLoaded) continue
    snapshot = await loadDirectory(directory.relativePath)
  }
  const result = {
    snapshot,
    entry: findSpaceEntry(snapshot.entries, relativePath),
  }
  if (result.entry || !refreshSnapshot) return result
  const refreshed = await refreshSnapshot()
  if (!refreshed) return result
  return resolveSpaceEntry(refreshed, relativePath, loadDirectory)
}
