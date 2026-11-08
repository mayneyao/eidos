import type { SpaceTreeEntry } from "../shared/contracts"
import { compareExplorerEntries, type ExplorerSort } from "./explorer-sort"

export type ExplorerLayout = "tree" | "modified"
export const EXPLORER_LAYOUT_STORAGE_KEY = "eidos-lite:explorer-layout"
export function readExplorerLayout(
  storage: Pick<Storage, "getItem">
): ExplorerLayout {
  try {
    return storage.getItem(EXPLORER_LAYOUT_STORAGE_KEY) === "modified"
      ? "modified"
      : "tree"
  } catch {
    return "tree"
  }
}

export interface ModifiedFileGroup {
  id: string
  label: "Today" | "Yesterday" | "Date" | "Earlier"
  date?: Date
  files: SpaceTreeEntry[]
}
function calendarDay(date: Date): number {
  return (
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
  )
}
export function groupExplorerFiles(
  entries: readonly SpaceTreeEntry[],
  sort: ExplorerSort,
  now: Date
): ModifiedFileGroup[] {
  const today = calendarDay(now)
  const fixed: ModifiedFileGroup[] = [
    { id: "today", label: "Today", files: [] },
    { id: "yesterday", label: "Yesterday", files: [] },
  ]
  const dates = new Map<number, ModifiedFileGroup>()
  const earlier: ModifiedFileGroup = {
    id: "earlier",
    label: "Earlier",
    files: [],
  }
  let count = 0
  const visit = (items: readonly SpaceTreeEntry[]) => {
    for (const entry of items) {
      if (entry.kind === "directory") {
        visit(entry.children ?? [])
        continue
      }
      count += 1
      const date = new Date(entry.modifiedAtMs)
      const day = calendarDay(date)
      const days = today - day
      if (days <= 0) fixed[0]!.files.push(entry)
      else if (days === 1) fixed[1]!.files.push(entry)
      else if (!Number.isFinite(day) || days >= 7) earlier.files.push(entry)
      else {
        const key = Number.isFinite(day) ? day : -Infinity
        const group: ModifiedFileGroup = dates.get(key) ?? {
          id: "date:" + key,
          label: Number.isFinite(day) ? "Date" : "Earlier",
          date: Number.isFinite(day) ? date : undefined,
          files: [],
        }
        group.files.push(entry)
        dates.set(key, group)
      }
    }
  }
  visit(entries)
  if (!count) return []
  return [
    ...fixed,
    ...[...dates.entries()].sort(([a], [b]) => b - a).map(([, group]) => group),
    earlier,
  ]
    .filter((group) => group.files.length > 0)
    .map((group) => ({
      ...group,
      files: group.files.sort((a, b) => compareExplorerEntries(a, b, sort)),
    }))
}
export function explorerRecentCutoff(now: Date): number {
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 6
  ).getTime()
}
export function explorerGroupDateLabel(
  group: ModifiedFileGroup,
  now: Date,
  locale: string
): string {
  if (!group.date) return group.label
  const days = calendarDay(now) - calendarDay(group.date)
  return new Intl.DateTimeFormat(
    locale,
    days < 7
      ? { weekday: "long" }
      : {
          month: "short",
          day: "numeric",
          ...(now.getFullYear() !== group.date.getFullYear()
            ? { year: "numeric" }
            : {}),
        }
  ).format(group.date)
}
