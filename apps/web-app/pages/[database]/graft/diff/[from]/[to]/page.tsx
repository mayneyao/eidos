"use client"

import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useEidos } from "@eidos.space/react"
import { CodeIcon, LoaderIcon } from "lucide-react"
import { useEffect, useState } from "react"

import { useNodeMap } from "@/apps/web-app/hooks/use-current-node"
import { ChangesView } from "@/apps/web-app/pages/[database]/graft/commit/[lsn]/page"
import { useTabTitle } from "@/hooks/use-tab-title"

const WORKTREE_DIFF_TARGET = "WORKTREE"

function formatRevLabel(value: string | undefined) {
  if (!value) return ""
  return value.toUpperCase() === WORKTREE_DIFF_TARGET
    ? "Worktree"
    : value.slice(0, 12)
}

export default function GraftDiffPage() {
  const { params, navigate, searchParams } = useRouterAdapter()
  const eidos = useEidos()
  const from = params.from
  const to = params.to
  const focusedTable = searchParams?.get("table") ?? undefined
  const isWorktreeDiff = to?.toUpperCase() === WORKTREE_DIFF_TARGET
  const fromLabel = formatRevLabel(from)
  const toLabel = formatRevLabel(to)
  const [diff, setDiff] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const nodeMap = useNodeMap()

  useTabTitle(`Diff ${fromLabel} -> ${toLabel}`)

  useEffect(() => {
    if (!from || (!to && !isWorktreeDiff)) return

    let cancelled = false
    setLoading(true)
    setError(null)

    eidos.currentSpace.graft
      .diff(from, isWorktreeDiff ? undefined : to, "rows")
      .then((res: any) => {
        if (!cancelled) setDiff(res)
      })
      .catch((e: any) => {
        if (!cancelled) setError(String(e.message ?? e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [from, to, isWorktreeDiff, eidos.currentSpace])

  return (
    <div className="mx-auto flex h-full w-full flex-col px-6 py-6">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <CodeIcon className="h-5 w-5" />
          Diff {fromLabel} -&gt; {toLabel}
        </h1>
      </div>

      <div className="flex-1 overflow-hidden">
        {loading ? (
          <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
            <LoaderIcon className="h-4 w-4 animate-spin" />
            Loading diff...
          </div>
        ) : (
          <ChangesView
            diff={diff}
            diffError={error}
            nodeMap={nodeMap}
            initialTable={focusedTable}
            emptyMessage={
              isWorktreeDiff
                ? "No uncommitted changes."
                : "No changes between these commits."
            }
            fileFallbackMessage={
              isWorktreeDiff
                ? "SQLite row-level details were not returned for these uncommitted changes."
                : "SQLite row-level details were not returned for this commit range."
            }
          />
        )}
      </div>
    </div>
  )
}
