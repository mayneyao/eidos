import type { SpaceFileEntry } from "@eidos.space/file-space"

export async function refreshExpandedDirectoryTree(
  rootPath: string,
  expandedPaths: ReadonlySet<string>,
  loadDirectory: (path: string) => Promise<SpaceFileEntry[]>
): Promise<void> {
  const pending = [rootPath]
  const visited = new Set<string>()
  while (pending.length > 0) {
    const directory = pending.shift() ?? ""
    if (visited.has(directory)) continue
    visited.add(directory)

    const entries = await loadDirectory(directory)
    for (const entry of entries) {
      if (
        entry.kind === "directory" &&
        expandedPaths.has(entry.path) &&
        !visited.has(entry.path)
      ) {
        pending.push(entry.path)
      }
    }
  }
}
