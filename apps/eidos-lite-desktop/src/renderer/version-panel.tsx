import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Database,
  FileClock,
  FileText,
  GitCommitHorizontal,
  LoaderCircle,
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
  SpaceVersionRowChange,
  SpaceVersionTableDiff,
} from "../shared/contracts"
import {
  VersionChangeTree,
  type VersionInspection,
} from "./version-change-tree"

type PanelMode = "changes" | "history"

const VERSION_ROW_DIFF_PAGE_SIZE = 100

export function versionRowDiffPage<T>(
  changes: readonly T[],
  requestedPage: number,
  pageSize = VERSION_ROW_DIFF_PAGE_SIZE
) {
  const safePageSize = Number.isFinite(pageSize)
    ? Math.max(1, Math.trunc(pageSize))
    : VERSION_ROW_DIFF_PAGE_SIZE
  const pageCount = Math.max(1, Math.ceil(changes.length / safePageSize))
  const page = Number.isFinite(requestedPage)
    ? Math.max(0, Math.min(Math.trunc(requestedPage), pageCount - 1))
    : 0
  const start = page * safePageSize
  const end = Math.min(start + safePageSize, changes.length)
  return {
    items: changes.slice(start, end),
    page,
    pageCount,
    start,
    end,
    total: changes.length,
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function displayValue(value: unknown): string {
  if (value === null) return "null"
  if (value === undefined) return "—"
  if (typeof value === "string") return value || '""'
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function rowChangeTitle(change: SpaceVersionRowChange): string {
  const key = Object.values(change.key).map(displayValue).join(" · ")
  return `${change.op} row${key ? ` · ${key}` : ""}`
}

function RowDiff({
  columns,
  change,
}: {
  columns: string[]
  change: SpaceVersionRowChange
}) {
  const values = change.values ?? []
  const oldValues = change.oldValues ?? []
  const changedColumns = columns.filter((_, index) => {
    if (change.op !== "update") return values[index] !== undefined
    return displayValue(values[index]) !== displayValue(oldValues[index])
  })
  return (
    <li className="row-diff" data-row-change={change.op}>
      <strong>{rowChangeTitle(change)}</strong>
      {changedColumns.length ? (
        <dl>
          {changedColumns.map((column) => {
            const index = columns.indexOf(column)
            return (
              <div key={column}>
                <dt>{column}</dt>
                <dd>
                  {change.op === "update" ? (
                    <>
                      <del>{displayValue(oldValues[index])}</del>
                      <span aria-hidden="true">→</span>
                    </>
                  ) : null}
                  <ins>{displayValue(values[index])}</ins>
                </dd>
              </div>
            )
          })}
        </dl>
      ) : null}
    </li>
  )
}

export function TableDiff({
  table,
  showHeading = true,
}: {
  table: SpaceVersionTableDiff
  showHeading?: boolean
}) {
  const [requestedPage, setRequestedPage] = useState(0)
  const page = versionRowDiffPage(table.changes, requestedPage)

  useEffect(() => setRequestedPage(0), [table])

  return (
    <section className="table-diff">
      {showHeading ? <h4>{table.name}</h4> : null}
      <ul>
        {page.items.map((change, index) => (
          <RowDiff
            key={`${change.op}-${page.start + index}`}
            columns={table.columns}
            change={change}
          />
        ))}
      </ul>
      {page.pageCount > 1 ? (
        <nav className="row-diff-pagination" aria-label={`${table.name} rows`}>
          <button
            type="button"
            disabled={page.page === 0}
            onClick={() => setRequestedPage(page.page - 1)}
            aria-label="Previous row changes"
          >
            <ChevronLeft />
          </button>
          <span>
            {page.start + 1}–{page.end} of {page.total.toLocaleString()}
          </span>
          <button
            type="button"
            disabled={page.page >= page.pageCount - 1}
            onClick={() => setRequestedPage(page.page + 1)}
            aria-label="Next row changes"
          >
            <ChevronRight />
          </button>
        </nav>
      ) : null}
    </section>
  )
}

function commitTime(timestampMs: number): string {
  if (!timestampMs) return "Unknown time"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestampMs))
}

function fileName(path: string): string {
  return path.split("/").at(-1) ?? path
}

function fileParent(path: string): string {
  const segments = path.split("/")
  return segments.length > 1 ? segments.slice(0, -1).join("/") : "Space root"
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
  return file.tables.reduce((total, table) => total + table.changes.length, 0)
}

export function VersionDiffPreview({
  inspection,
  onClose,
}: {
  inspection: VersionInspection
  onClose(): void
}) {
  const title =
    inspection.type === "table"
      ? inspection.table.name
      : fileName(inspection.change.path)
  const contextLabel =
    inspection.mode === "changes"
      ? "Latest checkpoint → Local changes"
      : inspection.commit
        ? `${inspection.commit.id.slice(0, 8)} · ${commitTime(inspection.commit.timestampMs)}`
        : "Version changes"

  return (
    <section
      className="version-inspector"
      aria-label={`Change details for ${title}`}
      data-version-inspector={inspection.type}
    >
      <header className="version-inspector-bar">
        <div>
          <span>{inspection.mode === "changes" ? "Changes" : "History"}</span>
          <ChevronRight aria-hidden="true" />
          <span>{fileName(inspection.change.path)}</span>
          {inspection.type === "table" ? (
            <>
              <ChevronRight aria-hidden="true" />
              <strong>{inspection.table.name}</strong>
            </>
          ) : null}
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close change details"
          title="Return to the Eidos File editor"
        >
          <X />
        </button>
      </header>

      <div className="version-inspector-scroll">
        <header className="version-inspector-heading">
          <div>
            {inspection.type === "table" ? <Table2 /> : <FileText />}
            <span>
              <h2>{title}</h2>
              <p>{contextLabel}</p>
            </span>
          </div>
          <span
            className="version-change-label"
            data-change={changeLabel(inspection.change.change).toLowerCase()}
          >
            {changeLabel(inspection.change.change)}
          </span>
        </header>

        {inspection.type === "table" ? (
          <>
            <div className="version-inspector-stats">
              {(() => {
                const stats = tableStats(inspection.table)
                return (
                  <>
                    <span data-change="added">+{stats.inserts} rows</span>
                    <span data-change="deleted">−{stats.deletes} rows</span>
                    <span data-change="modified">~{stats.updates} rows</span>
                    <small>{stats.total} total changes</small>
                  </>
                )
              })()}
            </div>
            <div className="version-inspector-table">
              <TableDiff table={inspection.table} showHeading={false} />
            </div>
          </>
        ) : inspection.file?.tables.length ? (
          <div className="version-inspector-file-summary">
            <p>
              {inspection.file.tables.length} changed{" "}
              {inspection.file.tables.length === 1 ? "table" : "tables"} ·{" "}
              {fileRowChanges(inspection.file)} row changes
            </p>
            <ul>
              {inspection.file.tables.map((table) => {
                const stats = tableStats(table)
                return (
                  <li key={table.name}>
                    <Table2 />
                    <strong>{table.name}</strong>
                    <span>
                      {stats.inserts ? `+${stats.inserts}` : ""}
                      {stats.deletes ? ` −${stats.deletes}` : ""}
                      {stats.updates ? ` ~${stats.updates}` : ""}
                    </span>
                  </li>
                )
              })}
            </ul>
            {inspection.file.limitations.map((limitation) => (
              <p key={limitation} className="version-limitation">
                {limitation}
              </p>
            ))}
          </div>
        ) : (
          <div className="version-inspector-empty">
            <FileText />
            <div>
              <strong>File change recorded</strong>
              <p>
                This first version shows file metadata only. Content preview can
                be added without changing the Space history model.
              </p>
              <dl>
                <div>
                  <dt>Path</dt>
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
                <small>{fileParent(change.path)}</small>
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
  onRefresh,
  onInspectionChange,
}: {
  space: SpaceSnapshot
  refreshKey: number
  onClose(): void
  onSpaceChange(snapshot: SpaceSnapshot): void
  onRefresh(): void
  onInspectionChange(inspection: VersionInspection | null): void
}) {
  const [mode, setMode] = useState<PanelMode>(
    space.graft.clean === false ? "changes" : "history"
  )
  const [changes, setChanges] = useState<SpaceVersionDiff | null>(null)
  const [commits, setCommits] = useState<SpaceVersionCommit[]>([])
  const [historyHead, setHistoryHead] = useState<string | null>(null)
  const [selectedCommit, setSelectedCommit] =
    useState<SpaceVersionCommit | null>(null)
  const [selectedDiff, setSelectedDiff] = useState<SpaceVersionDiff | null>(
    null
  )
  const [selectedInspectionKey, setSelectedInspectionKey] = useState<
    string | null
  >(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<"checkpoint" | "restore" | null>(null)
  const [checkpointMessage, setCheckpointMessage] = useState("")
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const clearInspection = useCallback(() => {
    setSelectedInspectionKey(null)
    onInspectionChange(null)
  }, [onInspectionChange])

  const inspect = useCallback(
    (inspection: VersionInspection) => {
      setSelectedInspectionKey(inspection.key)
      onInspectionChange(inspection)
    },
    [onInspectionChange]
  )

  const loadMode = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      if (mode === "changes") {
        setChanges(await window.eidosLite.getVersionChanges())
      } else {
        const history = await window.eidosLite.getVersionHistory(50)
        setCommits(history.commits)
        setHistoryHead(history.currentHead)
        setSelectedCommit((current) =>
          current
            ? (history.commits.find((commit) => commit.id === current.id) ??
              null)
            : null
        )
      }
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => {
    void loadMode()
  }, [loadMode, refreshKey, space.graft.clean, space.graft.currentHead])

  useEffect(() => {
    clearInspection()
  }, [clearInspection, mode, refreshKey])

  const selectCommit = async (commit: SpaceVersionCommit) => {
    if (selectedCommit?.id === commit.id) {
      setSelectedCommit(null)
      setSelectedDiff(null)
      setConfirmRestore(false)
      clearInspection()
      return
    }
    setSelectedCommit(commit)
    setSelectedDiff(null)
    setConfirmRestore(false)
    clearInspection()
    setLoading(true)
    setError(null)
    try {
      setSelectedDiff(
        await window.eidosLite.getVersionDiff(commit.id, commit.parent)
      )
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setLoading(false)
    }
  }

  const createCheckpoint = async () => {
    setBusy("checkpoint")
    setError(null)
    try {
      const snapshot = await window.eidosLite.createCheckpoint(
        checkpointMessage.trim() || undefined
      )
      onSpaceChange(snapshot)
      setCheckpointMessage("")
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

  const changedRowCount = useMemo(
    () =>
      changes?.files.reduce((total, file) => total + fileRowChanges(file), 0) ??
      0,
    [changes]
  )

  const changeMode = (nextMode: PanelMode) => {
    if (mode === nextMode) return
    setMode(nextMode)
    setSelectedCommit(null)
    setSelectedDiff(null)
    setConfirmRestore(false)
    clearInspection()
  }

  return (
    <aside className="version-panel" aria-label="Space version management">
      <header>
        <div>
          <FileClock aria-hidden="true" />
          <strong>Version history</strong>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close version history"
        >
          <X />
        </button>
      </header>

      <div className="version-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "changes"}
          onClick={() => changeMode("changes")}
        >
          Changes
          {space.graft.clean === false ? <span /> : null}
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

      {error ? (
        <div className="version-error" role="alert">
          <CircleAlert />
          <span>{error}</span>
        </div>
      ) : null}

      <div className={`version-panel-body version-panel-${mode}`}>
        {loading && !changes && commits.length === 0 ? (
          <div className="version-loading" role="status">
            <LoaderCircle className="spin" /> Loading version data…
          </div>
        ) : mode === "changes" ? (
          <>
            <section className="version-summary">
              {space.graft.clean ? <Check /> : <GitCommitHorizontal />}
              <div>
                <strong>
                  {space.graft.clean
                    ? "No local changes"
                    : `${changes?.paths.length ?? 0} files · ${changedRowCount} row changes`}
                </strong>
                <p>
                  {space.graft.clean
                    ? "The Space matches its latest checkpoint."
                    : "Select a file or changed table to review it."}
                </p>
              </div>
            </section>
            {changes && changes.paths.length ? (
              <div className="version-change-tree-shell">
                <VersionChangeTree
                  diff={changes}
                  selectedKey={selectedInspectionKey}
                  mode="changes"
                  onSelect={inspect}
                />
              </div>
            ) : null}
            {space.graft.clean === false ? (
              <section className="checkpoint-form">
                <label htmlFor="checkpoint-message">Checkpoint message</label>
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
                  {busy === "checkpoint" ? "Creating…" : "Create checkpoint"}
                </button>
              </section>
            ) : null}
          </>
        ) : commits.length ? (
          <ol className="commit-list">
            {commits.map((commit) => {
              const expanded = selectedCommit?.id === commit.id
              return (
                <li key={commit.id} className={expanded ? "expanded" : ""}>
                  <button
                    type="button"
                    className="commit-row"
                    aria-expanded={expanded}
                    onClick={() => void selectCommit(commit)}
                  >
                    {expanded ? <ChevronDown /> : <ChevronRight />}
                    <GitCommitHorizontal />
                    <span>
                      <strong>{commit.message}</strong>
                      <small>
                        {commitTime(commit.timestampMs)} · {commit.files} files
                      </small>
                    </span>
                  </button>
                  {expanded ? (
                    <div className="commit-expanded">
                      {loading && !selectedDiff ? (
                        <p className="commit-loading">
                          <LoaderCircle className="spin" /> Loading changes…
                        </p>
                      ) : selectedDiff ? (
                        <HistoryDiffList
                          diff={selectedDiff}
                          commit={commit}
                          selectedKey={selectedInspectionKey}
                          onSelect={inspect}
                        />
                      ) : null}
                      <div className="commit-restore">
                        {commit.id === historyHead ? (
                          <p className="restore-note">
                            This is the current checkpoint.
                          </p>
                        ) : space.graft.clean === false ? (
                          <p className="restore-note">
                            Create a checkpoint for local changes before
                            restoring.
                          </p>
                        ) : confirmRestore ? (
                          <div className="restore-confirm">
                            <p>
                              Restore the entire Space to this checkpoint? A new
                              checkpoint will record the restore.
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
                              busy !== null || space.operation.phase !== "ready"
                            }
                          >
                            <RotateCcw /> Restore this checkpoint
                          </button>
                        )}
                      </div>
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="version-empty-copy">No checkpoints yet.</p>
        )}
      </div>
    </aside>
  )
}
