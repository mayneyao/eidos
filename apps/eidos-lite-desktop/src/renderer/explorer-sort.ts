import type { SpaceTreeEntry } from "../shared/contracts"

export interface ExplorerSort {
  by: "name" | "modified" | "type"
  direction: "ascending" | "descending"
}

export const DEFAULT_EXPLORER_SORT: ExplorerSort = {
  by: "name",
  direction: "ascending",
}
export const EXPLORER_SORT_STORAGE_KEY = "eidos-lite:explorer-sort"

export function readExplorerSort(
  storage: Pick<Storage, "getItem">
): ExplorerSort {
  try {
    const value: unknown = JSON.parse(
      storage.getItem(EXPLORER_SORT_STORAGE_KEY) ?? "null"
    )
    if (
      value &&
      typeof value === "object" &&
      "by" in value &&
      "direction" in value &&
      (value.by === "name" || value.by === "modified" || value.by === "type") &&
      (value.direction === "ascending" || value.direction === "descending")
    ) {
      return { by: value.by, direction: value.direction }
    }
  } catch {
    /* An unavailable or invalid preference uses the default. */
  }
  return DEFAULT_EXPLORER_SORT
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
