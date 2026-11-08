import type { SpaceTreeEntry } from "./contracts"
import {
  normalizeExplorerFileFilter,
  type ExplorerFileFilter,
} from "./explorer-file-filter"
import { compareExplorerEntries, type ExplorerSort } from "./explorer-sort"

export const EXPLORER_EARLIER_PAGE_SIZE = 50
export interface ExplorerFilesQuery {
  directory: string | null
  filter: ExplorerFileFilter
  sort: ExplorerSort
  sinceMs: number
  period: "recent" | "earlier"
  offset: number
}
export interface ExplorerFilesPage {
  entries: SpaceTreeEntry[]
  earlierCount: number
  total: number
  hasMore: boolean
}
export function normalizeExplorerFilesQuery(
  value: unknown
): ExplorerFilesQuery {
  if (!value || typeof value !== "object")
    throw new Error("Invalid Explorer query")
  const query = value as Partial<ExplorerFilesQuery>
  if (
    (query.directory !== null && typeof query.directory !== "string") ||
    typeof query.sinceMs !== "number" ||
    !Number.isFinite(query.sinceMs) ||
    !Number.isFinite(new Date(query.sinceMs).getTime()) ||
    (query.period !== "recent" && query.period !== "earlier") ||
    typeof query.offset !== "number" ||
    !Number.isSafeInteger(query.offset) ||
    query.offset < 0 ||
    !query.sort ||
    !["name", "modified", "type"].includes(query.sort.by) ||
    !["ascending", "descending"].includes(query.sort.direction)
  )
    throw new Error("Invalid Explorer query")
  return {
    directory: query.directory,
    filter: normalizeExplorerFileFilter(query.filter),
    sort: { by: query.sort.by, direction: query.sort.direction },
    sinceMs: query.sinceMs,
    period: query.period,
    offset: query.offset,
  }
}
export function selectExplorerFilesPage(
  entries: readonly SpaceTreeEntry[],
  query: ExplorerFilesQuery
): ExplorerFilesPage {
  const recent: SpaceTreeEntry[] = []
  const earlier: SpaceTreeEntry[] = []
  const visit = (items: readonly SpaceTreeEntry[]) => {
    for (const entry of items) {
      if (entry.kind === "directory") visit(entry.children ?? [])
      else
        (Number.isFinite(entry.modifiedAtMs) &&
        entry.modifiedAtMs >= query.sinceMs
          ? recent
          : earlier
        ).push(entry)
    }
  }
  visit(entries)
  const selected = query.period === "recent" ? recent : earlier
  selected.sort((a, b) => compareExplorerEntries(a, b, query.sort))
  const end =
    query.period === "recent"
      ? selected.length
      : query.offset + EXPLORER_EARLIER_PAGE_SIZE
  return {
    entries: selected.slice(query.period === "recent" ? 0 : query.offset, end),
    earlierCount: earlier.length,
    total: selected.length,
    hasMore: end < selected.length,
  }
}
