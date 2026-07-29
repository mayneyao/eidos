import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileClock,
  GitCommitHorizontal,
  LoaderCircle,
  RotateCcw,
  X,
} from "lucide-react"

import type {
  SpaceSnapshot,
  SpaceVersionCommit,
  SpaceVersionDiff,
  SpaceVersionFileDiff,
  SpaceVersionRowChange,
  SpaceVersionTableDiff,
} from "../shared/contracts"

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
    <li className="row-diff">
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

export function TableDiff({ table }: { table: SpaceVersionTableDiff }) {
  const [requestedPage, setRequestedPage] = useState(0)
  const page = versionRowDiffPage(table.changes, requestedPage)

  useEffect(() => setRequestedPage(0), [table])

  return (
    <section>
      <h4>{table.name}</h4>
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

function FileDiff({ file }: { file: SpaceVersionFileDiff }) {
  const [expanded, setExpanded] = useState(false)
  const rowChanges = file.tables.reduce(
    (total, table) => total + table.changes.length,
    0
  )
  return (
    <li className="version-file">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown /> : <ChevronRight />}
        <span>
          <strong>{file.path}</strong>
          <small>
            {file.change}
            {rowChanges ? ` · ${rowChanges} row changes` : ""}
          </small>
        </span>
      </button>
      {expanded ? (
        <div className="version-file-detail">
          {file.tables.length ? (
            file.tables.map((table) => (
              <TableDiff key={table.name} table={table} />
            ))
          ) : (
            <p>
              {file.rowDiffAvailable
                ? "No logical row changes."
                : "Binary or ordinary file change."}
            </p>
          )}
          {file.limitations.map((limitation) => (
            <p key={limitation} className="version-limitation">
              {limitation}
            </p>
          ))}
        </div>
      ) : null}
    </li>
  )
}

function DiffSummary({ diff }: { diff: SpaceVersionDiff }) {
  const detailedPaths = new Set(diff.files.map((file) => file.path))
  return (
    <div className="diff-summary">
      {diff.paths.length === 0 ? (
        <p className="version-empty-copy">No changes in this comparison.</p>
      ) : (
        <ul className="version-files">
          {diff.files.map((file) => (
            <FileDiff key={file.path} file={file} />
          ))}
          {diff.paths
            .filter((change) => !detailedPaths.has(change.path))
            .map((change) => (
              <li key={change.path} className="ordinary-change">
                <span>{change.path}</span>
                <small>{change.change}</small>
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}

function commitTime(timestampMs: number): string {
  if (!timestampMs) return "Unknown time"
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestampMs))
}

export function VersionPanel({
  space,
  refreshKey,
  onClose,
  onSpaceChange,
  onRefresh,
}: {
  space: SpaceSnapshot
  refreshKey: number
  onClose(): void
  onSpaceChange(snapshot: SpaceSnapshot): void
  onRefresh(): void
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
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<"checkpoint" | "restore" | null>(null)
  const [checkpointMessage, setCheckpointMessage] = useState("")
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const selectCommit = async (commit: SpaceVersionCommit) => {
    setSelectedCommit(commit)
    setSelectedDiff(null)
    setConfirmRestore(false)
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
      onRefresh()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(null)
    }
  }

  const changedRowCount = useMemo(
    () =>
      changes?.files.reduce(
        (total, file) =>
          total +
          file.tables.reduce(
            (tableTotal, table) => tableTotal + table.changes.length,
            0
          ),
        0
      ) ?? 0,
    [changes]
  )

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
          onClick={() => setMode("changes")}
        >
          Changes
          {space.graft.clean === false ? <span /> : null}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "history"}
          onClick={() => setMode("history")}
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

      <div className="version-panel-body">
        {loading && !changes && commits.length === 0 ? (
          <div className="version-loading" role="status">
            <LoaderCircle className="spin" /> Loading version data…
          </div>
        ) : mode === "changes" ? (
          <>
            <section className="version-summary">
              {space.graft.clean ? (
                <>
                  <Check />
                  <div>
                    <strong>No local changes</strong>
                    <p>The Space matches its latest checkpoint.</p>
                  </div>
                </>
              ) : (
                <>
                  <GitCommitHorizontal />
                  <div>
                    <strong>
                      {changes?.paths.length ?? 0} files · {changedRowCount} row
                      changes
                    </strong>
                    <p>Changes include the whole Space, not only open files.</p>
                  </div>
                </>
              )}
            </section>
            {changes ? <DiffSummary diff={changes} /> : null}
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
        ) : (
          <>
            {commits.length ? (
              <ol className="commit-list">
                {commits.map((commit) => (
                  <li key={commit.id}>
                    <button
                      type="button"
                      className={
                        selectedCommit?.id === commit.id ? "selected" : ""
                      }
                      onClick={() => void selectCommit(commit)}
                    >
                      <GitCommitHorizontal />
                      <span>
                        <strong>{commit.message}</strong>
                        <small>
                          {commitTime(commit.timestampMs)} · {commit.files}{" "}
                          files
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="version-empty-copy">No checkpoints yet.</p>
            )}

            {selectedCommit ? (
              <section className="selected-commit">
                <header>
                  <div>
                    <Clock3 />
                    <span>
                      <strong>{selectedCommit.message}</strong>
                      <small>{selectedCommit.id.slice(0, 12)}</small>
                    </span>
                  </div>
                </header>
                {selectedDiff ? <DiffSummary diff={selectedDiff} /> : null}
                {selectedCommit.id === historyHead ? (
                  <p className="restore-note">
                    This is the current checkpoint.
                  </p>
                ) : space.graft.clean === false ? (
                  <p className="restore-note">
                    Create a checkpoint for local changes before restoring.
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
                        Cancel
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
                        {busy === "restore" ? "Restoring…" : "Restore Space"}
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
              </section>
            ) : null}
          </>
        )}
      </div>
    </aside>
  )
}
