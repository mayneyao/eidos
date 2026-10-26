import { useEffect, useState } from "react"
import type { SpaceTreeEntry } from "../shared/contracts"
import {
  filterExplorerEntries,
  countExplorerFilterRules,
  isExplorerFilterGroup,
  explorerFilterSignature,
  hasExplorerPropertyFilter,
  type ExplorerFileFilter,
} from "./explorer-file-filter"

function treeSignature(entries: SpaceTreeEntry[]): string {
  return entries
    .map(
      (entry) =>
        `${entry.relativePath}:${entry.modifiedAtMs}:${entry.size}[${treeSignature(entry.children ?? [])}]`
    )
    .join("\n")
}

export function useExplorerFileFilter(
  spaceId: string,
  directory: string | null,
  filter: ExplorerFileFilter,
  entries: SpaceTreeEntry[],
  changes?: readonly string[]
) {
  const active = countExplorerFilterRules(filter) > 0
  const context = JSON.stringify([spaceId, directory])
  const properties = hasExplorerPropertyFilter(filter)
  const [retryToken, setRetryToken] = useState(0)
  const scope = JSON.stringify([
    spaceId,
    directory,
    explorerFilterSignature(filter),
  ])
  const key = JSON.stringify([scope, treeSignature(entries), retryToken])
  const [result, setResult] = useState<{
    key: string
    scope: string
    context: string
    entries: SpaceTreeEntry[]
    error?: string
  } | null>(null)
  useEffect(() => {
    if (!active || !spaceId) return
    let cancelled = false
    const request = () =>
      void window.eidosLite.filterSpaceFiles(filter, directory).then(
        (next) => {
          if (!cancelled) setResult({ key, scope, context, entries: next })
        },
        (cause: unknown) => {
          if (!cancelled)
            setResult((previous) => ({
              key,
              scope,
              context,
              entries:
                previous?.context === context &&
                (properties || previous.scope === scope)
                  ? previous.entries
                  : properties
                    ? entries
                    : filterExplorerEntries(entries, filter),
              error: cause instanceof Error ? cause.message : String(cause),
            }))
        }
      )
    // Keep local matches immediate while coalescing typing before a full scan.
    const timer = isExplorerFilterGroup(filter)
      ? window.setTimeout(request, 120)
      : undefined
    if (timer === undefined) request()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [key, scope, directory, spaceId, changes])
  return {
    entries: !active
      ? entries
      : result?.scope === scope
        ? result.entries
        : properties
          ? result?.context === context
            ? result.entries
            : entries
          : filterExplorerEntries(entries, filter),
    loading: active && result?.key !== key,
    error: active && result?.key === key ? result.error : undefined,
    retry: () => setRetryToken((value) => value + 1),
  }
}
