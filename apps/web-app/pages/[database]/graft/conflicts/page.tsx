"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useEidos } from "@eidos.space/react"
import type {
  GraftConflictArtifact,
  GraftConflictListResult,
  GraftConflictResolveTarget,
  GraftConflictResolution,
} from "@eidos.space/sync"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Database,
  FileDiff,
  GitMerge,
  LoaderIcon,
  RefreshCw,
  Rows3,
  Undo2,
} from "lucide-react"

import { useNodeMap } from "@/apps/web-app/hooks/use-current-node"
import { ChangesView } from "@/apps/web-app/pages/[database]/graft/commit/[lsn]/page"
import {
  DiffDataGrid,
  type DiffGridRow,
} from "@/components/table/diff-data-grid"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTabTitle } from "@/hooks/use-tab-title"
import { getTableIdByRawTableName } from "@/lib/utils"

type ConflictGroup = {
  path: string
  items: GraftConflictArtifact[]
}

type ConflictSummary = {
  rows: number
  schemas: number
  opaque: number
  files: number
}

type RowConflictTableGroup = {
  table: string
  label: string
  artifacts: GraftConflictArtifact[]
  columns: string[]
}

type ResolveConflict = (
  resolution: GraftConflictResolution,
  path: string,
  target?: GraftConflictResolveTarget
) => Promise<void> | void

type ResolveRowConflicts = (
  resolution: Exclude<GraftConflictResolution, "manual">,
  path: string,
  artifacts: GraftConflictArtifact[]
) => Promise<void> | void

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function resolveTableName(
  rawName: string | undefined,
  nodeMap: Record<string, any>
): string {
  if (!rawName) return "row"
  if (!rawName.startsWith("tb_") && !rawName.startsWith("vw_")) return rawName
  const id = getTableIdByRawTableName(rawName)
  return nodeMap[id]?.name ?? rawName
}

function groupConflictArtifacts(
  artifacts: GraftConflictArtifact[]
): ConflictGroup[] {
  const grouped = new Map<string, GraftConflictArtifact[]>()
  for (const artifact of artifacts) {
    const path = artifact.path || "db.sqlite3"
    grouped.set(path, [...(grouped.get(path) ?? []), artifact])
  }
  return Array.from(grouped.entries()).map(([path, items]) => ({ path, items }))
}

function summarizeConflicts(items: GraftConflictArtifact[]): ConflictSummary {
  return items.reduce(
    (summary, item) => {
      if (item.kind === "row") summary.rows += 1
      else if (item.kind === "schema") summary.schemas += 1
      else if (item.kind === "opaque") summary.opaque += 1
      else summary.files += 1
      return summary
    },
    { rows: 0, schemas: 0, opaque: 0, files: 0 }
  )
}

function summaryParts(summary: ConflictSummary) {
  return [
    summary.rows > 0 ? `${summary.rows} row` : "",
    summary.schemas > 0 ? `${summary.schemas} schema` : "",
    summary.opaque > 0 ? `${summary.opaque} opaque` : "",
    summary.files > 0 ? `${summary.files} file` : "",
  ].filter(Boolean)
}

function isConflictResolved(artifact: GraftConflictArtifact) {
  return artifact.status === "resolved"
}

function artifactRowKey(artifact: GraftConflictArtifact) {
  return `${artifact.table ?? ""}:${artifact.rowid ?? (artifact.key ? JSON.stringify(artifact.key) : "")}`
}

function conflictArtifactColumns(artifact: GraftConflictArtifact) {
  if (artifact.columns?.length) return artifact.columns
  const maxLength = Math.max(
    Array.isArray(artifact.baseRow) ? artifact.baseRow.length : 0,
    Array.isArray(artifact.oursRow) ? artifact.oursRow.length : 0,
    Array.isArray(artifact.theirsRow) ? artifact.theirsRow.length : 0
  )
  return Array.from({ length: maxLength }, (_, index) => `#${index}`)
}

function groupRowConflictsByTable(
  artifacts: GraftConflictArtifact[],
  nodeMap: Record<string, any>
): RowConflictTableGroup[] {
  const grouped = new Map<string, GraftConflictArtifact[]>()
  for (const artifact of artifacts) {
    if (artifact.kind !== "row") continue
    const table = artifact.table || "unknown"
    grouped.set(table, [...(grouped.get(table) ?? []), artifact])
  }
  return Array.from(grouped.entries()).map(([table, items]) => {
    const columns = Array.from(
      new Set(items.flatMap((artifact) => conflictArtifactColumns(artifact)))
    )
    return {
      table,
      label: resolveTableName(table, nodeMap),
      artifacts: items,
      columns,
    }
  })
}

function rowConflictToDiffGridRow(
  artifact: GraftConflictArtifact
): DiffGridRow {
  return {
    id: artifactRowKey(artifact),
    table: artifact.table,
    rowid: artifact.rowid,
    key: artifact.key,
    op: "update",
    columns: conflictArtifactColumns(artifact),
    before: artifact.oursRow ?? [],
    after: artifact.theirsRow ?? [],
    status: artifact.status,
    resolution: artifact.resolution,
  }
}

function getResolutionLabel(resolution: GraftConflictResolution) {
  if (resolution === "ours") return "Keep ours"
  if (resolution === "theirs") return "Take theirs"
  return "Use current"
}

function getResolutionDescription(resolution: GraftConflictResolution) {
  if (resolution === "ours") return "Keep the local file state."
  if (resolution === "theirs") return "Accept the incoming file state."
  return "Mark the edited worktree as resolved."
}

export default function GraftConflictsPage() {
  const eidos = useEidos()
  const nodeMap = useNodeMap()
  const [status, setStatus] = useState<any>(null)
  const [conflictResult, setConflictResult] =
    useState<GraftConflictListResult | null>(null)
  const [diff, setDiff] = useState<any>(null)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [resolving, setResolving] = useState<string | null>(null)
  const [isCompleting, setIsCompleting] = useState(false)
  const [isAborting, setIsAborting] = useState(false)
  const [mergeMessage, setMergeMessage] = useState("Merge remote changes")
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  useTabTitle("Merge conflicts")

  const groups = useMemo(
    () => groupConflictArtifacts(conflictResult?.conflicts ?? []),
    [conflictResult]
  )
  const selectedGroup =
    groups.find((group) => group.path === selectedPath) ?? groups[0] ?? null
  const unresolvedConflicts = (conflictResult?.conflicts ?? []).filter(
    (artifact) => !isConflictResolved(artifact)
  )
  const conflictCount = unresolvedConflicts.length
  const canCompleteMerge =
    Boolean(status?.canCompleteMerge) || conflictCount === 0

  const load = useCallback(async () => {
    setError(null)
    setDiffError(null)
    const [statusRes, conflictsRes, diffRes] = await Promise.all([
      eidos.currentSpace.graft.status(),
      eidos.currentSpace.graft.conflicts() as Promise<GraftConflictListResult>,
      eidos.currentSpace.graft.diff("HEAD", undefined, "rows").catch((e) => {
        setDiffError(getErrorMessage(e))
        return null
      }),
    ])
    setStatus(statusRes)
    setConflictResult(conflictsRes)
    setDiff(diffRes)
    setSelectedPath((current) => {
      const nextGroups = groupConflictArtifacts(conflictsRes.conflicts)
      if (current && nextGroups.some((group) => group.path === current)) {
        return current
      }
      return nextGroups[0]?.path ?? null
    })
  }, [eidos.currentSpace])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    load()
      .catch((e) => {
        if (!cancelled) setError(getErrorMessage(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [load])

  const refresh = async () => {
    setRefreshing(true)
    try {
      await load()
    } catch (e) {
      setError(getErrorMessage(e))
    } finally {
      setRefreshing(false)
    }
  }

  const resolvePath = async (
    resolution: GraftConflictResolution,
    path: string,
    target?: GraftConflictResolveTarget
  ) => {
    const targetKey = target?.table
      ? `${target.table}:${target.rowid ?? (target.key ? JSON.stringify(target.key) : "")}`
      : "file"
    setResolving(
      targetKey === "file"
        ? `${resolution}:${path}:file`
        : `${resolution}:${targetKey}`
    )
    try {
      await eidos.currentSpace.graft.resolveConflict(resolution, path, target)
      await load()
    } catch (e) {
      eidos.currentSpace.notify({
        title: "Failed to resolve conflict",
        description: getErrorMessage(e),
      })
    } finally {
      setResolving(null)
    }
  }

  const resolveRows = async (
    resolution: Exclude<GraftConflictResolution, "manual">,
    path: string,
    artifacts: GraftConflictArtifact[]
  ) => {
    const targets = artifacts.filter(
      (artifact) =>
        artifact.kind === "row" &&
        !isConflictResolved(artifact) &&
        artifact.table &&
        (artifact.rowid != null || artifact.key != null)
    )
    if (targets.length === 0) return

    const table = targets[0]?.table ?? "rows"
    setResolving(`${resolution}:${path}:${table}:rows`)
    try {
      for (const artifact of targets) {
        await eidos.currentSpace.graft.resolveConflict(
          resolution,
          path,
          artifact.rowid != null
            ? { table: artifact.table, rowid: Number(artifact.rowid) }
            : { table: artifact.table, key: artifact.key }
        )
      }
      await load()
    } catch (e) {
      eidos.currentSpace.notify({
        title: "Failed to resolve conflicts",
        description: getErrorMessage(e),
      })
    } finally {
      setResolving(null)
    }
  }

  const completeMerge = async () => {
    setIsCompleting(true)
    try {
      await eidos.currentSpace.graft.completeMerge(
        mergeMessage.trim() || "Merge remote changes"
      )
      eidos.currentSpace.notify({
        title: "Merge completed",
        description: "Remote changes are now part of this space history.",
      })
      await load().catch(() => undefined)
    } catch (e) {
      eidos.currentSpace.notify({
        title: "Failed to complete merge",
        description: getErrorMessage(e),
      })
    } finally {
      setIsCompleting(false)
    }
  }

  const abortMerge = async () => {
    setIsAborting(true)
    try {
      await eidos.currentSpace.graft.abortMerge()
      eidos.currentSpace.notify({
        title: "Merge aborted",
        description: "The space is back at the local branch state.",
      })
      await load().catch(() => undefined)
    } catch (e) {
      eidos.currentSpace.notify({
        title: "Failed to abort merge",
        description: getErrorMessage(e),
      })
    } finally {
      setIsAborting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoaderIcon className="h-4 w-4 animate-spin" />
        Loading merge conflicts...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-4 py-12 text-sm text-destructive">
        {error}
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full w-full flex-col px-6 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {canCompleteMerge ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            )}
            <h1 className="text-lg font-semibold tracking-tight">
              {canCompleteMerge ? "Merge ready" : "Resolve merge"}
            </h1>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              {conflictCount > 0
                ? `${conflictCount} conflict${conflictCount === 1 ? "" : "s"}`
                : "No unresolved conflicts"}
            </span>
            {groups.length > 0 ? (
              <>
                <span className="text-muted-foreground/40">/</span>
                <span>
                  {groups.length} file{groups.length === 1 ? "" : "s"}
                </span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={refresh}
            disabled={refreshing || resolving != null}
          >
            {refreshing ? (
              <LoaderIcon className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="mr-1.5 h-3 w-3" />
            )}
            Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={abortMerge}
            disabled={isAborting || isCompleting}
          >
            {isAborting ? (
              <LoaderIcon className="mr-1.5 h-3 w-3 animate-spin" />
            ) : (
              <Undo2 className="mr-1.5 h-3 w-3" />
            )}
            Abort
          </Button>
        </div>
      </div>

      {canCompleteMerge ? (
        <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-3">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-emerald-700">
                All conflicts are resolved.
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                Commit the merge to finish this pull.
              </div>
            </div>
            <Input
              value={mergeMessage}
              onChange={(event) => setMergeMessage(event.target.value)}
              className="h-8 w-full rounded-sm text-xs md:w-72"
              placeholder="Merge message"
            />
            <Button
              size="sm"
              className="h-8"
              onClick={completeMerge}
              disabled={isCompleting || isAborting}
            >
              {isCompleting ? (
                <LoaderIcon className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <GitMerge className="mr-1.5 h-3 w-3" />
              )}
              Complete merge
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <ConflictGroupList
          groups={groups}
          selectedPath={selectedGroup?.path ?? null}
          nodeMap={nodeMap}
          onSelect={setSelectedPath}
        />
        <div className="flex min-h-0 flex-col gap-4">
          <ConflictGroupDetail
            group={selectedGroup}
            nodeMap={nodeMap}
            resolving={resolving}
            onResolve={resolvePath}
            onResolveRows={resolveRows}
          />
          <div className="min-h-0 flex-1 rounded-md border border-border/60">
            <div className="flex h-9 items-center gap-2 border-b border-border/60 bg-muted/20 px-3">
              <FileDiff className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Worktree diff</span>
            </div>
            <div className="h-[calc(100%-2.25rem)] p-3">
              <ChangesView
                diff={diff}
                diffError={diffError}
                nodeMap={nodeMap}
                emptyMessage="No uncommitted merge changes."
                fileFallbackMessage="SQLite row-level details were not returned for these merge changes."
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ConflictGroupList({
  groups,
  selectedPath,
  nodeMap,
  onSelect,
}: {
  groups: ConflictGroup[]
  selectedPath: string | null
  nodeMap: Record<string, any>
  onSelect: (path: string) => void
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          No conflicts
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          The merge can be completed from the banner above.
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-0 overflow-hidden rounded-md border border-border/60 bg-background">
      <div className="flex h-10 items-center justify-between border-b border-border/60 bg-muted/20 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Database className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Conflict files</span>
        </div>
        <span className="rounded border border-border/60 bg-background px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          {groups.length}
        </span>
      </div>
      <div className="max-h-[calc(100vh-15rem)] overflow-y-auto">
        {groups.map((group) => (
          <ConflictGroupButton
            key={group.path}
            group={group}
            selected={selectedPath === group.path}
            nodeMap={nodeMap}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  )
}

function ConflictGroupButton({
  group,
  selected,
  nodeMap,
  onSelect,
}: {
  group: ConflictGroup
  selected: boolean
  nodeMap: Record<string, any>
  onSelect: (path: string) => void
}) {
  const summary = summarizeConflicts(group.items)
  const parts = summaryParts(summary)
  const preview = group.items[0]

  return (
    <button
      type="button"
      onClick={() => onSelect(group.path)}
      className={`flex w-full items-start gap-2 border-b border-border/60 px-3 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/35 ${
        selected ? "bg-primary/5" : ""
      }`}
    >
      <ChevronRight
        className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${
          selected ? "rotate-90 text-foreground" : ""
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-mono text-xs font-medium text-foreground">
            {group.path}
          </span>
          <span className="shrink-0 rounded border border-border/60 bg-background px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {group.items.length}
          </span>
        </div>
        <div className="mt-1 truncate text-[11px] text-muted-foreground">
          {preview ? formatConflictArtifactTitle(preview, nodeMap) : "Conflict"}
        </div>
        {parts.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {parts.map((part) => (
              <span
                key={part}
                className="rounded border border-border/60 bg-muted/20 px-1.5 py-0.5 text-[10px] text-muted-foreground"
              >
                {part}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </button>
  )
}

function ConflictGroupDetail({
  group,
  nodeMap,
  resolving,
  onResolve,
  onResolveRows,
}: {
  group: ConflictGroup | null
  nodeMap: Record<string, any>
  resolving: string | null
  onResolve: ResolveConflict
  onResolveRows: ResolveRowConflicts
}) {
  if (!group) {
    return (
      <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-4">
        <div className="text-sm font-medium">Select a conflict</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Pick a conflicted database file to review the merge choices.
        </p>
      </div>
    )
  }

  const summary = summarizeConflicts(group.items)
  const parts = summaryParts(summary)
  const unresolvedItems = group.items.filter(
    (item) => !isConflictResolved(item)
  )
  const rowGroups = groupRowConflictsByTable(group.items, nodeMap)
  const nonRowItems = group.items.filter((item) => item.kind !== "row")

  return (
    <div className="overflow-hidden rounded-md border border-border/60 bg-background">
      <div className="border-b border-border/60 bg-muted/20 px-3 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <div className="truncate font-mono text-xs font-semibold">
                {group.path}
              </div>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">
                {unresolvedItems.length} unresolved item
                {unresolvedItems.length === 1 ? "" : "s"}
              </span>
              {parts.map((part) => (
                <span
                  key={part}
                  className="rounded border border-border/60 bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground"
                >
                  {part}
                </span>
              ))}
            </div>
          </div>
        </div>
        {nonRowItems.length > 0 ? (
          <ResolutionPicker
            path={group.path}
            resolving={resolving}
            onResolve={onResolve}
          />
        ) : null}
      </div>
      <div className="max-h-[52vh] overflow-y-auto">
        {rowGroups.length > 0 ? (
          <div className="space-y-3 p-3">
            {rowGroups.map((rowGroup) => (
              <ConflictTableGrid
                key={rowGroup.table}
                group={rowGroup}
                path={group.path}
                resolving={resolving}
                onResolve={onResolve}
                onResolveRows={onResolveRows}
              />
            ))}
          </div>
        ) : null}
        {nonRowItems.length > 0 ? (
          <div className="divide-y divide-border/60 border-t border-border/60">
            {nonRowItems.map((artifact) => (
              <ConflictArtifactCard
                key={artifact.id}
                artifact={artifact}
                path={group.path}
                nodeMap={nodeMap}
                resolving={resolving}
                onResolve={onResolve}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ResolutionPicker({
  path,
  resolving,
  onResolve,
}: {
  path: string
  resolving: string | null
  onResolve: ResolveConflict
}) {
  return (
    <div className="mt-3 grid gap-2 md:grid-cols-3">
      <ResolveButton
        path={path}
        resolution="ours"
        resolving={resolving}
        onResolve={onResolve}
      />
      <ResolveButton
        path={path}
        resolution="manual"
        resolving={resolving}
        onResolve={onResolve}
      />
      <ResolveButton
        path={path}
        resolution="theirs"
        resolving={resolving}
        onResolve={onResolve}
      />
    </div>
  )
}

function ResolveButton({
  path,
  resolution,
  resolving,
  onResolve,
}: {
  path: string
  resolution: GraftConflictResolution
  resolving: string | null
  onResolve: ResolveConflict
}) {
  const key = `${resolution}:${path}:file`
  const isActive = resolving === key
  return (
    <Button
      type="button"
      variant={resolution === "manual" ? "default" : "outline"}
      className="h-auto min-h-12 justify-start gap-2 px-2 py-2 text-left"
      disabled={resolving != null}
      onClick={() => onResolve(resolution, path)}
    >
      {isActive ? (
        <LoaderIcon className="h-3.5 w-3.5 shrink-0 animate-spin" />
      ) : (
        <GitMerge className="h-3.5 w-3.5 shrink-0" />
      )}
      <span className="min-w-0">
        <span className="block text-xs font-medium leading-4">
          {getResolutionLabel(resolution)}
        </span>
        <span className="block whitespace-normal text-[10px] font-normal leading-4 opacity-75">
          {getResolutionDescription(resolution)}
        </span>
      </span>
    </Button>
  )
}

function ConflictTableGrid({
  group,
  path,
  resolving,
  onResolve,
  onResolveRows,
}: {
  group: RowConflictTableGroup
  path: string
  resolving: string | null
  onResolve: ResolveConflict
  onResolveRows: ResolveRowConflicts
}) {
  const unresolved = group.artifacts.filter(
    (artifact) => !isConflictResolved(artifact)
  ).length
  const rows = group.artifacts.map(rowConflictToDiffGridRow)
  const unresolvedRows = group.artifacts.filter(
    (artifact) => !isConflictResolved(artifact)
  )
  const resolvingOurs = resolving === `ours:${path}:${group.table}:rows`
  const resolvingTheirs = resolving === `theirs:${path}:${group.table}:rows`

  return (
    <div className="overflow-hidden rounded-md border border-border/60 bg-background">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/20 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Rows3 className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold">{group.label}</div>
            <div className="text-[11px] text-muted-foreground">
              {group.artifacts.length} conflicted row
              {group.artifacts.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={resolving != null || unresolvedRows.length === 0}
            onClick={() => onResolveRows("ours", path, unresolvedRows)}
          >
            {resolvingOurs ? (
              <LoaderIcon className="h-3 w-3 animate-spin" />
            ) : (
              <GitMerge className="h-3 w-3" />
            )}
            Keep all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2 text-xs"
            disabled={resolving != null || unresolvedRows.length === 0}
            onClick={() => onResolveRows("theirs", path, unresolvedRows)}
          >
            {resolvingTheirs ? (
              <LoaderIcon className="h-3 w-3 animate-spin" />
            ) : (
              <GitMerge className="h-3 w-3" />
            )}
            Take all
          </Button>
          <span
            className={`rounded border px-1.5 py-0.5 text-[10px] uppercase ${
              unresolved === 0
                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700"
                : "border-amber-500/30 bg-amber-500/5 text-amber-700"
            }`}
          >
            {unresolved === 0 ? "resolved" : `${unresolved} left`}
          </span>
        </div>
      </div>
      <DiffDataGrid
        rows={rows}
        columns={group.columns}
        mode="conflict"
        maxVisibleRows={8}
        resolvingRowKey={resolving}
        disableActions={resolving != null}
        onResolveRow={(row, resolution) => {
          if (!row.table || (row.rowid == null && row.key == null)) return
          onResolve(
            resolution,
            path,
            row.rowid != null
              ? { table: row.table, rowid: Number(row.rowid) }
              : { table: row.table, key: row.key }
          )
        }}
      />
    </div>
  )
}

function ConflictArtifactCard({
  artifact,
  path,
  nodeMap,
  resolving,
  onResolve,
}: {
  artifact: GraftConflictArtifact
  path: string
  nodeMap: Record<string, any>
  resolving: string | null
  onResolve: ResolveConflict
}) {
  const KindIcon = getConflictKindIcon(artifact.kind)
  const resolved = isConflictResolved(artifact)

  return (
    <div className="bg-background px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <div className="mt-0.5 rounded border border-border/60 bg-muted/20 p-1">
            <KindIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-medium">
              {formatConflictArtifactTitle(artifact, nodeMap)}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {formatConflictArtifactDetail(artifact)}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {resolved ? (
            <span className="rounded border border-emerald-500/30 bg-emerald-500/5 px-1.5 py-0.5 text-[10px] uppercase text-emerald-700">
              {artifact.resolution
                ? `resolved: ${artifact.resolution}`
                : "resolved"}
            </span>
          ) : null}
          <span className="rounded border border-border/60 bg-muted/20 px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
            {artifact.kind}
          </span>
        </div>
      </div>
      {artifact.message ? (
        <div className="mt-2 rounded-sm border border-amber-500/20 bg-amber-500/5 px-2 py-1.5 text-xs text-muted-foreground">
          {artifact.message}
        </div>
      ) : null}
      <ConflictRowPreview artifact={artifact} />
    </div>
  )
}

function getConflictKindIcon(kind: GraftConflictArtifact["kind"]) {
  if (kind === "row") return Rows3
  if (kind === "schema") return Database
  if (kind === "opaque") return AlertTriangle
  return FileDiff
}

function formatConflictArtifactTitle(
  artifact: GraftConflictArtifact,
  nodeMap: Record<string, any>
) {
  if (artifact.kind === "row") {
    return `${resolveTableName(artifact.table, nodeMap)} row=${artifact.rowid ?? (artifact.key ? JSON.stringify(artifact.key) : "?")}`
  }
  if (artifact.kind === "schema") {
    return `${artifact.entryType ?? "schema"}:${artifact.name ?? ""}`
  }
  return artifact.message || artifact.reason || artifact.kind
}

function formatConflictArtifactDetail(artifact: GraftConflictArtifact) {
  const ops = [artifact.oursOp, artifact.theirsOp].filter(Boolean).join(" vs ")
  if (ops) return ops
  return artifact.reason || "conflict"
}

function ConflictRowPreview({ artifact }: { artifact: GraftConflictArtifact }) {
  const rows = [
    { label: "Base", value: artifact.baseRow, tone: "muted" },
    { label: "Ours", value: artifact.oursRow, tone: "ours" },
    { label: "Theirs", value: artifact.theirsRow, tone: "theirs" },
  ].filter((row) => row.value != null)

  if (rows.length === 0) return null

  return (
    <div className="mt-3 overflow-hidden rounded-md border border-border/60 text-xs md:grid md:grid-cols-3">
      {rows.map((row) => (
        <ConflictValueColumn
          key={row.label}
          label={row.label}
          tone={row.tone}
          value={row.value}
        />
      ))}
    </div>
  )
}

function ConflictValueColumn({
  label,
  tone,
  value,
}: {
  label: string
  tone: string
  value: unknown
}) {
  const values = Array.isArray(value) ? value : null
  const accent =
    tone === "ours"
      ? "border-emerald-500/30 bg-emerald-500/5"
      : tone === "theirs"
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-border/60 bg-muted/20"

  return (
    <div className="min-w-0 border-b border-border/60 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
      <div
        className={`flex h-8 items-center justify-between border-b px-2 ${accent}`}
      >
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">
          {label}
        </span>
        {values ? (
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {values.length} values
          </span>
        ) : null}
      </div>
      <div className="max-h-44 overflow-auto p-2">
        {values ? (
          <div className="space-y-1">
            {values.map((item, index) => (
              <div
                key={index}
                className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-2 rounded-sm bg-muted/20 px-2 py-1"
              >
                <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                  #{index}
                </span>
                <span className="min-w-0 break-words font-mono text-[11px] leading-5">
                  {formatConflictCellValue(item)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <pre className="whitespace-pre-wrap break-words rounded-sm bg-muted/20 p-2 font-mono text-[11px] leading-5">
            {formatConflictCellValue(value)}
          </pre>
        )}
      </div>
    </div>
  )
}

function formatConflictCellValue(value: unknown) {
  if (value == null) return "NULL"
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}
