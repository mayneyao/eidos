import { useEffect, useState } from "react"
import type { SpaceTreeEntry } from "../shared/contracts"
import { canSummarizeFile, summarizeDocument } from "./explorer-card-summary"

const summaries = new Map<string, string>()
const pending = new Map<
  string,
  { promise: Promise<string>; readers: Set<() => boolean> }
>()
const queue: (() => void)[] = []
let reading = 0
function requestSummary(
  key: string,
  path: string,
  isActive: () => boolean
): Promise<string> {
  if (summaries.has(key)) return Promise.resolve(summaries.get(key)!)
  const existing = pending.get(key)
  if (existing) {
    existing.readers.add(isActive)
    return existing.promise
  }
  const readers = new Set([isActive])
  const request = new Promise<string>((resolve) => {
    const run = () => {
      if (![...readers].some((reader) => reader())) {
        pending.delete(key)
        resolve("")
        queueMicrotask(() => queue.shift()?.())
        return
      }
      if (reading >= 3) {
        queue.push(run)
        return
      }
      reading += 1
      void Promise.resolve()
        .then(() => window.eidosLite.previewTextFile(path))
        .then(
          (preview) =>
            preview.type === "text" ? summarizeDocument(preview.content) : "",
          () => ""
        )
        .then((summary) => {
          summaries.set(key, summary)
          if (summaries.size > 200)
            summaries.delete(summaries.keys().next().value!)
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
): string {
  const key = JSON.stringify([
    spaceId,
    entry.relativePath,
    entry.modifiedAtMs,
    entry.size,
  ])
  const [summary, setSummary] = useState({
    key,
    text: summaries.get(key) ?? "",
  })
  useEffect(() => {
    if (!visible || !canSummarizeFile(entry.name)) return
    let active = true
    void requestSummary(key, entry.relativePath, () => active).then((text) => {
      if (active) setSummary({ key, text })
    })
    return () => {
      active = false
    }
  }, [key, visible, entry.name, entry.relativePath])
  return summary.key === key ? summary.text : (summaries.get(key) ?? "")
}
