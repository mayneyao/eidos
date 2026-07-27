import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Database,
  FileDiff,
  LoaderCircle,
  RefreshCw,
  Rows3,
} from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"

import { cn } from "@/lib/utils"
import { useTabContext } from "@/apps/web-app/components/tab-manager/tab-context"
import {
  useSpaceVersioning,
  type SpaceVersionConflictArtifact,
  type SpaceVersionConflictPath,
  type SpaceVersionConflictResolution,
} from "@/apps/web-app/hooks/use-space-versioning"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useTabTitle } from "@/apps/web-app/hooks/use-tab-title"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { Button } from "@/components/ui/button"

interface ConflictGroup {
  path: string
  summary: SpaceVersionConflictPath | null
  artifacts: SpaceVersionConflictArtifact[]
}

function filenameOf(path: string) {
  return path.split("/").pop() || path
}

function valueText(value: unknown): string {
  if (value === null) return "NULL"
  if (value === undefined) return "—"
  if (typeof value === "string") return value || '""'
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function valuesEqual(left: unknown, right: unknown) {
  try {
    return JSON.stringify(left) === JSON.stringify(right)
  } catch {
    return Object.is(left, right)
  }
}

function rowIdentityText(artifact: SpaceVersionConflictArtifact): string {
  if (artifact.rowId !== null) return String(artifact.rowId)
  if (artifact.key) return valueText(artifact.key)
  return "?"
}

function artifactColumns(artifact: SpaceVersionConflictArtifact): string[] {
  if (artifact.columns.length > 0) return artifact.columns
  const length = Math.max(
    artifact.baseRow?.length ?? 0,
    artifact.oursRow?.length ?? 0,
    artifact.theirsRow?.length ?? 0
  )
  return Array.from({ length }, (_, index) => `#${index + 1}`)
}

function groupConflicts(
  paths: SpaceVersionConflictPath[],
  artifacts: SpaceVersionConflictArtifact[]
): ConflictGroup[] {
  const groups = new Map<string, ConflictGroup>()
  for (const path of paths) {
    groups.set(path.path, { path: path.path, summary: path, artifacts: [] })
  }
  for (const artifact of artifacts) {
    const group = groups.get(artifact.path) ?? {
      path: artifact.path,
      summary: null,
      artifacts: [],
    }
    group.artifacts.push(artifact)
    groups.set(artifact.path, group)
  }
  return [...groups.values()].sort((left, right) =>
    left.path.localeCompare(right.path)
  )
}

function unresolvedCount(group: ConflictGroup) {
  if (group.artifacts.length > 0) {
    return group.artifacts.filter(
      (artifact) => artifact.status === "unresolved"
    ).length
  }
  return group.summary?.unresolved ?? 0
}

function ConflictPathList({
  groups,
  selectedPath,
  onSelect,
}: {
  groups: ConflictGroup[]
  selectedPath: string | null
  onSelect: (path: string) => void
}) {
  return (
    <nav
      className="min-h-0 w-[248px] shrink-0 overflow-y-auto border-r bg-muted/[0.12] py-1"
      aria-label="Conflicted files"
    >
      {groups.map((group) => {
        const count = unresolvedCount(group)
        return (
          <button
            key={group.path}
            type="button"
            className={cn(
              "flex h-10 w-full items-center gap-2 px-3 text-left outline-hidden",
              "hover:bg-muted/50 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring",
              selectedPath === group.path && "bg-muted text-foreground"
            )}
            aria-current={selectedPath === group.path ? "page" : undefined}
            onClick={() => onSelect(group.path)}
          >
            {group.summary?.kind === "sqlite_database" ? (
              <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            ) : (
              <FileDiff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate text-xs">
              {group.path}
            </span>
            <span
              className={cn(
                "shrink-0 text-[10px] tabular-nums",
                count > 0
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600"
              )}
            >
              {count}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

function ResolutionButton({
  label,
  resolution,
  disabled,
  loading,
  onResolve,
}: {
  label: string
  resolution: SpaceVersionConflictResolution
  disabled: boolean
  loading: boolean
  onResolve: (resolution: SpaceVersionConflictResolution) => void
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 px-2 text-[11px]"
      disabled={disabled}
      onClick={() => onResolve(resolution)}
    >
      {loading ? <LoaderCircle className="h-3 w-3 animate-spin" /> : null}
      {label}
    </Button>
  )
}

function RowConflict({
  artifact,
  disabled,
  loading,
  onResolve,
}: {
  artifact: SpaceVersionConflictArtifact
  disabled: boolean
  loading: boolean
  onResolve: (resolution: SpaceVersionConflictResolution) => void
}) {
  const columns = artifactColumns(artifact)
  const resolved = artifact.status === "resolved"
  return (
    <section
      className="border-b last:border-b-0"
      aria-label={`Row ${rowIdentityText(artifact)}`}
    >
      <div className="flex min-h-10 flex-wrap items-center gap-2 bg-muted/[0.18] px-4 py-2">
        <Rows3 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">{artifact.table ?? "Table"}</span>
        <span className="text-[11px] text-muted-foreground">
          row {rowIdentityText(artifact)}
        </span>
        {artifact.semanticKey.length > 0 ? (
          <span className="min-w-0 truncate text-[10px] text-muted-foreground/80">
            {artifact.semanticKey.join(" · ")}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          {resolved ? (
            <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" />
              {artifact.resolution ?? "resolved"}
            </span>
          ) : (
            <>
              <ResolutionButton
                label="Keep current"
                resolution="ours"
                disabled={disabled}
                loading={loading}
                onResolve={onResolve}
              />
              <ResolutionButton
                label="Accept incoming"
                resolution="theirs"
                disabled={disabled}
                loading={loading}
                onResolve={onResolve}
              />
            </>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] table-fixed border-collapse text-left text-[11px]">
          <thead>
            <tr className="border-y bg-muted/[0.08] text-muted-foreground">
              <th className="w-36 px-4 py-2 font-medium">Field</th>
              <th className="px-3 py-2 font-medium">Base</th>
              <th className="px-3 py-2 font-medium">Current</th>
              <th className="px-3 py-2 font-medium">Incoming</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((column, index) => {
              const base = artifact.baseRow?.[index]
              const ours = artifact.oursRow?.[index]
              const theirs = artifact.theirsRow?.[index]
              return (
                <tr
                  key={`${artifact.id}:${column}`}
                  className="border-b last:border-b-0"
                >
                  <th className="truncate px-4 py-2 font-medium text-muted-foreground">
                    {column}
                  </th>
                  <td className="break-words px-3 py-2 text-muted-foreground">
                    {valueText(base)}
                  </td>
                  <td
                    className={cn(
                      "break-words px-3 py-2",
                      !valuesEqual(base, ours) &&
                        "bg-emerald-500/[0.08] text-emerald-800 dark:text-emerald-200"
                    )}
                  >
                    {valueText(ours)}
                  </td>
                  <td
                    className={cn(
                      "break-words px-3 py-2",
                      !valuesEqual(base, theirs) &&
                        "bg-amber-500/[0.09] text-amber-900 dark:text-amber-100"
                    )}
                  >
                    {valueText(theirs)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function FileConflictResolution({
  artifacts,
  disabled,
  loading,
  onResolve,
}: {
  artifacts: SpaceVersionConflictArtifact[]
  disabled: boolean
  loading: boolean
  onResolve: (resolution: SpaceVersionConflictResolution) => void
}) {
  const unresolved = artifacts.filter(
    (artifact) => artifact.status === "unresolved" && artifact.kind !== "row"
  )
  if (artifacts.length > 0 && unresolved.length === 0) return null
  const detail = unresolved[0]
  return (
    <div className="border-b bg-amber-500/[0.045] px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium">
            {detail?.kind === "schema"
              ? "Schema conflict requires a file-level choice"
              : detail?.kind === "opaque"
                ? "This database change cannot be merged row by row"
                : "This file requires a version choice"}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {detail?.message ||
              "Review the diff, then keep the current file, accept the incoming file, or use the file after editing it manually."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ResolutionButton
            label="Use edited file"
            resolution="manual"
            disabled={disabled}
            loading={loading}
            onResolve={onResolve}
          />
          <ResolutionButton
            label="Keep current"
            resolution="ours"
            disabled={disabled}
            loading={loading}
            onResolve={onResolve}
          />
          <ResolutionButton
            label="Accept incoming"
            resolution="theirs"
            disabled={disabled}
            loading={loading}
            onResolve={onResolve}
          />
        </div>
      </div>
    </div>
  )
}

export function SpaceVersionConflictsPage() {
  useTabTitle("Resolve Conflicts")
  const { isActive } = useTabContext()
  const { currentSpace } = useCurrentSpace()
  const spaceId = currentSpace?.id
  const location = useLocation()
  const navigate = useNavigate()
  const openTab = useTabStore((state) => state.openTab)
  const {
    status,
    conflicts,
    statusLoading,
    conflictsLoading,
    operation,
    error,
    available,
    resolveConflict,
    refresh,
  } = useSpaceVersioning(spaceId, { active: isActive })
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const requestedPath = useMemo(
    () => new URLSearchParams(location.search).get("path"),
    [location.search]
  )
  const groups = useMemo(
    () => groupConflicts(conflicts?.paths ?? [], conflicts?.conflicts ?? []),
    [conflicts]
  )
  const selectedGroup =
    groups.find((group) => group.path === requestedPath) ?? groups[0] ?? null
  const unresolved = groups.reduce(
    (count, group) => count + unresolvedCount(group),
    0
  )

  const selectPath = useCallback(
    (path: string) => {
      const params = new URLSearchParams(location.search)
      params.set("path", path)
      navigate(
        { pathname: location.pathname, search: `?${params.toString()}` },
        { replace: true }
      )
    },
    [location.pathname, location.search, navigate]
  )

  useEffect(() => {
    if (!selectedGroup || requestedPath === selectedGroup.path) return
    selectPath(selectedGroup.path)
  }, [requestedPath, selectPath, selectedGroup])

  const resolve = async (
    resolution: SpaceVersionConflictResolution,
    artifact?: SpaceVersionConflictArtifact
  ) => {
    if (!selectedGroup || operation) return
    const target =
      artifact?.kind === "row" && artifact.table
        ? artifact.rowId !== null
          ? { table: artifact.table, rowId: artifact.rowId }
          : artifact.key
            ? { table: artifact.table, key: artifact.key }
            : undefined
        : undefined
    setLocalError(null)
    setNotice(null)
    setResolvingId(artifact?.id ?? `${selectedGroup.path}:file`)
    try {
      const result = await resolveConflict({
        path: selectedGroup.path,
        resolution,
        expectedHead: status?.head?.id ?? null,
        target,
      })
      setNotice(
        result.remainingConflicts > 0
          ? `${result.remainingConflicts} ${result.remainingConflicts === 1 ? "conflict remains" : "conflicts remain"}.`
          : "All conflicts are resolved. Create a version to finish the merge."
      )
    } catch (resolveError) {
      setLocalError(
        resolveError instanceof Error
          ? resolveError.message
          : String(resolveError)
      )
    } finally {
      setResolvingId(null)
    }
  }

  const openDiff = () => {
    if (!selectedGroup) return
    const params = new URLSearchParams({ path: selectedGroup.path })
    if (status?.head?.id) params.set("from", status.head.id)
    if (status?.mergeHead) params.set("to", status.mergeHead)
    openTab(
      `/version/diff?${params.toString()}`,
      `${filenameOf(selectedGroup.path)} (Diff)`
    )
  }

  if (!available) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Versioning is available in Eidos Desktop.
      </div>
    )
  }

  const loading = statusLoading || conflictsLoading
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        {unresolved > 0 ? (
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        ) : (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        )}
        <h1 className="text-sm font-medium">
          {unresolved > 0 ? "Resolve conflicts" : "Conflicts resolved"}
        </h1>
        {!loading ? (
          <span className="text-[11px] text-muted-foreground">
            {unresolved} unresolved in {groups.length}{" "}
            {groups.length === 1 ? "file" : "files"}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            aria-label="Refresh conflicts"
            disabled={loading || operation !== null}
            onClick={() => void refresh()}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", loading && "animate-spin")}
            />
          </Button>
        </div>
      </header>
      {(localError || error || notice) && (
        <div
          role={localError || error ? "alert" : "status"}
          className={cn(
            "shrink-0 border-b px-4 py-2 text-xs",
            localError || error
              ? "bg-destructive/5 text-destructive"
              : "bg-emerald-500/[0.06] text-emerald-700 dark:text-emerald-300"
          )}
        >
          {localError || error?.message || notice}
        </div>
      )}
      {loading && !conflicts ? (
        <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin" /> Loading conflicts…
        </div>
      ) : groups.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-8 text-center">
          <div>
            <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-600" />
            <p className="mt-3 text-sm font-medium">No unresolved conflicts</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Return to Version and create a version to finish the merge.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <ConflictPathList
            groups={groups}
            selectedPath={selectedGroup?.path ?? null}
            onSelect={selectPath}
          />
          <main className="min-w-0 flex-1 overflow-y-auto">
            {selectedGroup ? (
              <>
                <div className="sticky top-0 z-10 flex h-10 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur-sm">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                    {selectedGroup.path}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {unresolvedCount(selectedGroup)} unresolved
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px]"
                    onClick={openDiff}
                  >
                    <FileDiff className="h-3.5 w-3.5" /> Open diff
                  </Button>
                </div>
                <FileConflictResolution
                  artifacts={selectedGroup.artifacts}
                  disabled={operation !== null || resolvingId !== null}
                  loading={resolvingId === `${selectedGroup.path}:file`}
                  onResolve={(resolution) => void resolve(resolution)}
                />
                {selectedGroup.artifacts
                  .filter((artifact) => artifact.kind === "row")
                  .map((artifact) => (
                    <RowConflict
                      key={artifact.id}
                      artifact={artifact}
                      disabled={operation !== null || resolvingId !== null}
                      loading={resolvingId === artifact.id}
                      onResolve={(resolution) =>
                        void resolve(resolution, artifact)
                      }
                    />
                  ))}
                {selectedGroup.artifacts.length ===
                0 ? null : selectedGroup.artifacts.every(
                    (artifact) => artifact.kind === "row"
                  ) ? null : (
                  <div className="px-4 py-3 text-[11px] leading-5 text-muted-foreground">
                    Schema and opaque database conflicts are resolved at file
                    level because Graft cannot safely apply them as independent
                    rows.
                  </div>
                )}
              </>
            ) : null}
          </main>
        </div>
      )}
    </div>
  )
}
