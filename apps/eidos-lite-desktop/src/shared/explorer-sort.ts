import type { SpaceTreeEntry } from "./contracts"

export interface ExplorerSort {
  by: "name" | "modified" | "type"
  direction: "ascending" | "descending"
}

const names = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})
function extension(name: string): string {
  const dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(dot + 1) : ""
}

export function compareExplorerEntries(
  left: Pick<SpaceTreeEntry, "name" | "kind" | "modifiedAtMs" | "relativePath">,
  right: Pick<
    SpaceTreeEntry,
    "name" | "kind" | "modifiedAtMs" | "relativePath"
  >,
  sort: ExplorerSort
): number {
  if ((left.kind === "directory") !== (right.kind === "directory"))
    return left.kind === "directory" ? -1 : 1
  const primary =
    sort.by === "modified"
      ? left.modifiedAtMs - right.modifiedAtMs
      : sort.by === "type" && left.kind !== "directory"
        ? names.compare(extension(left.name), extension(right.name))
        : 0
  const compared =
    primary ||
    names.compare(left.name, right.name) ||
    left.relativePath.localeCompare(right.relativePath)
  return sort.direction === "descending" ? -compared : compared
}
