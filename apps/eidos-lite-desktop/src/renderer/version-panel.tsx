import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Cloud,
  CloudDownload,
  CloudUpload,
  Database,
  FileClock,
  FileText,
  GitBranch,
  GitCommitHorizontal,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  Table2,
  X,
} from "lucide-react"

import type {
  SpaceSnapshot,
  SpaceVersionCommit,
  SpaceVersionDiff,
  SpaceVersionFileDiff,
  SpaceVersionPathChange,
  SpaceVersionTableDiff,
  SpaceSyncHistoryStatus,
} from "../shared/contracts"
import type { ResolvedAppearance } from "./app-appearance"
import { useFileContentFocusRequest } from "./file-content-focus"
import type { VersionDiffNavigationLocation } from "./navigation-history"
import {
  VersionChangeTree,
  type VersionChangeDiscardTarget,
  type VersionInspection,
} from "./version-change-tree"
import {
  VersionTableDiff,
  type VersionTableRecordSelection,
} from "./version-table-diff"
import { VersionWorkingMediaPreview } from "./version-media-preview"
import { VersionRenameSummary, VersionTextDiff } from "./version-text-diff"

export { VersionTableDiff as TableDiff } from "./version-table-diff"

type PanelMode = "changes" | "history"

const VERSION_PATH_DIFF_CACHE_LIMIT = 64

interface VersionPathDiffCacheEntry {
  value?: SpaceVersionDiff
  promise?: Promise<SpaceVersionDiff>
}

const versionPathDiffCache = new Map<string, VersionPathDiffCacheEntry>()

function cachedVersionPathDiff(key: string): SpaceVersionDiff | null {
  const entry = versionPathDiffCache.get(key)
  if (!entry?.value) return null
  versionPathDiffCache.delete(key)
  versionPathDiffCache.set(key, entry)
  return entry.value
}

function discardPendingVersionPathDiffs(): void {
  for (const [key, entry] of versionPathDiffCache) {
    if (entry.promise) versionPathDiffCache.delete(key)
  }
}

function workingVersionIdentity(
  space: SpaceSnapshot,
  refreshKey: number
): string {
  return [
    space.id,
    space.graft.currentHead ?? "root",
    space.graft.changeToken ??
      space.graft.generation?.toString() ??
      refreshKey.toString(),
    space.graft.clean === false
      ? `dirty:${space.graft.changedPaths ?? "?"}`
      : "clean",
  ].join(":")
}

function versionPathDiffCacheKey(
  inspection: VersionInspection,
  space: SpaceSnapshot,
  refreshKey: number
): string {
  const scope = inspection.type === "table" ? inspection.table.name : "file"
  return inspection.mode === "history" && inspection.commit
    ? [
        "history",
        inspection.diff.from ?? inspection.commit.parent ?? "root",
        inspection.commit.id,
        inspection.change.path,
        scope,
      ].join(":")
    : [
        "changes",
        workingVersionIdentity(space, refreshKey),
        inspection.change.path,
        scope,
      ].join(":")
}

export function loadVersionPathDiff(
  key: string,
  load: () => Promise<SpaceVersionDiff>
): Promise<SpaceVersionDiff> {
  const cached = versionPathDiffCache.get(key)
  if (cached?.value) return Promise.resolve(cached.value)
  if (cached?.promise) return cached.promise

  const entry: VersionPathDiffCacheEntry = {}
  entry.promise = load()
    .then((value) => {
      if (versionPathDiffCache.get(key) !== entry) return value
      entry.value = value
      entry.promise = undefined
      versionPathDiffCache.delete(key)
      versionPathDiffCache.set(key, entry)
      while (versionPathDiffCache.size > VERSION_PATH_DIFF_CACHE_LIMIT) {
        const oldestKey = versionPathDiffCache.keys().next().value
        if (typeof oldestKey !== "string") break
        versionPathDiffCache.delete(oldestKey)
      }
      return value
    })
    .catch((error) => {
      if (versionPathDiffCache.get(key) === entry) {
        versionPathDiffCache.delete(key)
      }
      throw error
    })
  versionPathDiffCache.set(key, entry)
  return entry.promise
}

export async function loadVersionInspectionRoute(
  location: VersionDiffNavigationLocation
): Promise<VersionInspection> {
  const commitId = location.mode === "history" ? location.commitId : null
  const comparisonParent =
    location.mode === "history" ? location.comparisonParent : null
  const diff = await window.eidosLite.getVersionPathDiff(
    location.path,
    commitId,
    comparisonParent,
    location.tableName
  )
  const file =
    diff.files.find((candidate) => candidate.path === location.path) ?? null
  const change =
    diff.paths.find((candidate) => candidate.path === location.path) ?? file
  if (!change) {
    throw new Error(`${location.path} is not present in this version diff.`)
  }

  const commit: SpaceVersionCommit | null =
    location.mode === "history"
      ? {
          id: location.commitId,
          parent: location.commitParent,
          ...(location.commitParents
            ? { parents: location.commitParents }
            : {}),
          message: "",
          timestampMs: 0,
          files: 0,
          changes: [],
          tables: [],
          changedTables: 0,
        }
      : null
  const keyPrefix = `${location.mode}:${commitId ?? diff.currentHead ?? "working"}:${location.path}`
  if (location.tableName) {
    const table = file?.tables.find(
      (candidate) => candidate.name === location.tableName
    )
    if (!file || !table) {
      throw new Error(
        `${location.tableName} is not present in the diff for ${location.path}.`
      )
    }
    return {
      type: "table",
      key: `${keyPrefix}:${location.tableName}`,
      mode: location.mode,
      diff,
      change,
      file,
      table,
      commit,
    }
  }
  return {
    type: "file",
    key: keyPrefix,
    mode: location.mode,
    diff,
    change,
    file,
    commit,
  }
}

function hasConcreteSqliteChanges(
  diff: SpaceVersionDiff,
  path: string
): boolean {
  const file = diff.files.find((candidate) => candidate.path === path)
  return Boolean(
    file &&
    (file.logicalStatus === "logical_changes" ||
      file.tables.length > 0 ||
      (file.schemaChanges?.length ?? 0) > 0)
  )
}

export async function loadHistoricalVersionPathDiff(
  path: string,
  commit: SpaceVersionCommit,
  preferredParent: string | null,
  load: (parent: string | null) => Promise<SpaceVersionDiff>
): Promise<SpaceVersionDiff> {
  const initialParent = preferredParent ?? commit.parent
  const primary = await load(initialParent)
  const primaryFile = primary.files.find((file) => file.path === path)
  if (
    primaryFile?.logicalStatus !== "file_changed_no_supported_logical_changes"
  ) {
    return primary
  }

  const alternateParents = (commit.parents ?? []).filter(
    (parent) => parent !== initialParent
  )
  for (const parent of alternateParents) {
    const alternate = await load(parent)
    if (hasConcreteSqliteChanges(alternate, path)) return alternate
  }
  return primary
}

export function clearVersionPathDiffCache(): void {
  versionPathDiffCache.clear()
}

export function clearVersionPathDiffCacheForTests(): void {
  clearVersionPathDiffCache()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function isVersionReadAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const candidate = error as { name?: unknown; message?: unknown }
  if (candidate.name === "AbortError") return true
  if (typeof candidate.message !== "string") return false
  return (
    /(?:^|[\s:])AbortError(?:[\s:]|$)/i.test(candidate.message) &&
    /\b(?:abort(?:ed)?|cancell?ed)\b/i.test(candidate.message)
  )
}

export function mergeVersionDiffPages(
  current: SpaceVersionDiff,
  next: SpaceVersionDiff,
  preservePagination = false
): SpaceVersionDiff {
  const paths = new Map(current.paths.map((change) => [change.path, change]))
  const files = new Map(current.files.map((file) => [file.path, file]))
  for (const change of next.paths) paths.set(change.path, change)
  for (const file of next.files) {
    const existing = files.get(file.path)
    if (!existing) {
      files.set(file.path, file)
      continue
    }
    const tables = new Map(existing.tables.map((table) => [table.name, table]))
    for (const table of file.tables) {
      const existingTable = tables.get(table.name)
      tables.set(
        table.name,
        existingTable
          ? {
              ...existingTable,
              ...table,
              summary: table.summary ?? existingTable.summary,
            }
          : table
      )
    }
    files.set(file.path, {
      ...existing,
      ...file,
      tables: [...tables.values()],
    })
  }
  const changeToken = next.changeToken ?? current.changeToken
  return {
    ...next,
    ...(changeToken ? { changeToken } : {}),
    paths: [...paths.values()],
    files: [...files.values()],
    totalPaths: next.totalPaths ?? current.totalPaths,
    ...(preservePagination
      ? { hasMore: current.hasMore, nextCursor: current.nextCursor }
      : {}),
  }
}

function commitTime(timestampMs: number): string {
  if (!timestampMs) return "Unknown time"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestampMs))
}

interface HistorySyncPresentation {
  tone: SpaceSyncHistoryStatus["state"]
  title: string
  detail: string
}

export function historySyncPresentation(
  sync: SpaceSyncHistoryStatus
): HistorySyncPresentation {
  const checked = sync.checkedAtMs
    ? `Last checked ${commitTime(sync.checkedAtMs)}.`
    : "Open Sync to check the cloud."
  switch (sync.state) {
    case "up_to_date":
      return {
        tone: sync.state,
        title: "Latest saved version is in the cloud",
        detail: checked,
      }
    case "ahead":
      return {
        tone: sync.state,
        title: `${sync.ahead.toLocaleString()} local saved ${sync.ahead === 1 ? "version" : "versions"} waiting to upload`,
        detail: `Cloud is saved through an earlier version. ${checked}`,
      }
    case "behind":
      return {
        tone: sync.state,
        title: `Cloud has ${sync.behind.toLocaleString()} newer saved ${sync.behind === 1 ? "version" : "versions"}`,
        detail: `Open Sync to download the latest changes. ${checked}`,
      }
    case "diverged":
      return {
        tone: sync.state,
        title: "This device and the cloud both have new saved versions",
        detail: `${sync.ahead.toLocaleString()} local-only · ${sync.behind.toLocaleString()} cloud-only. Open Sync to review them safely. ${checked}`,
      }
    case "unknown":
      return {
        tone: sync.state,
        title: "Cloud history has not been checked yet",
        detail: checked,
      }
  }
}

function HistorySyncSummary({ sync }: { sync: SpaceSyncHistoryStatus }) {
  const presentation = historySyncPresentation(sync)
  const Icon =
    sync.state === "ahead"
      ? CloudUpload
      : sync.state === "behind"
        ? CloudDownload
        : sync.state === "diverged"
          ? GitBranch
          : Cloud
  return (
    <li
      className="history-sync-summary"
      data-history-sync-state={presentation.tone}
    >
      <Icon aria-hidden="true" />
      <span>
        <strong>{presentation.title}</strong>
        <small>{presentation.detail}</small>
      </span>
    </li>
  )
}

function fileName(path: string): string {
  return path.split("/").at(-1) ?? path
}

function fileParent(path: string): string {
  const segments = path.split("/")
  return segments.length > 1 ? segments.slice(0, -1).join("/") : "Space root"
}

function DiscardWorkingChangesDialog({
  target,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  target: VersionChangeDiscardTarget
  busy: boolean
  error: string | null
  onCancel(): void
  onConfirm(): void
}) {
  const title =
    target.kind === "all"
      ? "Discard all changes?"
      : target.kind === "folder"
        ? `Discard changes in ${fileName(target.path)}?`
        : `Discard changes to ${fileName(target.path)}?`
  const scope =
    target.kind === "all"
      ? target.fileCount === null
        ? "Every changed file currently in this Space"
        : `All ${target.fileCount} changed ${target.fileCount === 1 ? "file" : "files"} in this Space`
      : target.kind === "folder"
        ? target.fileCount === null
          ? `Every changed file currently under ${target.path}`
          : `${target.fileCount} changed ${target.fileCount === 1 ? "file" : "files"} under ${target.path}`
        : target.path
  return (
    <div className="path-dialog-backdrop" role="presentation">
      <form
        className="path-dialog discard-changes-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={(event) => {
          event.preventDefault()
          onConfirm()
        }}
      >
        <header>
          <strong>{title}</strong>
          <button
            type="button"
            className="icon-button"
            onClick={onCancel}
            aria-label="Cancel"
            disabled={busy}
          >
            <X />
          </button>
        </header>
        <p>
          <strong>{scope}</strong> will return to the latest saved version.
          Added files will be removed, deleted files will be restored, and
          renamed files will return to their saved paths. This cannot be undone.
        </p>
        {error ? (
          <div className="discard-changes-dialog-error" role="alert">
            <CircleAlert aria-hidden="true" />
            <span>{error}</span>
          </div>
        ) : null}
        <footer>
          <button type="button" autoFocus onClick={onCancel} disabled={busy}>
            Keep changes
          </button>
          <button type="submit" className="danger-action" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" aria-hidden="true" />
            ) : (
              <RotateCcw aria-hidden="true" />
            )}
            {busy
              ? "Discarding…"
              : target.kind === "all"
                ? "Discard all changes"
                : "Discard changes"}
          </button>
        </footer>
      </form>
    </div>
  )
}

function changeLabel(change: string): string {
  switch (change.toLocaleLowerCase()) {
    case "added":
    case "created":
    case "new":
      return "Added"
    case "deleted":
    case "removed":
      return "Deleted"
    case "renamed":
    case "moved":
      return "Renamed"
    default:
      return "Modified"
  }
}

function changeCode(change: string): string {
  const label = changeLabel(change)
  return label === "Added"
    ? "A"
    : label === "Deleted"
      ? "D"
      : label === "Renamed"
        ? "R"
        : "M"
}

function isEidosPath(path: string): boolean {
  return path.toLocaleLowerCase().endsWith(".eidos")
}

function tableStats(table: SpaceVersionTableDiff) {
  if (table.summary) {
    const { inserts, deletes, updates } = table.summary
    return { inserts, deletes, updates, total: inserts + deletes + updates }
  }
  let inserts = 0
  let deletes = 0
  let updates = 0
  for (const change of table.changes) {
    switch (change.op.toLocaleLowerCase()) {
      case "insert":
        inserts += 1
        break
      case "delete":
        deletes += 1
        break
      default:
        updates += 1
        break
    }
  }
  return { inserts, deletes, updates, total: inserts + deletes + updates }
}

function fileRowChanges(file: SpaceVersionFileDiff): number {
  return file.tables.reduce(
    (total, table) => total + tableStats(table).total,
    0
  )
}

export function withCommitTableSummaries(
  diff: SpaceVersionDiff,
  commit: SpaceVersionCommit
): SpaceVersionDiff {
  if (!commit.tables.length) return diff
  const eidosChanges = diff.paths.filter((change) => isEidosPath(change.path))
  if (eidosChanges.length !== 1) return diff
  const change = eidosChanges[0]!
  if (diff.files.some((file) => file.path === change.path)) return diff
  return {
    ...diff,
    files: [
      ...diff.files,
      {
        ...change,
        rowDiffAvailable: true,
        limitations: [],
        detailsLoaded: false,
        tables: commit.tables.map((summary) => ({
          name: summary.name,
          columns: [],
          primaryKeyColumns: [],
          changes: [],
          summary,
          rowChangesLoaded: false,
        })),
      },
    ],
  }
}

export function VersionDiffPreview({
  inspection,
  onClose,
  onNavigate,
  theme,
  titlebarNavigation,
  focusRequestToken = 0,
}: {
  inspection: VersionInspection
  onClose(): void
  onNavigate?(inspection: VersionInspection): void
  theme: ResolvedAppearance
  titlebarNavigation?: ReactNode
  focusRequestToken?: number
}) {
  const contentRef = useRef<HTMLDivElement>(null)
  useFileContentFocusRequest(focusRequestToken, () =>
    contentRef.current?.focus({ preventScroll: true })
  )
  const inspectionTable = inspection.type === "table" ? inspection.table : null
  const [pagedTable, setPagedTable] = useState<SpaceVersionTableDiff | null>(
    inspectionTable
  )
  const [rowLoadState, setRowLoadState] = useState<
    | { phase: "idle" }
    | { phase: "loading" }
    | { phase: "error"; message: string }
  >({ phase: "idle" })
  const [recordSelection, setRecordSelection] =
    useState<VersionTableRecordSelection | null>(null)
  useEffect(() => {
    setPagedTable(inspectionTable)
    setRowLoadState({ phase: "idle" })
    setRecordSelection(null)
  }, [inspection.key, inspectionTable])
  const activeTable = inspection.type === "table" ? pagedTable : null
  const title =
    inspection.type === "table"
      ? inspection.table.name
      : fileName(inspection.change.path)
  const showsTextDiff =
    inspection.type === "file" &&
    inspection.change.kind === "text_file" &&
    (inspection.mode === "changes" || inspection.commit !== null)
  const showsRename =
    inspection.type === "file" &&
    Boolean(inspection.change.previousPath) &&
    changeLabel(inspection.change.change) === "Renamed"
  const showsWorkingBinaryPreview =
    inspection.type === "file" &&
    inspection.mode === "changes" &&
    inspection.change.kind === "binary_file" &&
    changeLabel(inspection.change.change) !== "Deleted" &&
    !showsRename
  const comparesAlternateMergeParent = Boolean(
    inspection.mode === "history" &&
    inspection.commit &&
    (inspection.commit.parents?.length ?? 0) > 1 &&
    inspection.diff.from &&
    inspection.diff.from !== inspection.commit.parent
  )

  const loadMoreRows = async (): Promise<boolean> => {
    if (
      inspection.type !== "table" ||
      !activeTable?.hasMore ||
      !activeTable.nextCursor
    ) {
      return false
    }
    setRowLoadState({ phase: "loading" })
    try {
      const next = await window.eidosLite.getVersionPathDiff(
        inspection.change.path,
        inspection.mode === "history" ? (inspection.commit?.id ?? null) : null,
        inspection.mode === "history"
          ? (inspection.diff.from ?? inspection.commit?.parent ?? null)
          : null,
        activeTable.name,
        activeTable.nextCursor
      )
      const nextTable = next.files
        .find((file) => file.path === inspection.change.path)
        ?.tables.find((table) => table.name === activeTable.name)
      if (!nextTable) {
        throw new Error("The next page of changed rows was not returned.")
      }
      setPagedTable((current) =>
        current
          ? {
              ...current,
              ...nextTable,
              summary: current.summary ?? nextTable.summary,
              changes: [...current.changes, ...nextTable.changes],
            }
          : nextTable
      )
      setRowLoadState({ phase: "idle" })
      return nextTable.changes.length > 0
    } catch (cause) {
      setRowLoadState({ phase: "error", message: errorMessage(cause) })
      throw cause
    }
  }

  const retryLoadingRows = () => {
    void loadMoreRows().catch(() => undefined)
  }
  const fileInspection = (): VersionInspection => ({
    type: "file",
    key: `${inspection.mode}:${inspection.commit?.id ?? inspection.diff.currentHead ?? "working"}:${inspection.change.path}`,
    mode: inspection.mode,
    diff: inspection.diff,
    change: inspection.change,
    file: inspection.file,
    commit: inspection.commit,
  })
  const tableInspection = (
    file: SpaceVersionFileDiff,
    table: SpaceVersionTableDiff
  ): VersionInspection => ({
    type: "table",
    key: `${inspection.mode}:${inspection.commit?.id ?? inspection.diff.currentHead ?? "working"}:${inspection.change.path}:${table.name}`,
    mode: inspection.mode,
    diff: inspection.diff,
    change: inspection.change,
    file,
    table,
    commit: inspection.commit,
  })

  return (
    <section
      className="version-inspector version-inspector-route"
      aria-label={`Change details for ${title}`}
      data-version-inspector={inspection.type}
    >
      <header className="version-inspector-bar">
        {titlebarNavigation}
        <div>
          {inspection.type === "table" ? (
            <button
              type="button"
              className="version-inspector-crumb"
              aria-label={`Back to ${fileName(inspection.change.path)} file changes`}
              onClick={() => onNavigate?.(fileInspection())}
            >
              {fileName(inspection.change.path)}
            </button>
          ) : (
            <strong>{fileName(inspection.change.path)}</strong>
          )}
          {inspection.type === "table" ? (
            <>
              <ChevronRight aria-hidden="true" />
              {recordSelection ? (
                <button
                  type="button"
                  className="version-inspector-crumb"
                  aria-label={`Back to ${inspection.table.name} table changes`}
                  onClick={() => setRecordSelection(null)}
                >
                  {inspection.table.name}
                </button>
              ) : (
                <strong>{inspection.table.name}</strong>
              )}
              {recordSelection ? (
                <>
                  <ChevronRight aria-hidden="true" />
                  <strong title={recordSelection.label}>
                    {recordSelection.label}
                  </strong>
                </>
              ) : null}
            </>
          ) : null}
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close change details"
          title="Close change details"
        >
          <X />
        </button>
      </header>

      <div
        ref={contentRef}
        tabIndex={-1}
        className={`version-inspector-scroll${inspection.type === "table" ? " version-inspector-table-layout" : ""}${showsTextDiff ? " version-inspector-text-layout" : ""}${showsWorkingBinaryPreview ? " version-inspector-media-layout" : ""}`}
      >
        {inspection.type === "table" ? (
          <>
            {inspection.loadingDetails ? (
              <div
                className="version-inspector-loading"
                data-version-details-loading="true"
              >
                <LoaderCircle className="spin" aria-hidden="true" />
                <div>
                  <strong>Loading {inspection.table.name} changes…</strong>
                  <p>
                    Only this table is being compared. Large Eidos Files can
                    take a moment to prepare.
                  </p>
                </div>
              </div>
            ) : inspection.detailsError ? (
              <div className="version-inspector-loading" role="alert">
                <CircleAlert aria-hidden="true" />
                <div>
                  <strong>Row details could not be loaded</strong>
                  <p>{inspection.detailsError}</p>
                </div>
              </div>
            ) : (
              <div className="version-inspector-table">
                <VersionTableDiff
                  table={activeTable ?? inspection.table}
                  theme={theme}
                  showHeading={false}
                  identityKey={inspection.key}
                  onLoadMore={loadMoreRows}
                  loadingMore={rowLoadState.phase === "loading"}
                  loadError={
                    rowLoadState.phase === "error"
                      ? rowLoadState.message
                      : undefined
                  }
                  onRetryLoad={retryLoadingRows}
                  recordSelection={recordSelection}
                  onRecordSelectionChange={setRecordSelection}
                />
              </div>
            )}
          </>
        ) : showsTextDiff ? (
          inspection.mode === "history" && inspection.commit ? (
            <VersionTextDiff
              mode="history"
              commitId={inspection.commit.id}
              parentId={inspection.diff.from ?? inspection.commit.parent}
              path={inspection.change.path}
              previousPath={inspection.change.previousPath}
              theme={theme}
            />
          ) : (
            <VersionTextDiff
              mode="changes"
              expectedHead={inspection.diff.currentHead}
              path={inspection.change.path}
              previousPath={inspection.change.previousPath}
              theme={theme}
            />
          )
        ) : showsWorkingBinaryPreview ? (
          <VersionWorkingMediaPreview path={inspection.change.path} />
        ) : inspection.loadingDetails ? (
          <div
            className="version-inspector-loading"
            data-version-details-loading="true"
          >
            <LoaderCircle className="spin" aria-hidden="true" />
            <div>
              <strong>Finding changed tables…</strong>
              <p>
                Comparing this Eidos File with the latest saved version. You can
                keep working while this finishes.
              </p>
            </div>
          </div>
        ) : inspection.detailsError ? (
          <div className="version-inspector-loading" role="alert">
            <CircleAlert aria-hidden="true" />
            <div>
              <strong>Changed tables could not be loaded</strong>
              <p>{inspection.detailsError}</p>
            </div>
          </div>
        ) : inspection.file &&
          (inspection.file.tables.length > 0 ||
            (inspection.file.schemaChanges?.length ?? 0) > 0) ? (
          <>
            {showsRename && inspection.change.previousPath ? (
              <VersionRenameSummary
                previousPath={inspection.change.previousPath}
                path={inspection.change.path}
                compact
              />
            ) : null}
            <div className="version-inspector-file-summary">
              {comparesAlternateMergeParent ? (
                <p className="version-summary-hint">
                  This merge matches its local parent, so these details are
                  compared with the other merge parent.
                </p>
              ) : null}
              <p>
                {inspection.file.tables.length} changed{" "}
                {inspection.file.tables.length === 1 ? "table" : "tables"} ·{" "}
                {fileRowChanges(inspection.file)} row changes
                {(inspection.file.schemaChanges?.length ?? 0) > 0
                  ? ` · ${inspection.file.schemaChanges!.length} schema ${inspection.file.schemaChanges!.length === 1 ? "change" : "changes"}`
                  : ""}
              </p>
              {inspection.file.detailsLoaded === false ? (
                <p className="version-summary-hint">
                  Select a table to load its changed rows.
                </p>
              ) : null}
              <ul>
                {inspection.file.tables.map((table) => {
                  const stats = tableStats(table)
                  return (
                    <li key={table.name}>
                      <button
                        type="button"
                        aria-label={`Open ${table.name} table changes`}
                        onClick={() =>
                          onNavigate?.(tableInspection(inspection.file!, table))
                        }
                      >
                        <Table2 />
                        <strong>{table.name}</strong>
                        <span>
                          {stats.inserts ? `+${stats.inserts}` : ""}
                          {stats.deletes ? ` −${stats.deletes}` : ""}
                          {stats.updates ? ` ~${stats.updates}` : ""}
                        </span>
                        <ChevronRight aria-hidden="true" />
                      </button>
                    </li>
                  )
                })}
                {inspection.file.schemaChanges?.map((change) => (
                  <li
                    key={`schema:${change.entryType}:${change.name}:${change.operation}`}
                    className="version-inspector-schema-change"
                  >
                    <Database />
                    <strong>
                      {change.entryType} · {change.name}
                    </strong>
                    <span>{change.operation}</span>
                  </li>
                ))}
              </ul>
              {inspection.file.limitations.map((limitation) => (
                <p key={limitation} className="version-limitation">
                  {limitation}
                </p>
              ))}
            </div>
          </>
        ) : showsRename && inspection.change.previousPath ? (
          <VersionRenameSummary
            previousPath={inspection.change.previousPath}
            path={inspection.change.path}
          />
        ) : (
          <div className="version-inspector-empty">
            <FileText />
            <div>
              {inspection.file?.logicalStatus ===
              "file_changed_no_supported_logical_changes" ? (
                <>
                  <strong>No supported logical changes</strong>
                  <p>
                    The SQLite snapshot changed, but its supported schema and
                    rows match the comparison version.
                  </p>
                </>
              ) : (
                <>
                  <strong>File change recorded</strong>
                  <p>
                    {inspection.mode === "changes"
                      ? changeLabel(inspection.change.change) === "Deleted"
                        ? "This file was deleted locally. Its previous binary content is not available in this preview."
                        : "Content preview is not available for this local file."
                      : inspection.commit?.parent
                        ? "Detailed content changes are not available for this saved version."
                        : "This first saved version shows file metadata only."}
                  </p>
                </>
              )}
              <dl>
                {inspection.change.previousPath ? (
                  <div>
                    <dt>Previous path</dt>
                    <dd>{inspection.change.previousPath}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>
                    {inspection.change.previousPath ? "New path" : "Path"}
                  </dt>
                  <dd>{inspection.change.path}</dd>
                </div>
                {inspection.change.kind ? (
                  <div>
                    <dt>Kind</dt>
                    <dd>{inspection.change.kind.replace(/_/g, " ")}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

function HistoryDiffList({
  diff,
  commit,
  selectedKey,
  onSelect,
}: {
  diff: SpaceVersionDiff
  commit: SpaceVersionCommit
  selectedKey: string | null
  onSelect(inspection: VersionInspection): void
}) {
  const fileByPath = new Map(diff.files.map((file) => [file.path, file]))
  return (
    <ul className="history-change-list">
      {diff.paths.map((change) => {
        const file = fileByPath.get(change.path) ?? null
        const fileKey = `history:${commit.id}:${change.path}`
        return (
          <li key={change.path}>
            <button
              type="button"
              className={selectedKey === fileKey ? "selected" : ""}
              title={change.path}
              onClick={() =>
                onSelect({
                  type: "file",
                  key: fileKey,
                  mode: "history",
                  diff,
                  change,
                  file,
                  commit,
                })
              }
            >
              {isEidosPath(change.path) ? <Database /> : <FileText />}
              <span>
                <strong>{fileName(change.path)}</strong>
                <small>
                  {change.previousPath
                    ? `${change.previousPath} → ${change.path}`
                    : fileParent(change.path)}
                </small>
              </span>
              <b
                data-change={changeLabel(change.change).toLowerCase()}
                title={changeLabel(change.change)}
              >
                {changeCode(change.change)}
              </b>
            </button>
            {file?.tables.length ? (
              <ul>
                {file.tables.map((table) => {
                  const tableKey = `${fileKey}:${table.name}`
                  const stats = tableStats(table)
                  return (
                    <li key={table.name}>
                      <button
                        type="button"
                        className={selectedKey === tableKey ? "selected" : ""}
                        onClick={() =>
                          onSelect({
                            type: "table",
                            key: tableKey,
                            mode: "history",
                            diff,
                            change,
                            file,
                            table,
                            commit,
                          })
                        }
                      >
                        <Table2 />
                        <span>
                          <strong>{table.name}</strong>
                          <small>
                            {stats.inserts ? `+${stats.inserts}` : ""}
                            {stats.deletes ? ` −${stats.deletes}` : ""}
                            {stats.updates ? ` ~${stats.updates}` : ""}
                          </small>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

export function VersionPanel({
  space,
  refreshKey,
  onClose,
  onSpaceChange,
  onFilesMaterialized,
  onRefresh,
  onInspectionChange,
}: {
  space: SpaceSnapshot
  refreshKey: number
  onClose(): void
  onSpaceChange(snapshot: SpaceSnapshot): void
  onFilesMaterialized(
    snapshot: SpaceSnapshot,
    relativePaths?: readonly string[]
  ): void | Promise<void>
  onRefresh(): void
  onInspectionChange(inspection: VersionInspection | null): void
}) {
  const [mode, setMode] = useState<PanelMode>(
    space.graft.clean === false ? "changes" : "history"
  )
  const manuallySelectedMode = useRef(false)
  const [changes, setChanges] = useState<SpaceVersionDiff | null>(null)
  const [commits, setCommits] = useState<SpaceVersionCommit[]>([])
  const [historyHead, setHistoryHead] = useState<string | null>(null)
  const [historyCursor, setHistoryCursor] = useState<string | null>(null)
  const [historyHasMore, setHistoryHasMore] = useState(false)
  const [selectedCommit, setSelectedCommit] =
    useState<SpaceVersionCommit | null>(null)
  const [selectedDiff, setSelectedDiff] = useState<SpaceVersionDiff | null>(
    null
  )
  const [selectedInspectionKey, setSelectedInspectionKey] = useState<
    string | null
  >(null)
  const selectedInspectionKeyRef = useRef<string | null>(null)
  const selectedInspectionRef = useRef<VersionInspection | null>(null)
  const onInspectionChangeRef = useRef(onInspectionChange)
  onInspectionChangeRef.current = onInspectionChange
  const previousWorkingChangeTokenRef = useRef(space.graft.changeToken)
  const checkpointInFlightRef = useRef(false)
  const inspectionRequestIdRef = useRef(0)
  const modeRequestIdRef = useRef(0)
  const selectionRequestIdRef = useRef(0)
  const paginationRequestIdRef = useRef(0)
  const modeLoadInFlightRef = useRef<PanelMode | null>(null)
  const modeLoadQueuedRef = useRef<PanelMode | null>(null)
  const loadModeRef = useRef<(() => Promise<void>) | null>(null)
  const loadedHistoryHeadRef = useRef<string | null | undefined>(undefined)
  const activeVersionPathDiffKeyRef = useRef<string | null>(null)
  const [modeLoading, setModeLoading] = useState(false)
  const [selectionLoading, setSelectionLoading] = useState(false)
  const [paginationLoading, setPaginationLoading] = useState(false)
  const [busy, setBusy] = useState<
    "enable" | "checkpoint" | "restore" | "discard" | null
  >(null)
  const [checkpointMessage, setCheckpointMessage] = useState("")
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [discardConfirmation, setDiscardConfirmation] = useState<{
    target: VersionChangeDiscardTarget
    expectedHead: string
    expectedChangeToken: string
  } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const clearInspection = useCallback(() => {
    const hadInspection =
      selectedInspectionKeyRef.current !== null ||
      selectedInspectionRef.current !== null
    inspectionRequestIdRef.current += 1
    activeVersionPathDiffKeyRef.current = null
    discardPendingVersionPathDiffs()
    selectedInspectionKeyRef.current = null
    selectedInspectionRef.current = null
    setSelectedInspectionKey(null)
    if (hadInspection) onInspectionChangeRef.current(null)
  }, [])

  const inspect = useCallback(
    async (inspection: VersionInspection) => {
      const requestId = ++inspectionRequestIdRef.current
      selectedInspectionKeyRef.current = inspection.key
      selectedInspectionRef.current = inspection
      setSelectedInspectionKey(inspection.key)
      const needsDatabaseDetails =
        isEidosPath(inspection.change.path) &&
        (!inspection.file ||
          (inspection.type === "table" &&
            inspection.table.rowChangesLoaded === false))
      if (!needsDatabaseDetails) {
        if (activeVersionPathDiffKeyRef.current) {
          activeVersionPathDiffKeyRef.current = null
          discardPendingVersionPathDiffs()
          void window.eidosLite.cancelVersionReads().catch(() => undefined)
        }
        selectedInspectionRef.current = inspection
        onInspectionChangeRef.current(inspection)
        return
      }

      const cacheKey = versionPathDiffCacheKey(inspection, space, refreshKey)

      const applyDetail = (detail: SpaceVersionDiff) => {
        if (inspectionRequestIdRef.current !== requestId) return
        const source = mode === "changes" ? changes : selectedDiff
        const merged = source
          ? mergeVersionDiffPages(source, detail, true)
          : detail
        if (mode === "changes") setChanges(merged)
        else setSelectedDiff(merged)

        const file =
          merged.files.find(
            (candidate) => candidate.path === inspection.change.path
          ) ?? null
        if (inspection.type === "table") {
          const table = file?.tables.find(
            (candidate) => candidate.name === inspection.table.name
          )
          if (!file || !table) {
            const nextInspection: VersionInspection = {
              ...inspection,
              diff: merged,
              loadingDetails: false,
              detailsError: "The selected table is not present in this change.",
            }
            selectedInspectionRef.current = nextInspection
            onInspectionChangeRef.current(nextInspection)
            return
          }
          const nextInspection: VersionInspection = {
            ...inspection,
            diff: merged,
            file,
            table,
            loadingDetails: false,
            detailsError: undefined,
          }
          selectedInspectionRef.current = nextInspection
          onInspectionChangeRef.current(nextInspection)
          return
        }
        const nextInspection: VersionInspection = {
          ...inspection,
          diff: merged,
          file,
          loadingDetails: false,
          detailsError: undefined,
        }
        selectedInspectionRef.current = nextInspection
        onInspectionChangeRef.current(nextInspection)
      }

      setError(null)
      const replacedActiveRead =
        activeVersionPathDiffKeyRef.current !== null &&
        activeVersionPathDiffKeyRef.current !== cacheKey
      if (replacedActiveRead) discardPendingVersionPathDiffs()
      activeVersionPathDiffKeyRef.current = cacheKey
      const cached = cachedVersionPathDiff(cacheKey)
      if (cached) {
        activeVersionPathDiffKeyRef.current = null
        if (replacedActiveRead) {
          void window.eidosLite.cancelVersionReads().catch(() => undefined)
        }
        applyDetail(cached)
        return
      }
      const loadingInspection: VersionInspection = {
        ...inspection,
        loadingDetails: true,
        detailsError: undefined,
      }
      selectedInspectionRef.current = loadingInspection
      onInspectionChangeRef.current(loadingInspection)
      try {
        const tableName =
          inspection.type === "table" ? inspection.table.name : undefined
        const detail = await loadVersionPathDiff(cacheKey, () => {
          if (inspection.mode === "history" && inspection.commit) {
            return loadHistoricalVersionPathDiff(
              inspection.change.path,
              inspection.commit,
              inspection.diff.from,
              (parent) =>
                window.eidosLite.getVersionPathDiff(
                  inspection.change.path,
                  inspection.commit!.id,
                  parent,
                  tableName
                )
            )
          }
          return window.eidosLite.getVersionPathDiff(
            inspection.change.path,
            null,
            null,
            tableName
          )
        })
        applyDetail(detail)
      } catch (cause) {
        if (
          inspectionRequestIdRef.current === requestId &&
          !isVersionReadAbortError(cause)
        ) {
          const message = errorMessage(cause)
          setError(message)
          const failedInspection: VersionInspection = {
            ...inspection,
            loadingDetails: false,
            detailsError: message,
          }
          selectedInspectionRef.current = failedInspection
          onInspectionChangeRef.current(failedInspection)
        }
      } finally {
        if (inspectionRequestIdRef.current === requestId) {
          activeVersionPathDiffKeyRef.current = null
        }
      }
    },
    [
      changes,
      mode,
      refreshKey,
      selectedDiff,
      space.graft.changeToken,
      space.graft.currentHead,
      space.graft.generation,
      space.id,
    ]
  )

  const loadMode = useCallback(async () => {
    const requestedMode = mode
    if (modeLoadInFlightRef.current === requestedMode) {
      // A concurrent load started before this trigger and will return data
      // captured before it. Queue exactly one follow-up so the panel cannot
      // settle on a stale working-tree read.
      modeLoadQueuedRef.current = requestedMode
      return
    }
    const requestId = ++modeRequestIdRef.current
    modeLoadInFlightRef.current = requestedMode
    setModeLoading(true)
    setError(null)
    try {
      if (requestedMode === "changes") {
        const nextChanges = await window.eidosLite.getVersionChanges(100)
        if (modeRequestIdRef.current !== requestId) return
        setChanges(nextChanges)
      } else {
        const history = await window.eidosLite.getVersionHistory(50)
        if (modeRequestIdRef.current !== requestId) return
        loadedHistoryHeadRef.current = history.currentHead
        setCommits(history.commits)
        setHistoryHead(history.currentHead)
        setHistoryCursor(history.nextCursor ?? null)
        setHistoryHasMore(history.hasMore)
        setSelectedCommit((current) =>
          current
            ? (history.commits.find((commit) => commit.id === current.id) ??
              null)
            : null
        )
      }
    } catch (cause) {
      if (
        modeRequestIdRef.current === requestId &&
        !isVersionReadAbortError(cause)
      ) {
        setError(errorMessage(cause))
      }
    } finally {
      if (modeRequestIdRef.current === requestId) {
        modeLoadInFlightRef.current = null
        setModeLoading(false)
        if (modeLoadQueuedRef.current === requestedMode) {
          modeLoadQueuedRef.current = null
          void loadModeRef.current?.()
        }
      }
    }
  }, [mode])

  useEffect(() => {
    loadModeRef.current = loadMode
  }, [loadMode])

  const workingReloadIdentity =
    mode === "changes" ? workingVersionIdentity(space, refreshKey) : null

  const refreshVersionData = useCallback(() => {
    clearVersionPathDiffCache()
    onRefresh()
  }, [onRefresh])

  useEffect(() => {
    if (!space.graft.initialized) return
    void loadMode()
  }, [loadMode, refreshKey, space.graft.initialized, workingReloadIdentity])

  useEffect(() => {
    if (
      mode !== "history" ||
      !space.graft.initialized ||
      loadedHistoryHeadRef.current === undefined ||
      space.graft.currentHead === undefined ||
      loadedHistoryHeadRef.current === space.graft.currentHead
    ) {
      return
    }
    void loadMode()
  }, [loadMode, mode, space.graft.currentHead, space.graft.initialized])

  useEffect(() => {
    const previousToken = previousWorkingChangeTokenRef.current
    const nextToken = space.graft.changeToken
    previousWorkingChangeTokenRef.current = nextToken
    if (
      mode !== "changes" ||
      checkpointInFlightRef.current ||
      previousToken === undefined ||
      previousToken === nextToken
    ) {
      return
    }

    const inspection = selectedInspectionRef.current
    if (
      !inspection ||
      inspection.mode !== "changes" ||
      !isEidosPath(inspection.change.path)
    ) {
      return
    }

    discardPendingVersionPathDiffs()
    const nextInspection: VersionInspection =
      inspection.type === "table"
        ? {
            ...inspection,
            table: {
              ...inspection.table,
              rowChangesLoaded: false,
            },
            loadingDetails: true,
            detailsError: undefined,
          }
        : {
            ...inspection,
            file: null,
            loadingDetails: true,
            detailsError: undefined,
          }
    void inspect(nextInspection)
  }, [inspect, mode, space.graft.changeToken])

  useEffect(() => {
    if (space.graft.clean === false && !manuallySelectedMode.current) {
      setMode("changes")
    }
  }, [space.graft.clean])

  useEffect(() => {
    clearInspection()
  }, [clearInspection, mode, refreshKey])

  useEffect(
    () => () => {
      void window.eidosLite.cancelVersionReads().catch(() => undefined)
    },
    []
  )

  const selectCommit = async (commit: SpaceVersionCommit) => {
    const requestId = ++selectionRequestIdRef.current
    if (selectedCommit?.id === commit.id) {
      setSelectedCommit(null)
      setSelectedDiff(null)
      setConfirmRestore(false)
      clearInspection()
      setSelectionLoading(false)
      return
    }
    setSelectedCommit(commit)
    setSelectedDiff(null)
    setConfirmRestore(false)
    clearInspection()
    setSelectionLoading(true)
    setError(null)
    try {
      const diff = withCommitTableSummaries(
        await window.eidosLite.getVersionDiff(commit.id, commit.parent, 100),
        commit
      )
      if (selectionRequestIdRef.current === requestId) setSelectedDiff(diff)
    } catch (cause) {
      if (
        selectionRequestIdRef.current === requestId &&
        !isVersionReadAbortError(cause)
      ) {
        setError(errorMessage(cause))
      }
    } finally {
      if (selectionRequestIdRef.current === requestId) {
        setSelectionLoading(false)
      }
    }
  }

  const createCheckpoint = async () => {
    checkpointInFlightRef.current = true
    setBusy("checkpoint")
    setError(null)
    try {
      const snapshot = await window.eidosLite.createCheckpoint(
        checkpointMessage.trim() || undefined
      )
      // The saved snapshot changes the working-tree identity. Drop the old selection before
      // publishing it so the change-token effect cannot replay an obsolete table diff that will
      // immediately be cleared by the refresh below. On a large Eidos File that redundant read
      // can otherwise scan the newly committed snapshot for no user-visible result.
      clearInspection()
      onSpaceChange(snapshot)
      setCheckpointMessage("")
      // The checkpoint is durable when IPC resolves. Show the saved history
      // immediately while post-commit worktree classification continues in the
      // background; reloading Changes here would put that expensive status read
      // back onto the save interaction's visible path.
      manuallySelectedMode.current = false
      setChanges(null)
      setMode("history")
      onRefresh()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      checkpointInFlightRef.current = false
      setBusy(null)
    }
  }

  const enableVersioning = async () => {
    setBusy("enable")
    setError(null)
    try {
      const snapshot = await window.eidosLite.enableVersioning()
      setMode("history")
      onSpaceChange(snapshot)
      onRefresh()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(null)
    }
  }

  const restore = async () => {
    if (!selectedCommit || !historyHead) return
    setBusy("restore")
    setError(null)
    try {
      const snapshot = await window.eidosLite.restoreCheckpoint(
        selectedCommit.id,
        historyHead
      )
      onSpaceChange(snapshot)
      try {
        await onFilesMaterialized(snapshot)
      } catch (cause) {
        setError(
          `Space restored, but open Eidos Files could not refresh. ${errorMessage(cause)}`
        )
      }
      setConfirmRestore(false)
      setSelectedCommit(null)
      setSelectedDiff(null)
      clearInspection()
      onRefresh()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(null)
    }
  }

  const requestDiscard = (target: VersionChangeDiscardTarget) => {
    if (busy !== null || space.operation.phase !== "ready") return
    if (!changes?.currentHead || !changes.changeToken) {
      setError("Refresh Changes before discarding local edits")
      return
    }
    setError(null)
    setDiscardConfirmation({
      target,
      expectedHead: changes.currentHead,
      expectedChangeToken: changes.changeToken,
    })
  }

  const discardWorkingChanges = async () => {
    if (!discardConfirmation) return
    setBusy("discard")
    setError(null)
    try {
      const result = await window.eidosLite.discardWorkingChanges({
        target:
          discardConfirmation.target.kind === "all"
            ? { kind: "all" }
            : {
                kind: discardConfirmation.target.kind,
                path: discardConfirmation.target.path,
              },
        expectedHead: discardConfirmation.expectedHead,
        expectedChangeToken: discardConfirmation.expectedChangeToken,
      })
      clearInspection()
      onSpaceChange(result.snapshot)
      try {
        await onFilesMaterialized(result.snapshot, result.paths)
      } catch (cause) {
        setError(
          `Changes were discarded, but an open file could not refresh. ${errorMessage(cause)}`
        )
      }
      setDiscardConfirmation(null)
      setChanges(null)
      onRefresh()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(null)
    }
  }

  const changedRowCount = useMemo(
    () =>
      changes?.files.reduce((total, file) => total + fileRowChanges(file), 0) ??
      0,
    [changes]
  )
  const changedPathCount = changes?.totalPaths ?? changes?.paths.length ?? 0
  const hasLocalChanges = space.graft.clean === false || changedPathCount > 0

  const changeMode = (nextMode: PanelMode) => {
    manuallySelectedMode.current = true
    if (mode === nextMode) return
    modeRequestIdRef.current += 1
    selectionRequestIdRef.current += 1
    paginationRequestIdRef.current += 1
    modeLoadInFlightRef.current = null
    setMode(nextMode)
    setModeLoading(false)
    setSelectionLoading(false)
    setPaginationLoading(false)
    void window.eidosLite.cancelVersionReads().catch(() => undefined)
    setSelectedCommit(null)
    setSelectedDiff(null)
    setConfirmRestore(false)
    setDiscardConfirmation(null)
    clearInspection()
  }

  const loadMoreChanges = async () => {
    if (!changes?.hasMore || !changes.nextCursor) return
    const requestId = ++paginationRequestIdRef.current
    setPaginationLoading(true)
    setError(null)
    try {
      const next = await window.eidosLite.getVersionChanges(
        100,
        changes.nextCursor
      )
      setChanges((current) =>
        current ? mergeVersionDiffPages(current, next) : next
      )
    } catch (cause) {
      if (
        paginationRequestIdRef.current === requestId &&
        !isVersionReadAbortError(cause)
      ) {
        setError(errorMessage(cause))
      }
    } finally {
      if (paginationRequestIdRef.current === requestId) {
        setPaginationLoading(false)
      }
    }
  }

  const loadMoreHistory = async () => {
    if (!historyHasMore || !historyCursor) return
    const requestId = ++paginationRequestIdRef.current
    setPaginationLoading(true)
    setError(null)
    try {
      const next = await window.eidosLite.getVersionHistory(50, historyCursor)
      setCommits((current) => [
        ...current,
        ...next.commits.filter(
          (commit) => !current.some((existing) => existing.id === commit.id)
        ),
      ])
      setHistoryCursor(next.nextCursor ?? null)
      setHistoryHasMore(next.hasMore)
    } catch (cause) {
      if (
        paginationRequestIdRef.current === requestId &&
        !isVersionReadAbortError(cause)
      ) {
        setError(errorMessage(cause))
      }
    } finally {
      if (paginationRequestIdRef.current === requestId) {
        setPaginationLoading(false)
      }
    }
  }

  const loadMoreSelectedDiff = async () => {
    if (!selectedCommit || !selectedDiff?.hasMore || !selectedDiff.nextCursor) {
      return
    }
    const requestId = ++paginationRequestIdRef.current
    setPaginationLoading(true)
    setError(null)
    try {
      const next = await window.eidosLite.getVersionDiff(
        selectedCommit.id,
        selectedCommit.parent,
        100,
        selectedDiff.nextCursor
      )
      setSelectedDiff((current) =>
        current ? mergeVersionDiffPages(current, next) : next
      )
    } catch (cause) {
      if (
        paginationRequestIdRef.current === requestId &&
        !isVersionReadAbortError(cause)
      ) {
        setError(errorMessage(cause))
      }
    } finally {
      if (paginationRequestIdRef.current === requestId) {
        setPaginationLoading(false)
      }
    }
  }

  const hasCachedGraftStatus =
    space.graft.clean !== undefined ||
    space.graft.currentHead !== undefined ||
    space.graft.changeToken !== undefined

  if (
    space.graft.checking &&
    !space.graft.initialized &&
    !hasCachedGraftStatus
  ) {
    return (
      <aside
        className="version-panel version-panel-setup"
        aria-label="Space version management"
      >
        <header>
          <div>
            <FileClock aria-hidden="true" />
            <strong>Versions</strong>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close versions"
          >
            <X />
          </button>
        </header>
        <div className="version-loading" role="status">
          <LoaderCircle className="spin" /> Checking local history…
        </div>
      </aside>
    )
  }

  if (!space.graft.initialized) {
    return (
      <aside
        className="version-panel version-panel-setup"
        aria-label="Space version management"
        data-version-initialized="false"
      >
        <header>
          <div>
            <FileClock aria-hidden="true" />
            <strong>Versions</strong>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close versions"
          >
            <X />
          </button>
        </header>

        {error ? (
          <div className="version-error" role="alert">
            <CircleAlert />
            <span>{error}</span>
          </div>
        ) : null}

        <section className="version-setup-copy">
          <GitBranch aria-hidden="true" />
          <strong>Start local versions</strong>
          <p>
            Save the first version of this Space. This stays local and does not
            require an account.
          </p>
          <button
            type="button"
            className="panel-primary-action"
            data-enable-versioning
            disabled={busy !== null || space.operation.phase !== "ready"}
            onClick={() => void enableVersioning()}
          >
            {busy === "enable" ? (
              <LoaderCircle className="spin" />
            ) : (
              <GitBranch />
            )}
            {busy === "enable" ? "Enabling…" : "Enable versioning"}
          </button>
        </section>
      </aside>
    )
  }

  return (
    <aside
      className="version-panel"
      aria-label="Space version management"
      data-version-initialized="true"
    >
      <header>
        <div>
          <FileClock aria-hidden="true" />
          <strong>Versions</strong>
          {space.graft.checking ? (
            <span
              className="version-header-refresh"
              role="status"
              aria-label="Refreshing local changes"
              title="Refreshing local changes"
            >
              <LoaderCircle className="spin" aria-hidden="true" />
            </span>
          ) : null}
        </div>
        <div className="version-header-actions">
          <button
            type="button"
            className="icon-button"
            onClick={refreshVersionData}
            aria-label="Refresh versions"
            title="Refresh versions"
            disabled={modeLoading}
            data-refresh-versions
          >
            {modeLoading ? <LoaderCircle className="spin" /> : <RefreshCw />}
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close versions"
          >
            <X />
          </button>
        </div>
      </header>

      <div className="version-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "changes"}
          onClick={() => changeMode("changes")}
        >
          Changes
          {hasLocalChanges ? <span /> : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "history"}
          onClick={() => changeMode("history")}
        >
          History
        </button>
      </div>

      {error && !discardConfirmation ? (
        <div className="version-error" role="alert">
          <CircleAlert />
          <span>{error}</span>
        </div>
      ) : null}

      <div className={`version-panel-body version-panel-${mode}`}>
        {modeLoading && !changes && commits.length === 0 ? (
          <div className="version-loading" role="status">
            <LoaderCircle className="spin" /> Loading version data…
          </div>
        ) : mode === "changes" ? (
          <>
            <section className="version-summary">
              {hasLocalChanges ? <GitCommitHorizontal /> : <Check />}
              <div>
                <strong>
                  {hasLocalChanges
                    ? `${changedPathCount} changed ${changedPathCount === 1 ? "file" : "files"}${changedRowCount ? ` · ${changedRowCount} loaded row changes` : ""}`
                    : "No local changes"}
                </strong>
                <p>
                  {hasLocalChanges
                    ? "Select to review. Hover a file or folder for actions."
                    : "The Space matches its latest saved version."}
                </p>
              </div>
            </section>
            {changes && changes.paths.length ? (
              <div className="version-change-tree-shell">
                <VersionChangeTree
                  diff={changes}
                  selectedKey={selectedInspectionKey}
                  mode="changes"
                  onSelect={(inspection) => void inspect(inspection)}
                  onRequestDiscard={requestDiscard}
                  discardDisabled={
                    busy !== null || space.operation.phase !== "ready"
                  }
                />
                {changes.hasMore && changes.nextCursor ? (
                  <button
                    type="button"
                    className="version-load-more"
                    disabled={paginationLoading}
                    onClick={() => void loadMoreChanges()}
                  >
                    {paginationLoading ? "Loading…" : "Load more changed files"}
                  </button>
                ) : null}
              </div>
            ) : null}
            {hasLocalChanges ? (
              <section className="checkpoint-form">
                <label htmlFor="checkpoint-message">Version note</label>
                <input
                  id="checkpoint-message"
                  value={checkpointMessage}
                  maxLength={200}
                  placeholder="What changed? (optional)"
                  disabled={busy !== null}
                  onChange={(event) => setCheckpointMessage(event.target.value)}
                />
                <button
                  type="button"
                  className="panel-primary-action"
                  disabled={busy !== null || space.operation.phase !== "ready"}
                  onClick={() => void createCheckpoint()}
                >
                  {busy === "checkpoint" ? (
                    <LoaderCircle className="spin" />
                  ) : (
                    <GitCommitHorizontal />
                  )}
                  {busy === "checkpoint" ? "Saving…" : "Save version"}
                </button>
              </section>
            ) : null}
          </>
        ) : commits.length || space.graft.sync ? (
          <ol className="commit-list">
            {space.graft.sync ? (
              <HistorySyncSummary sync={space.graft.sync} />
            ) : null}
            {commits.map((commit) => {
              const expanded = selectedCommit?.id === commit.id
              const cloudCheckpoint = space.graft.sync?.remoteHead === commit.id
              const showCloudBoundary =
                cloudCheckpoint && space.graft.sync?.state === "ahead"
              return (
                <Fragment key={commit.id}>
                  {showCloudBoundary ? (
                    <li
                      className="history-cloud-boundary"
                      data-history-cloud-boundary
                    >
                      <span />
                      <Cloud aria-hidden="true" />
                      <small>Cloud is saved through this version</small>
                      <span />
                    </li>
                  ) : null}
                  <li
                    className={expanded ? "expanded" : ""}
                    data-cloud-checkpoint={cloudCheckpoint ? "true" : undefined}
                  >
                    <button
                      type="button"
                      className="commit-row"
                      aria-expanded={expanded}
                      onClick={() => void selectCommit(commit)}
                    >
                      {expanded ? <ChevronDown /> : <ChevronRight />}
                      <GitCommitHorizontal />
                      <span>
                        <span className="commit-title-line">
                          <strong>{commit.message}</strong>
                          {cloudCheckpoint ? (
                            <span
                              className="commit-cloud-marker"
                              title="Latest version known in the cloud"
                            >
                              <Cloud aria-hidden="true" /> Cloud
                            </span>
                          ) : null}
                        </span>
                        <small>
                          {commitTime(commit.timestampMs)} ·{" "}
                          {commit.fileCountKnown === false
                            ? "files on demand"
                            : `${commit.files} files`}
                        </small>
                      </span>
                    </button>
                    {expanded ? (
                      <div className="commit-expanded">
                        {selectionLoading && !selectedDiff ? (
                          <p className="commit-loading">
                            <LoaderCircle className="spin" /> Loading changes…
                          </p>
                        ) : selectedDiff ? (
                          <>
                            <HistoryDiffList
                              diff={selectedDiff}
                              commit={commit}
                              selectedKey={selectedInspectionKey}
                              onSelect={(inspection) =>
                                void inspect(inspection)
                              }
                            />
                            {selectedDiff.hasMore && selectedDiff.nextCursor ? (
                              <button
                                type="button"
                                className="version-load-more"
                                disabled={paginationLoading}
                                onClick={() => void loadMoreSelectedDiff()}
                              >
                                {paginationLoading
                                  ? "Loading…"
                                  : "Load more changed files"}
                              </button>
                            ) : null}
                          </>
                        ) : null}
                        <div className="commit-restore">
                          {commit.id === historyHead ? (
                            <p className="restore-note">
                              This is the current saved version.
                            </p>
                          ) : hasLocalChanges ? (
                            <p className="restore-note">
                              Save a version of local changes before restoring.
                            </p>
                          ) : confirmRestore ? (
                            <div className="restore-confirm">
                              <p>
                                Restore the entire Space to this version? A new
                                saved version will record the restore.
                              </p>
                              <div>
                                <button
                                  type="button"
                                  onClick={() => setConfirmRestore(false)}
                                  disabled={busy !== null}
                                >
                                  Keep current Space
                                </button>
                                <button
                                  type="button"
                                  className="danger-action"
                                  onClick={() => void restore()}
                                  disabled={busy !== null}
                                >
                                  {busy === "restore" ? (
                                    <LoaderCircle className="spin" />
                                  ) : (
                                    <RotateCcw />
                                  )}
                                  {busy === "restore"
                                    ? "Restoring…"
                                    : "Restore Space"}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="restore-action"
                              onClick={() => setConfirmRestore(true)}
                              disabled={
                                busy !== null ||
                                space.operation.phase !== "ready"
                              }
                            >
                              <RotateCcw /> Restore this version
                            </button>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </li>
                </Fragment>
              )
            })}
            {!commits.length ? (
              <li className="version-empty-copy">No saved versions yet.</li>
            ) : null}
            {historyHasMore && historyCursor ? (
              <li className="commit-load-more">
                <button
                  type="button"
                  className="version-load-more"
                  disabled={paginationLoading}
                  onClick={() => void loadMoreHistory()}
                >
                  {paginationLoading ? "Loading…" : "Load older versions"}
                </button>
              </li>
            ) : null}
          </ol>
        ) : (
          <p className="version-empty-copy">No saved versions yet.</p>
        )}
      </div>
      {discardConfirmation ? (
        <DiscardWorkingChangesDialog
          target={discardConfirmation.target}
          busy={busy === "discard"}
          error={error}
          onCancel={() => setDiscardConfirmation(null)}
          onConfirm={() => void discardWorkingChanges()}
        />
      ) : null}
    </aside>
  )
}
