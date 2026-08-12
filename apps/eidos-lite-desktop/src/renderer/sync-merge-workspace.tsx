import { lazy, Suspense, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  FileCode2,
  FileQuestion,
  GitMerge,
  LoaderCircle,
  RotateCcw,
  Save,
  ShieldCheck,
  X,
} from "lucide-react"

import type {
  EidosSyncMergeConflict,
  EidosSyncMergeContent,
  EidosSyncMergeFailure,
  EidosSyncMergePath,
  EidosSyncMergeResponse,
  EidosSyncMergeStatus,
  SpaceSnapshot,
  SpaceVersionTextContentDiff,
} from "../shared/contracts"
import type { ResolvedAppearance } from "./app-appearance"
import {
  MergeChangeTree,
  mergeConflictTableName,
  type MergeChangeTreeTarget,
} from "./merge-change-tree"
import { MergeTableDiff } from "./merge-table-diff"
import { InlineTextDiff } from "./version-text-diff"

const PierreTextEditorSurface = lazy(
  () => import("./pierre-text-editor-surface")
)

type ActiveMergeStatus = Extract<EidosSyncMergeStatus, { state: "merging" }>

type MergeBusy =
  | "status"
  | "plan"
  | "apply"
  | "path"
  | "resolve"
  | "continue"
  | "abort"
  | null

type TextResultSource = "ours" | "theirs" | "edited" | null

interface MergeConflictPageState {
  stateToken: string
  items: EidosSyncMergeConflict[]
  nextCursor: string | null
  loading: boolean
}

/**
 * The Sync inspector owns the safe, guarded transition into a merge. Once a
 * merge exists, conflict review moves to Changes and the main editor.
 */
export function SyncMergeWorkspace({
  onStatusChange,
  onReviewMerge,
  onSpaceChange,
}: {
  onStatusChange?(status: EidosSyncMergeStatus): void
  onReviewMerge?(): void
  onSpaceChange?(snapshot: SpaceSnapshot): void
}) {
  const [status, setStatus] = useState<EidosSyncMergeStatus>({ state: "none" })
  const [failure, setFailure] = useState<EidosSyncMergeFailure | null>(null)
  const [busy, setBusy] = useState<MergeBusy>("status")

  const accept = <T,>(response: EidosSyncMergeResponse<T>): T | null => {
    if (!response.ok) {
      setFailure(response.failure)
      return null
    }
    setFailure(null)
    return response.value
  }

  const publishStatus = (next: EidosSyncMergeStatus) => {
    setStatus(next)
    onStatusChange?.(next)
  }

  const refreshStatus = async () => {
    setBusy("status")
    if (typeof window.eidosLite.getSyncMergeStatus !== "function") {
      setBusy(null)
      return
    }
    const next = accept(await window.eidosLite.getSyncMergeStatus())
    if (next) publishStatus(next)
    setBusy(null)
  }

  useEffect(() => {
    void refreshStatus()
    // Durable state is reconstructed whenever the Sync inspector opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshRepository = async () => {
    const snapshot = await window.eidosLite.refreshSpace()
    if (snapshot) onSpaceChange?.(snapshot)
  }

  const startMerge = async () => {
    setBusy("plan")
    const plan = accept(await window.eidosLite.planSyncMerge())
    if (!plan) {
      setBusy(null)
      return
    }
    if (plan.kind === "up_to_date") {
      await refreshRepository()
      setBusy(null)
      return
    }
    setBusy("apply")
    const next = accept(
      await window.eidosLite.applySyncMerge({
        expectedHead: plan.expectedHead,
        planToken: plan.planToken,
      })
    )
    if (next) {
      publishStatus(next)
      if (next.state === "merging") {
        onReviewMerge?.()
      } else {
        await refreshRepository()
      }
    }
    setBusy(null)
  }

  return (
    <section className="sync-merge-workspace" data-sync-merge-workspace>
      <header className="sync-merge-header">
        <span className="sync-merge-icon">
          <GitMerge />
        </span>
        <div>
          <strong>Review and merge changes</strong>
          <p>
            Start here, then resolve conflicting files and tables in Changes.
          </p>
        </div>
      </header>

      {failure ? (
        <MergeAlert failure={failure} onReload={() => void refreshStatus()} />
      ) : null}

      {status.state === "none" ? (
        <MergeStart busy={busy} onStart={() => void startMerge()} />
      ) : (
        <div className="sync-merge-active-summary">
          <MergeIdentitySummary status={status} />
          <div className="sync-merge-active-copy">
            <div>
              <strong>
                {status.unmergedCount === 0
                  ? "Ready to complete"
                  : `${status.unmergedCount} ${status.unmergedCount === 1 ? "conflict" : "conflicts"} to resolve`}
              </strong>
              <p>
                Conflict files now appear in Changes. Select one there to use
                the full editor area.
              </p>
            </div>
            <button
              type="button"
              className="primary-action"
              data-sync-merge-review
              onClick={onReviewMerge}
            >
              <FileCode2 /> Review in Changes
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * Full merge editor. It deliberately renders as the two children expected by
 * editor-work-area: a main editor and a Changes-style right inspector.
 */
export function SyncMergeWorkbench({
  initialStatus,
  onClose,
  onStatusChange,
  onFilesMaterialized,
  theme,
}: {
  initialStatus: ActiveMergeStatus
  theme: ResolvedAppearance
  onClose(): void
  onStatusChange(status: EidosSyncMergeStatus): void
  onFilesMaterialized(
    snapshot: SpaceSnapshot,
    relativePaths?: readonly string[]
  ): void | Promise<void>
}) {
  const [status, setStatus] = useState<ActiveMergeStatus>(initialStatus)
  const [paths, setPaths] = useState<EidosSyncMergePath[]>([])
  const [pathsCursor, setPathsCursor] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<EidosSyncMergePath | null>(
    null
  )
  const [selectedTable, setSelectedTable] = useState<string | null>(null)
  const [selectedScope, setSelectedScope] =
    useState<MergeChangeTreeTarget["scope"]>("file")
  const [pendingRowResolution, setPendingRowResolution] = useState<{
    conflictId: string
    result: "ours" | "theirs"
  } | null>(null)
  const [pendingCellResolution, setPendingCellResolution] = useState<{
    conflictId: string
    column: string
    result: "ours" | "theirs"
  } | null>(null)
  const [pendingTableResolution, setPendingTableResolution] = useState<{
    table: string
    result: "ours" | "theirs"
  } | null>(null)
  const [conflictPages, setConflictPages] = useState<
    Map<string, MergeConflictPageState>
  >(() => new Map())
  const [versions, setVersions] = useState<EidosSyncMergeContent[]>([])
  const [textResult, setTextResult] = useState("")
  const [textResultSource, setTextResultSource] =
    useState<TextResultSource>(null)
  const [message, setMessage] = useState("Merge Hosted changes")
  const [showBase, setShowBase] = useState(false)
  const [failure, setFailure] = useState<EidosSyncMergeFailure | null>(null)
  const [busy, setBusy] = useState<MergeBusy>("status")

  const accept = <T,>(response: EidosSyncMergeResponse<T>): T | null => {
    if (!response.ok) {
      setFailure(response.failure)
      return null
    }
    setFailure(null)
    return response.value
  }

  const publishStatus = (next: EidosSyncMergeStatus) => {
    onStatusChange(next)
    if (next.state === "merging") setStatus(next)
  }

  const materialized = async (relativePaths: readonly string[]) => {
    const snapshot = await window.eidosLite.refreshSpace()
    if (snapshot) await onFilesMaterialized(snapshot, relativePaths)
  }

  const loadConflictSummaries = (
    merge: ActiveMergeStatus,
    mergePaths: readonly EidosSyncMergePath[],
    replace = true
  ) => {
    const sqlitePaths = mergePaths.filter(
      (path) => path.kind === "sqlite_database"
    )
    const pendingPages = new Map(
      sqlitePaths.map((path) => [
        path.path,
        {
          stateToken: merge.stateToken,
          items: [],
          nextCursor: null,
          loading: true,
        },
      ])
    )
    if (replace) {
      setConflictPages(pendingPages)
    } else {
      setConflictPages((current) => {
        const next = new Map(current)
        for (const [path, page] of pendingPages) next.set(path, page)
        return next
      })
    }

    void Promise.all(
      sqlitePaths.map(async (path) => {
        const response = await window.eidosLite.listSyncMergeConflicts({
          stateToken: merge.stateToken,
          path: path.path,
          limit: 100,
        })
        setConflictPages((current) => {
          const pending = current.get(path.path)
          if (pending?.stateToken !== merge.stateToken) return current
          const next = new Map(current)
          next.set(path.path, {
            stateToken: merge.stateToken,
            items: response.ok ? response.value.items : [],
            nextCursor: response.ok ? response.value.nextCursor : null,
            loading: false,
          })
          return next
        })
        if (!response.ok) setFailure(response.failure)
      })
    )
  }

  const loadPaths = async (
    merge: ActiveMergeStatus,
    preferredPath?: string
  ) => {
    const page = accept(
      await window.eidosLite.listSyncMergePaths({
        stateToken: merge.stateToken,
        filter: "all",
        limit: 100,
      })
    )
    if (!page) return
    setPaths(page.items)
    setPathsCursor(page.nextCursor)
    const requestedPath = preferredPath ?? selectedPath?.path
    const nextSelected =
      page.items.find((item) => item.path === requestedPath) ??
      page.items.find((item) => item.state === "unmerged") ??
      page.items[0] ??
      null
    if (nextSelected?.path !== selectedPath?.path) {
      setSelectedTable(null)
      setSelectedScope("file")
    }
    setSelectedPath(nextSelected)
    loadConflictSummaries(merge, page.items)
  }

  const refreshStatus = async (preferredPath?: string) => {
    setBusy("status")
    const next = accept(await window.eidosLite.getSyncMergeStatus())
    if (next) {
      publishStatus(next)
      if (next.state === "merging") await loadPaths(next, preferredPath)
    }
    setBusy(null)
  }

  useEffect(() => {
    publishStatus(initialStatus)
    void loadPaths(initialStatus)
    setBusy(null)
    // Initial durable state is supplied by App and loaded once on entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setTextResultSource(null)
    if (!selectedPath) {
      setVersions([])
      return
    }
    if (selectedPath.kind !== "text_file") {
      setVersions([])
      setBusy(null)
      return
    }
    let active = true
    setBusy("path")
    const load = async () => {
      const responses = await Promise.all(
        (["base", "ours", "theirs", "result"] as const).map((version) =>
          window.eidosLite.readSyncMergeVersion({
            stateToken: status.stateToken,
            path: selectedPath.path,
            version,
          })
        )
      )
      if (!active) return
      const loaded: EidosSyncMergeContent[] = []
      for (const response of responses) {
        const value = accept(response)
        if (!value) {
          setBusy(null)
          return
        }
        loaded.push(value)
      }
      setVersions(loaded)
      const result = loaded.find((item) => item.version === "result")
      const local = loaded.find((item) => item.version === "ours")
      setTextResult(
        result?.content.state === "utf8"
          ? result.content.content
          : local?.content.state === "utf8"
            ? local.content.content
            : ""
      )
      if (active) setBusy(null)
    }
    void load()
    return () => {
      active = false
    }
    // The token changes after every materializing choice and must reload the
    // selected path from the newest durable merge state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath?.path, status.stateToken])

  const updateAfterMutation = async (
    response: EidosSyncMergeResponse<EidosSyncMergeStatus>,
    materializedPaths: readonly string[],
    preferredPath?: string
  ) => {
    const next = accept(response)
    if (!next) {
      if (!response.ok && response.failure.code === "stale") {
        await refreshStatus(preferredPath)
        setFailure(response.failure)
      }
      return
    }
    publishStatus(next)
    await materialized(materializedPaths)
    if (next.state === "merging") await loadPaths(next, preferredPath)
  }

  const resolvePath = async (result: "ours" | "theirs") => {
    if (!selectedPath) return
    setBusy("resolve")
    await updateAfterMutation(
      await window.eidosLite.resolveSyncMergePath({
        stateToken: status.stateToken,
        path: selectedPath.path,
        result,
      }),
      [selectedPath.path],
      selectedPath.path
    )
    setBusy(null)
  }

  const resolveRow = async (
    conflict: EidosSyncMergeConflict,
    result: "ours" | "theirs"
  ) => {
    if (!selectedPath || !conflict.table) return
    const identity = conflictIdentity(conflict)
    if (identity === null) return
    setPendingRowResolution({ conflictId: conflict.id, result })
    setBusy("resolve")
    try {
      await updateAfterMutation(
        await window.eidosLite.resolveSyncMergeRow({
          stateToken: status.stateToken,
          path: selectedPath.path,
          table: conflict.table,
          identity,
          result,
        }),
        [selectedPath.path],
        selectedPath.path
      )
    } finally {
      setPendingRowResolution(null)
      setBusy(null)
    }
  }

  const resolveTable = async (table: string, result: "ours" | "theirs") => {
    if (!selectedPath) return
    setPendingTableResolution({ table, result })
    setBusy("resolve")
    try {
      await updateAfterMutation(
        await window.eidosLite.resolveSyncMergeTable({
          stateToken: status.stateToken,
          path: selectedPath.path,
          table,
          result,
        }),
        [selectedPath.path],
        selectedPath.path
      )
    } finally {
      setPendingTableResolution(null)
      setBusy(null)
    }
  }

  const resolveCell = async (
    conflict: EidosSyncMergeConflict,
    column: string,
    result: "ours" | "theirs"
  ) => {
    if (!selectedPath || !conflict.table) return
    const identity = conflictIdentity(conflict)
    if (identity === null) return
    setPendingCellResolution({ conflictId: conflict.id, column, result })
    setBusy("resolve")
    try {
      await updateAfterMutation(
        await window.eidosLite.resolveSyncMergeCell({
          stateToken: status.stateToken,
          path: selectedPath.path,
          table: conflict.table,
          identity,
          column,
          result,
        }),
        [selectedPath.path],
        selectedPath.path
      )
    } finally {
      setPendingCellResolution(null)
      setBusy(null)
    }
  }

  const unresolvePath = async () => {
    if (!selectedPath) return
    setBusy("resolve")
    try {
      await updateAfterMutation(
        await window.eidosLite.unresolveSyncMergePath({
          stateToken: status.stateToken,
          path: selectedPath.path,
        }),
        [selectedPath.path],
        selectedPath.path
      )
    } finally {
      setBusy(null)
    }
  }

  const saveText = async () => {
    if (!selectedPath) return
    setBusy("resolve")
    try {
      await updateAfterMutation(
        await window.eidosLite.writeSyncMergeText({
          stateToken: status.stateToken,
          path: selectedPath.path,
          content: textResult,
        }),
        [selectedPath.path],
        selectedPath.path
      )
    } finally {
      setBusy(null)
    }
  }

  const continueMerge = async () => {
    setBusy("continue")
    await updateAfterMutation(
      await window.eidosLite.continueSyncMerge({
        stateToken: status.stateToken,
        message,
      }),
      paths.map((item) => item.path)
    )
    setBusy(null)
  }

  const abortMerge = async () => {
    setBusy("abort")
    await updateAfterMutation(
      await window.eidosLite.abortSyncMerge(status.stateToken),
      paths.map((item) => item.path)
    )
    setBusy(null)
  }

  const loadMorePaths = async () => {
    if (!pathsCursor) return
    setBusy("path")
    const page = accept(
      await window.eidosLite.listSyncMergePaths({
        stateToken: status.stateToken,
        filter: "all",
        limit: 100,
        after: pathsCursor,
      })
    )
    if (page) {
      setPaths((current) => [...current, ...page.items])
      setPathsCursor(page.nextCursor)
      loadConflictSummaries(status, page.items, false)
    }
    setBusy(null)
  }

  const loadMoreConflicts = async () => {
    if (!selectedPath) return
    const currentPage = conflictPages.get(selectedPath.path)
    if (!currentPage?.nextCursor) return
    setBusy("path")
    const page = accept(
      await window.eidosLite.listSyncMergeConflicts({
        stateToken: status.stateToken,
        path: selectedPath.path,
        limit: 100,
        after: currentPage.nextCursor,
      })
    )
    if (page) {
      setConflictPages((current) => {
        const existing = current.get(selectedPath.path)
        if (existing?.stateToken !== status.stateToken) return current
        const next = new Map(current)
        next.set(selectedPath.path, {
          stateToken: status.stateToken,
          items: [...existing.items, ...page.items],
          nextCursor: page.nextCursor,
          loading: false,
        })
        return next
      })
    }
    setBusy(null)
  }

  const loading = busy !== null
  const selectedConflictPage = selectedPath
    ? conflictPages.get(selectedPath.path)
    : undefined
  const conflicts =
    selectedConflictPage?.stateToken === status.stateToken
      ? selectedConflictPage.items
      : []
  const conflictsByPath = useMemo(
    () =>
      new Map(
        [...conflictPages]
          .filter(([, page]) => page.stateToken === status.stateToken)
          .map(([path, page]) => [path, page.items] as const)
      ),
    [conflictPages, status.stateToken]
  )
  const selectedPathLoading =
    selectedPath?.kind === "sqlite_database" &&
    (selectedConflictPage?.stateToken !== status.stateToken ||
      selectedConflictPage.loading)
  const selectedIndex = selectedPath
    ? paths.findIndex((item) => item.path === selectedPath.path)
    : -1

  useEffect(() => {
    if (
      !selectedTable ||
      !selectedConflictPage ||
      selectedConflictPage.loading ||
      selectedConflictPage.stateToken !== status.stateToken
    ) {
      return
    }
    if (
      !selectedConflictPage.items.some((item) => item.table === selectedTable)
    ) {
      setSelectedTable(null)
    }
  }, [selectedConflictPage, selectedTable, status.stateToken])

  const selectTarget = (target: MergeChangeTreeTarget) => {
    setSelectedPath(target.path)
    setSelectedTable(target.table)
    setSelectedScope(target.scope)
  }

  const selectPath = (path: EidosSyncMergePath | null) => {
    setSelectedPath(path)
    setSelectedTable(null)
    setSelectedScope("file")
  }

  return (
    <>
      <main className="sync-merge-editor" data-sync-merge-workbench>
        <header className="sync-merge-editor-toolbar">
          <div className="sync-merge-editor-title">
            <MergePathIcon path={selectedPath} />
            <div>
              <strong>{selectedPath?.path ?? "Merge conflicts"}</strong>
              <span>
                {selectedTable
                  ? `${selectedTable} table`
                  : selectedScope === "structure"
                    ? "File structure"
                    : selectedPath?.state === "resolved"
                      ? "Resolved"
                      : `${status.unmergedCount} remaining`}
              </span>
            </div>
          </div>
          <MergeIdentitySummary status={status} compact />
          <div className="sync-merge-editor-actions">
            <button
              type="button"
              className="icon-button"
              aria-label="Previous conflict"
              disabled={selectedIndex <= 0}
              onClick={() => selectPath(paths[selectedIndex - 1] ?? null)}
            >
              <ChevronLeft />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Next conflict"
              disabled={selectedIndex < 0 || selectedIndex >= paths.length - 1}
              onClick={() => selectPath(paths[selectedIndex + 1] ?? null)}
            >
              <ChevronRight />
            </button>
            <button
              type="button"
              className="secondary-action sync-merge-base-toggle"
              aria-pressed={showBase}
              onClick={() => setShowBase((current) => !current)}
            >
              {showBase ? "Hide Base" : "Show Base"}
            </button>
            {selectedPath?.state === "resolved" ? (
              <button
                type="button"
                className="secondary-action sync-merge-unresolve"
                data-sync-merge-unresolve
                disabled={loading}
                onClick={() => void unresolvePath()}
              >
                <RotateCcw /> Undo resolution
              </button>
            ) : null}
          </div>
        </header>

        {failure ? (
          <MergeAlert
            failure={failure}
            onReload={() => void refreshStatus(selectedPath?.path)}
          />
        ) : null}

        <div className="sync-merge-editor-body">
          {busy === "status" || busy === "path" || selectedPathLoading ? (
            <p className="sync-merge-loading" role="status">
              <LoaderCircle className="spin" /> Loading conflict…
            </p>
          ) : selectedPath?.kind === "text_file" ? (
            <TextMergeResolution
              path={selectedPath}
              versions={versions}
              result={textResult}
              resultSource={textResultSource}
              disabled={loading}
              saving={busy === "resolve"}
              showBase={showBase}
              theme={theme}
              onUseVersion={(source, value) => {
                setTextResult(value)
                setTextResultSource(source)
              }}
              onEditResult={(value) => {
                setTextResult(value)
                setTextResultSource("edited")
              }}
              onSave={() => void saveText()}
            />
          ) : selectedPath?.kind === "sqlite_database" ? (
            <SqliteMergeResolution
              path={selectedPath}
              conflicts={conflicts}
              selectedTable={selectedTable}
              selectedScope={selectedScope}
              pendingResolution={pendingRowResolution}
              pendingCellResolution={pendingCellResolution}
              pendingTableResolution={pendingTableResolution}
              disabled={loading}
              showBase={showBase}
              onResolveRow={(conflict, result) =>
                void resolveRow(conflict, result)
              }
              onResolveCell={(conflict, column, result) =>
                void resolveCell(conflict, column, result)
              }
              onResolvePath={(result) => void resolvePath(result)}
              onResolveTable={(table, result) =>
                void resolveTable(table, result)
              }
              hasMore={selectedConflictPage?.nextCursor != null}
              onLoadMore={() => void loadMoreConflicts()}
            />
          ) : selectedPath ? (
            <BinaryMergeResolution
              path={selectedPath}
              disabled={loading}
              onResolve={(result) => void resolvePath(result)}
            />
          ) : (
            <div className="sync-merge-editor-empty">
              <GitMerge />
              <strong>No conflict selected</strong>
              <p>Select a file from Changes to review its versions.</p>
            </div>
          )}
        </div>
      </main>

      <aside
        className="version-panel sync-merge-changes-panel"
        aria-label="Merge changes"
      >
        <header>
          <div>
            <GitMerge />
            <strong>Changes</strong>
            {status.unmergedCount > 0 ? (
              <span className="sync-merge-count">{status.unmergedCount}</span>
            ) : null}
          </div>
          <div className="version-header-actions">
            <button
              type="button"
              className="icon-button"
              aria-label="Reload merge state"
              disabled={loading}
              onClick={() => void refreshStatus(selectedPath?.path)}
            >
              <RotateCcw />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Close Changes"
              onClick={onClose}
            >
              <X />
            </button>
          </div>
        </header>

        <div className="sync-merge-changes-summary">
          <span>MERGE</span>
          <strong>
            {status.unmergedCount === 0
              ? "All conflicts resolved"
              : `${status.unmergedCount} unresolved`}
          </strong>
        </div>

        <div className="version-panel-body sync-merge-changes-body">
          <MergeChangeTree
            paths={paths}
            conflictsByPath={conflictsByPath}
            selectedPath={selectedPath?.path ?? null}
            selectedTable={selectedTable}
            selectedScope={selectedScope}
            onSelect={selectTarget}
          />
          {pathsCursor ? (
            <button
              type="button"
              className="sync-merge-load-more"
              disabled={loading}
              onClick={() => void loadMorePaths()}
            >
              Load more files
            </button>
          ) : null}
        </div>

        <footer className="sync-merge-completion">
          <label>
            <span>Merge message</span>
            <input
              value={message}
              maxLength={200}
              onChange={(event) => setMessage(event.target.value)}
            />
          </label>
          <p>
            {status.unmergedCount > 0
              ? `Resolve ${status.unmergedCount} ${status.unmergedCount === 1 ? "conflict" : "conflicts"} to complete the merge.`
              : "All conflicts are staged and ready."}
          </p>
          <button
            type="button"
            className="primary-action"
            data-sync-merge-continue
            disabled={loading || status.unmergedCount > 0 || !message.trim()}
            onClick={() => void continueMerge()}
          >
            {busy === "continue" ? (
              <LoaderCircle className="spin" />
            ) : (
              <GitMerge />
            )}
            Complete Merge
          </button>
          <button
            type="button"
            className="sync-merge-abort"
            disabled={loading}
            onClick={() => void abortMerge()}
          >
            {busy === "abort" ? <LoaderCircle className="spin" /> : null}
            Abort Merge
          </button>
        </footer>
      </aside>
    </>
  )
}

function MergeAlert({
  failure,
  onReload,
}: {
  failure: EidosSyncMergeFailure
  onReload(): void
}) {
  return (
    <div
      className="sync-merge-alert"
      data-sync-merge-failure={failure.code}
      role="alert"
    >
      <AlertTriangle />
      <div>
        <strong>{failure.title}</strong>
        <p>{failure.message}</p>
      </div>
      {failure.retryable ? (
        <button type="button" onClick={onReload}>
          <RotateCcw /> Reload
        </button>
      ) : null}
    </div>
  )
}

function MergeStart({ busy, onStart }: { busy: MergeBusy; onStart(): void }) {
  return (
    <div className="sync-merge-empty">
      <p>
        Eidos first creates a guarded plan, then opens the conflict list in the
        main work area. Base, Local, and Hosted stay recoverable until you
        complete or abort.
      </p>
      <button
        type="button"
        className="primary-action"
        data-sync-merge-start
        disabled={busy !== null}
        onClick={onStart}
      >
        {busy === "plan" || busy === "apply" ? (
          <LoaderCircle className="spin" />
        ) : (
          <GitMerge />
        )}
        {busy === "plan"
          ? "Checking histories…"
          : busy === "apply"
            ? "Starting merge…"
            : "Start merge"}
      </button>
    </div>
  )
}

function MergeIdentitySummary({
  status,
  compact = false,
}: {
  status: ActiveMergeStatus
  compact?: boolean
}) {
  return (
    <dl className={`sync-merge-identities${compact ? " compact" : ""}`}>
      <div>
        <dt>Base</dt>
        <dd title={status.commonAncestor ?? "No common ancestor"}>
          {shortRevision(status.commonAncestor)}
        </dd>
      </div>
      <div>
        <dt>Local</dt>
        <dd title={status.localHead}>{shortRevision(status.localHead)}</dd>
      </div>
      <div>
        <dt>Hosted</dt>
        <dd title={status.hostedHead}>{shortRevision(status.hostedHead)}</dd>
      </div>
      {!compact ? (
        <div>
          <dt>Conflicts</dt>
          <dd>{status.unmergedCount}</dd>
        </div>
      ) : null}
    </dl>
  )
}

function MergePathIcon({ path }: { path: EidosSyncMergePath | null }) {
  if (path?.kind === "sqlite_database") return <Database />
  if (path?.kind === "text_file") return <FileCode2 />
  return <FileQuestion />
}

function TextMergeResolution({
  path,
  versions,
  result,
  resultSource,
  disabled,
  saving,
  showBase,
  theme,
  onUseVersion,
  onEditResult,
  onSave,
}: {
  path: EidosSyncMergePath
  versions: EidosSyncMergeContent[]
  result: string
  resultSource: TextResultSource
  disabled: boolean
  saving: boolean
  showBase: boolean
  theme: ResolvedAppearance
  onUseVersion(source: "ours" | "theirs", value: string): void
  onEditResult(value: string): void
  onSave(): void
}) {
  const resolved = path.state === "resolved"
  const text = (version: "base" | "ours" | "theirs") => {
    const content = versions.find((item) => item.version === version)?.content
    return content?.state === "utf8" ? content.content : ""
  }
  const display = (version: "base" | "ours" | "theirs") => {
    const content = versions.find((item) => item.version === version)?.content
    return content?.state === "utf8"
      ? content.content
      : `[${content?.state ?? "unavailable"}]`
  }
  const editable =
    !resolved &&
    versions.some(
      (item) => item.version === "result" && item.content.state === "utf8"
    )
  const resultSourceLabel =
    resultSource === "ours"
      ? "Local selected · Review, then Save & Stage"
      : resultSource === "theirs"
        ? "Hosted selected · Review, then Save & Stage"
        : resultSource === "edited"
          ? "Edited result · Review, then Save & Stage"
          : "Editable merge output"
  const diff = (
    afterVersion: "ours" | "theirs"
  ): SpaceVersionTextContentDiff => ({
    path: path.path,
    before:
      versions.find((item) => item.version === "base")?.content ??
      ({ state: "absent" } as const),
    after:
      versions.find((item) => item.version === afterVersion)?.content ??
      ({ state: "absent" } as const),
  })
  return (
    <section
      className="sync-merge-text-editor"
      data-sync-merge-text={path.path}
      data-sync-merge-path-state={path.state}
    >
      {resolved ? <ResolvedPathNotice title="Document resolved" /> : null}
      {showBase ? <MergeBaseReference value={display("base")} /> : null}
      <div className="sync-merge-input-grid">
        <section className="sync-merge-diff-pane" data-merge-version="local">
          <InlineTextDiff
            content={diff("ours")}
            theme={theme}
            title="Local changes"
            fixedLayout="unified"
            toolbarEnd={
              resolved ? undefined : (
                <button
                  type="button"
                  className="sync-merge-use-version"
                  disabled={disabled}
                  aria-pressed={resultSource === "ours"}
                  data-merge-selection={
                    resultSource === "ours" ? "selected" : undefined
                  }
                  onClick={() => onUseVersion("ours", text("ours"))}
                >
                  {resultSource === "ours" ? <Check /> : null}
                  {resultSource === "ours" ? "Using Local" : "Use Local"}
                </button>
              )
            }
          />
        </section>
        <section className="sync-merge-diff-pane" data-merge-version="hosted">
          <InlineTextDiff
            content={diff("theirs")}
            theme={theme}
            title="Hosted changes"
            fixedLayout="unified"
            toolbarEnd={
              resolved ? undefined : (
                <button
                  type="button"
                  className="sync-merge-use-version"
                  disabled={disabled}
                  aria-pressed={resultSource === "theirs"}
                  data-merge-selection={
                    resultSource === "theirs" ? "selected" : undefined
                  }
                  onClick={() => onUseVersion("theirs", text("theirs"))}
                >
                  {resultSource === "theirs" ? <Check /> : null}
                  {resultSource === "theirs" ? "Using Hosted" : "Use Hosted"}
                </button>
              )
            }
          />
        </section>
      </div>
      {resolved ? (
        <section className="sync-merge-result-pane sync-merge-staged-result">
          <header>
            <div>
              <strong>Staged result</strong>
              <span>Undo resolution to edit and stage a new result</span>
            </div>
          </header>
          <pre>{result}</pre>
        </section>
      ) : editable ? (
        <section className="sync-merge-result-pane">
          <header>
            <div>
              <strong>Result</strong>
              <span
                aria-live="polite"
                data-sync-merge-text-result-source={resultSource ?? "initial"}
              >
                {resultSourceLabel}
              </span>
            </div>
            <button
              type="button"
              className="primary-action"
              disabled={disabled}
              aria-busy={saving}
              onClick={onSave}
            >
              {saving ? (
                <>
                  <LoaderCircle className="spin" /> Saving…
                </>
              ) : (
                <>
                  <Save /> Save &amp; Stage
                </>
              )}
            </button>
          </header>
          <div className="sync-merge-result-editor" aria-disabled={disabled}>
            <Suspense
              fallback={
                <p className="sync-merge-loading">Loading result editor…</p>
              }
            >
              <PierreTextEditorSurface
                relativePath={path.path}
                content={result}
                theme={theme}
                persistEditorState={false}
                onChange={onEditResult}
              />
            </Suspense>
          </div>
        </section>
      ) : (
        <p className="sync-merge-unavailable">
          This result cannot be edited safely at its current size.
        </p>
      )}
    </section>
  )
}

function MergeBaseReference({ value }: { value: string }) {
  return (
    <section className="sync-merge-base-reference">
      <header>
        <strong>Base (Common Ancestor)</strong>
        <span>Read-only reference</span>
      </header>
      <pre>{value}</pre>
    </section>
  )
}

function ResolvedPathNotice({ title }: { title: string }) {
  return (
    <div className="sync-merge-resolved-notice">
      <Check />
      <div>
        <strong>{title}</strong>
        <span>The staged result remains reviewable until merge completes.</span>
      </div>
    </div>
  )
}

function readableMergeTerm(value: string | undefined): string {
  if (!value) return "Changed structure"
  return value
    .replaceAll(/[_-]+/g, " ")
    .replaceAll(/\b\w/g, (character) => character.toUpperCase())
}

function schemaSideChanges(
  conflict: EidosSyncMergeConflict,
  side: "ours" | "theirs"
) {
  return (conflict.columnChanges ?? []).filter((change) => {
    const normalized = change.side.toLowerCase()
    return side === "ours"
      ? normalized === "ours" || normalized === "local"
      : normalized === "theirs" || normalized === "hosted"
  })
}

function SchemaConflictSide({
  label,
  operation,
  changes,
}: {
  label: "Local" | "Hosted"
  operation: string | undefined
  changes: EidosSyncMergeConflict["columnChanges"]
}) {
  return (
    <section data-schema-conflict-side={label.toLowerCase()}>
      <header>{label}</header>
      <strong>{readableMergeTerm(operation)}</strong>
      {changes && changes.length > 0 ? (
        <ul>
          {changes.map((change, index) => (
            <li key={`${change.side}:${change.operation}:${index}`}>
              <span>{readableMergeTerm(change.operation)}</span>
              {change.from || change.to ? (
                <code>
                  {change.from ?? "∅"} → {change.to ?? "∅"}
                </code>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>No column-level detail was reported.</p>
      )}
    </section>
  )
}

function SchemaConflictReview({
  conflicts,
}: {
  conflicts: readonly EidosSyncMergeConflict[]
}) {
  const hasWholeFileRecommendation = conflicts.every(
    (conflict) =>
      conflict.autoResolvable &&
      (conflict.recommendedResult === "ours" ||
        conflict.recommendedResult === "theirs")
  )
  const hasPendingMergedCandidate = conflicts.some(
    (conflict) =>
      conflict.autoResolvable && conflict.recommendedResult === "merged"
  )
  return (
    <div className="sync-merge-schema-review" data-sync-merge-schema-review>
      <header>
        {hasWholeFileRecommendation ? <ShieldCheck /> : <AlertTriangle />}
        <div>
          <strong>
            {hasWholeFileRecommendation
              ? "Safe resolution available"
              : hasPendingMergedCandidate
                ? "Combined result unavailable"
                : `${conflicts.length} structure ${
                    conflicts.length === 1 ? "conflict" : "conflicts"
                  }`}
          </strong>
          <p>
            {hasWholeFileRecommendation
              ? "Hosted has no logical changes to apply. Keep Local to preserve the meaningful edits."
              : hasPendingMergedCandidate
                ? "The compatible candidate still needs a validation step that this build cannot complete. Choose one complete file; both versions remain recoverable."
                : "Review what changed on each side, then choose one complete Local or Hosted Eidos File. Row-level merging is unsafe for these items."}
          </p>
        </div>
      </header>
      <div className="sync-merge-schema-list">
        {conflicts.map((conflict) => {
          const localChanges = schemaSideChanges(conflict, "ours")
          const hostedChanges = schemaSideChanges(conflict, "theirs")
          const objectLabel =
            conflict.table ??
            conflict.name ??
            conflict.entryType ??
            "File structure"
          const hasWholeFileRecommendation =
            conflict.autoResolvable &&
            (conflict.recommendedResult === "ours" ||
              conflict.recommendedResult === "theirs")
          const hasPendingMergedCandidate =
            conflict.autoResolvable && conflict.recommendedResult === "merged"
          return (
            <article key={conflict.id} data-schema-conflict={conflict.id}>
              <header>
                <div>
                  <strong>{objectLabel}</strong>
                  <span>
                    {hasWholeFileRecommendation
                      ? "Safe recommendation"
                      : hasPendingMergedCandidate
                        ? "Needs validation"
                        : conflict.kind === "schema"
                          ? "Schema"
                          : "Opaque"}
                  </span>
                </div>
                <p>{readableMergeTerm(conflict.reason)}</p>
              </header>
              <div className="sync-merge-schema-versions">
                <section data-schema-conflict-side="base">
                  <header>Base</header>
                  <strong>Common ancestor</strong>
                  <p>
                    {conflict.entryType
                      ? `${readableMergeTerm(conflict.entryType)} structure before both edits.`
                      : "The shared structure used to detect these incompatible edits."}
                  </p>
                </section>
                {hasWholeFileRecommendation ? (
                  <>
                    <section data-schema-conflict-side="local">
                      <header>Local</header>
                      <strong>
                        {conflict.recommendedResult === "ours"
                          ? "Recommended result"
                          : "Changed version"}
                      </strong>
                      <p>Contains the meaningful logical changes.</p>
                    </section>
                    <section data-schema-conflict-side="hosted">
                      <header>Hosted</header>
                      <strong>
                        {conflict.recommendedResult === "theirs"
                          ? "Recommended result"
                          : "Logically equivalent to Base"}
                      </strong>
                      <p>Only SQLite storage bytes differ from the ancestor.</p>
                    </section>
                  </>
                ) : (
                  <>
                    <SchemaConflictSide
                      label="Local"
                      operation={conflict.oursOperation}
                      changes={localChanges}
                    />
                    <SchemaConflictSide
                      label="Hosted"
                      operation={conflict.theirsOperation}
                      changes={hostedChanges}
                    />
                  </>
                )}
              </div>
              {conflict.message ? (
                <p className="sync-merge-schema-message">{conflict.message}</p>
              ) : null}
            </article>
          )
        })}
      </div>
    </div>
  )
}

function SqliteMergeResolution({
  path,
  conflicts,
  selectedTable,
  selectedScope,
  pendingResolution,
  pendingCellResolution,
  pendingTableResolution,
  disabled,
  showBase,
  onResolveRow,
  onResolveCell,
  onResolvePath,
  onResolveTable,
  hasMore,
  onLoadMore,
}: {
  path: EidosSyncMergePath
  conflicts: EidosSyncMergeConflict[]
  selectedTable: string | null
  selectedScope: MergeChangeTreeTarget["scope"]
  pendingResolution: {
    conflictId: string
    result: "ours" | "theirs"
  } | null
  pendingCellResolution: {
    conflictId: string
    column: string
    result: "ours" | "theirs"
  } | null
  pendingTableResolution: {
    table: string
    result: "ours" | "theirs"
  } | null
  disabled: boolean
  showBase: boolean
  onResolveRow(
    conflict: EidosSyncMergeConflict,
    result: "ours" | "theirs"
  ): void
  onResolveCell(
    conflict: EidosSyncMergeConflict,
    column: string,
    result: "ours" | "theirs"
  ): void
  onResolvePath(result: "ours" | "theirs"): void
  onResolveTable(table: string, result: "ours" | "theirs"): void
  hasMore: boolean
  onLoadMore(): void
}) {
  const visibleConflicts =
    selectedScope === "structure"
      ? conflicts.filter(
          (item) => item.kind !== "row" && mergeConflictTableName(item) === null
        )
      : selectedTable
        ? conflicts.filter(
            (item) => mergeConflictTableName(item) === selectedTable
          )
        : conflicts
  const rows = visibleConflicts.filter((item) => item.kind === "row")
  const nonRows = visibleConflicts.filter((item) => item.kind !== "row")
  const recommendedResult = nonRows.find(
    (item) => item.autoResolvable && item.recommendedResult
  )?.recommendedResult
  const unsafeTables = new Set(
    nonRows.flatMap((item) => {
      const table = mergeConflictTableName(item)
      return table ? [table] : []
    })
  )
  return (
    <section
      className="sync-merge-sqlite-editor"
      data-sync-merge-eidos={path.path}
      data-sync-merge-path-state={path.state}
    >
      {path.state === "resolved" ? (
        <ResolvedPathNotice title="Eidos File resolved" />
      ) : null}
      {path.state === "unmerged" &&
      (selectedScope !== "table" || nonRows.length > 0) ? (
        <div className="sync-merge-file-resolution-actions">
          <span>
            {recommendedResult === "merged"
              ? "A combined result needs validation support unavailable in this build. Choose one complete file."
              : recommendedResult
                ? `Recommended: keep ${recommendedResult === "ours" ? "Local" : "Hosted"}`
                : nonRows.length > 0
                  ? "Choose after reviewing the structure conflict"
                  : "Use one complete Eidos File"}
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onResolvePath("ours")}
          >
            Use Local File{recommendedResult === "ours" ? " · Recommended" : ""}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onResolvePath("theirs")}
          >
            Use Hosted File
            {recommendedResult === "theirs" ? " · Recommended" : ""}
          </button>
        </div>
      ) : null}
      {rows.length > 0 || (selectedScope === "table" && nonRows.length > 0) ? (
        <MergeTableDiff
          conflicts={rows}
          schemaConflicts={nonRows}
          showBase={showBase}
          disabled={disabled}
          identityKey={`${path.path}:${selectedTable ?? "all"}`}
          pendingResolution={pendingResolution}
          pendingCellResolution={pendingCellResolution}
          pendingTableResolution={pendingTableResolution}
          unsafeTables={unsafeTables}
          onResolveRow={onResolveRow}
          onResolveCell={onResolveCell}
          onResolveTable={onResolveTable}
        />
      ) : null}
      {nonRows.length > 0 && selectedScope !== "table" ? (
        <SchemaConflictReview conflicts={nonRows} />
      ) : null}
      {hasMore ? (
        <button type="button" disabled={disabled} onClick={onLoadMore}>
          Load more conflicts
        </button>
      ) : null}
    </section>
  )
}

function BinaryMergeResolution({
  path,
  disabled,
  onResolve,
}: {
  path: EidosSyncMergePath
  disabled: boolean
  onResolve(result: "ours" | "theirs"): void
}) {
  if (path.state === "resolved") {
    return (
      <section
        className="sync-merge-binary-editor"
        data-sync-merge-binary={path.path}
        data-sync-merge-path-state="resolved"
      >
        <ResolvedPathNotice title="Binary file resolved" />
        <p>Undo resolution to choose the other complete version.</p>
      </section>
    )
  }
  return (
    <section
      className="sync-merge-binary-editor"
      data-sync-merge-binary={path.path}
    >
      <FileQuestion />
      <strong>Choose a complete binary version</strong>
      <p>
        Binary bytes cannot be combined safely. Eidos preserves both sides until
        you choose one or abort the merge.
      </p>
      <div className="sync-merge-binary-options">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onResolve("ours")}
        >
          <span>Local</span>
          <strong>Keep Current</strong>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onResolve("theirs")}
        >
          <span>Hosted</span>
          <strong>Accept Incoming</strong>
        </button>
      </div>
      <p className="sync-merge-binary-note">
        <ShieldCheck /> To preserve separate ordinary folders, abort and use
        Recovery Spaces from Sync.
      </p>
    </section>
  )
}

function conflictIdentity(
  conflict: EidosSyncMergeConflict
): number | Record<string, unknown> | null {
  if (conflict.key && Object.keys(conflict.key).length > 0) return conflict.key
  if (Number.isSafeInteger(conflict.rowid)) return conflict.rowid ?? null
  if (conflict.oursKey && Object.keys(conflict.oursKey).length > 0) {
    return conflict.oursKey
  }
  if (Number.isSafeInteger(conflict.oursRowid)) {
    return conflict.oursRowid ?? null
  }
  if (conflict.theirsKey && Object.keys(conflict.theirsKey).length > 0) {
    return conflict.theirsKey
  }
  return Number.isSafeInteger(conflict.theirsRowid)
    ? (conflict.theirsRowid ?? null)
    : null
}

function shortRevision(value: string | null): string {
  if (!value) return "None"
  return value.length > 12 ? value.slice(0, 12) : value
}
