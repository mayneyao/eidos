import type { SpaceTreeEntry } from "../shared/contracts"

/** Basename containment only; paths and file contents are not search targets. */
export function filterExplorerNames(
  entries: SpaceTreeEntry[],
  query: string
): SpaceTreeEntry[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return entries
  return entries.flatMap((entry) => {
    if (entry.name.toLowerCase().includes(needle)) return [entry]
    if (entry.kind !== "directory") return []
    const children = filterExplorerNames(entry.children ?? [], needle)
    return children.length ? [{ ...entry, children }] : []
  })
}
