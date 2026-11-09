import { useEffect, useMemo, useState, useSyncExternalStore } from "react"
import type { SpaceTreeEntry } from "../shared/contracts"
import {
  canSummarizeFile,
  explorerSummaryKind,
  markdownDocumentTitle,
  summarizeFileContent,
} from "./explorer-card-summary"
import type { ExplorerEidosSummary } from "../shared/explorer-summary"

type ReadySummary = {
  status: "ready"
  text: string
  title?: string
  eidos?: ExplorerEidosSummary
}
const summaries = new Map<string, ReadySummary>()
const titleListeners = new Set<() => void>()
let titleRevision = 0
const readTitleRevision = () => titleRevision
const watchTitles = (listener: () => void) => {
  titleListeners.add(listener)
  return () => {
    titleListeners.delete(listener)
  }
}
function summaryKey(spaceId: string, entry: SpaceTreeEntry) {
  return JSON.stringify([
    spaceId,
    entry.relativePath,
    entry.modifiedAtMs,
    entry.size,
  ])
}

/** Use already-read titles for disambiguation; never read offscreen files just to find duplicates. */
export function useExplorerCardLocations(
  spaceId: string,
  entries: readonly SpaceTreeEntry[]
): Map<string, string> {
  const revision = useSyncExternalStore(
    watchTitles,
    readTitleRevision,
    readTitleRevision
  )
  return useMemo(() => {
    const groups = new Map<string, SpaceTreeEntry[]>()
    for (const entry of entries) {
      const title =
        summaries.get(summaryKey(spaceId, entry))?.title || entry.name
      const key = title.normalize("NFC").toLocaleLowerCase()
      const group = groups.get(key) ?? []
      group.push(entry)
      groups.set(key, group)
    }
    const labels = new Map<string, string>()
    for (const group of groups.values()) {
      if (group.length < 2) continue
      const parents = group.map((entry) =>
        entry.relativePath.split("/").slice(0, -1).join("/")
      )
      const shortNames = parents.map(
        (parent) => parent.split("/").at(-1) || "/"
      )
      const countNames = (values: readonly string[]) => {
        const counts = new Map<string, number>()
        for (const value of values)
          counts.set(value, (counts.get(value) ?? 0) + 1)
        return counts
      }
      const parentCounts = countNames(parents)
      const shortCounts = countNames(shortNames)
      group.forEach((entry, index) => {
        const parent = parents[index]!
        const short = shortNames[index]!
        labels.set(
          entry.relativePath,
          parentCounts.get(parent)! > 1
            ? entry.name
            : shortCounts.get(short)! > 1
              ? parent
              : short
        )
      })
    }
    return labels
  }, [spaceId, entries, revision])
}
export type ExplorerCardSummary =
  | { status: "pending" | "unavailable"; text: "" }
  | ReadySummary
const waiting: ExplorerCardSummary = { status: "pending", text: "" }
const unavailable: ExplorerCardSummary = { status: "unavailable", text: "" }
const empty: ExplorerCardSummary = { status: "ready", text: "" }
const pending = new Map<
  string,
  { promise: Promise<ExplorerCardSummary>; readers: Set<() => boolean> }
>()
const queue: (() => void)[] = []
let reading = 0
function requestSummary(
  key: string,
  spaceId: string,
  entry: SpaceTreeEntry,
  isActive: () => boolean
): Promise<ExplorerCardSummary> {
  if (summaries.has(key)) return Promise.resolve(summaries.get(key)!)
  const existing = pending.get(key)
  if (existing) {
    existing.readers.add(isActive)
    return existing.promise
  }
  const readers = new Set([isActive])
  const request = new Promise<ExplorerCardSummary>((resolve) => {
    const run = () => {
      if (![...readers].some((reader) => reader())) {
        pending.delete(key)
        resolve(waiting)
        queueMicrotask(() => queue.shift()?.())
        return
      }
      if (reading >= 3) {
        queue.push(run)
        return
      }
      reading += 1
      void Promise.resolve()
        .then(async (): Promise<ExplorerCardSummary> => {
          if (explorerSummaryKind(entry.name) === "eidos") {
            const eidos = await window.eidosLite.getExplorerEidosSummary({
              spaceId,
              relativePath: entry.relativePath,
              size: entry.size,
              modifiedAtMs: entry.modifiedAtMs,
            })
            return eidos ? { status: "ready", text: "", eidos } : unavailable
          }
          const preview = await window.eidosLite.previewTextFile(
            entry.relativePath
          )
          return preview.type === "text"
            ? {
                status: "ready",
                text: summarizeFileContent(entry.name, preview.content),
                ...(explorerSummaryKind(entry.name) === "markdown"
                  ? { title: markdownDocumentTitle(preview.content) }
                  : {}),
              }
            : unavailable
        })
        .catch(() => unavailable)
        .then((summary) => {
          let titleChanged = false
          if (summary.status === "ready") {
            titleChanged = summaries.get(key)?.title !== summary.title
            summaries.set(key, summary)
          }
          if (summaries.size > 200) {
            const oldest = summaries.keys().next().value!
            titleChanged ||= Boolean(summaries.get(oldest)?.title)
            summaries.delete(oldest)
          }
          if (titleChanged) {
            titleRevision++
            for (const listener of titleListeners) listener()
          }
          pending.delete(key)
          reading -= 1
          resolve(summary)
          queueMicrotask(() => queue.shift()?.())
        })
    }
    run()
  })
  pending.set(key, { promise: request, readers })
  return request
}
export function useExplorerCardSummary(
  spaceId: string,
  entry: SpaceTreeEntry,
  visible: boolean
): ExplorerCardSummary {
  const key = summaryKey(spaceId, entry)
  const [summary, setSummary] = useState({
    key,
    value: summaries.get(key) ?? waiting,
  })
  useEffect(() => {
    if (
      !visible ||
      !canSummarizeFile(entry.name) ||
      (entry.size === 0 && explorerSummaryKind(entry.name) !== "eidos")
    )
      return
    let active = true
    void requestSummary(key, spaceId, entry, () => active).then((value) => {
      if (active) setSummary({ key, value })
    })
    return () => {
      active = false
    }
  }, [key, visible, entry.name, entry.relativePath, entry.size])
  if (!canSummarizeFile(entry.name)) return unavailable
  if (entry.size === 0 && explorerSummaryKind(entry.name) !== "eidos")
    return empty
  return summary.key === key
    ? summary.value
    : summaries.has(key)
      ? summaries.get(key)!
      : waiting
}
