import type { ExplorerSort } from "../shared/explorer-sort"
export {
  compareExplorerEntries,
  type ExplorerSort,
} from "../shared/explorer-sort"

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
