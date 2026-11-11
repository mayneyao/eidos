import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Database,
  FileCode2,
  FileQuestion,
  FileX2,
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
} from "../shared/contracts"
import type { ResolvedAppearance } from "./app-appearance"
import {
  MergeChangeTree,
  mergeConflictTableName,
  requiresWholeFileChoice,
  type MergeChangeTreeTarget,
} from "./merge-change-tree"
import { MergeTableDiff } from "./merge-table-diff"
import { MergeStructureReview } from "./merge-structure-review"
import { InlineTextDiff } from "./version-text-diff"
import { useEidosLiteI18n } from "./i18n"

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

type TextResultSource = "edited" | null

interface MergeConflictPageState {
  stateToken: string
  items: EidosSyncMergeConflict[]
  nextCursor: string | null
  loading: boolean
}

/**
 * The Sync inspector owns the safe, guarded transition into a merge. Once a
 * merge exists, Sync keeps navigation while the main editor resolves conflicts.
 */
export function SyncMergeWorkspace({
  compact = false,
  externalStatus,
  onStatusChange,
  onReviewMerge,
  onSpaceChange,
  onFilesMaterialized,
  onBusyChange,
}: {
  compact?: boolean
  externalStatus?: EidosSyncMergeStatus
  onStatusChange?(status: EidosSyncMergeStatus): void
  onReviewMerge?(path?: string, table?: string): void
  onSpaceChange?(snapshot: SpaceSnapshot): void
  onFilesMaterialized?(
    snapshot: SpaceSnapshot,
    paths: readonly string[] | null
  ): void | Promise<void>
  onBusyChange?(busy: boolean): void
}) {
  const [status, setStatus] = useState<EidosSyncMergeStatus>(
    externalStatus ?? { state: "none" }
  )
  const { t } = useEidosLiteI18n()
  const [failure, setFailure] = useState<EidosSyncMergeFailure | null>(null)
  const [busy, setBusy] = useState<MergeBusy>(externalStatus ? null : "status")
  useEffect(() => onBusyChange?.(busy !== null), [busy, onBusyChange])
  const [message, setMessage] = useState("")
  const [operationError, setOperationError] = useState<string | null>(null)
  const [pathsCursor, setPathsCursor] = useState<string | null>(null)
  const [summaryPaths, setSummaryPaths] = useState<EidosSyncMergePath[]>([])
  const [summaryLoading, setSummaryLoading] = useState(
    externalStatus?.state === "merging"
  )
  const [summarySelection, setSummarySelection] =
    useState<MergeChangeTreeTarget | null>(null)
  const [summaryConflicts, setSummaryConflicts] = useState(
    new Map<string, EidosSyncMergeConflict[]>()
  )
  const summaryToken = status.state === "merging" ? status.stateToken : null
  useEffect(() => {
    let active = true
    if (!summaryToken) {
      setSummaryPaths([])
      setPathsCursor(null)
    }
    setSummaryLoading(Boolean(summaryToken))
    if (summaryToken && window.eidosLite.listSyncMergePaths) {
      void window.eidosLite
        .listSyncMergePaths({
          stateToken: summaryToken,
          filter: "all",
          limit: 50,
        })
        .then((response) => {
          if (!active) return
          if (response.ok) {
            setSummaryPaths(response.value.items)
            setPathsCursor(response.value.nextCursor)
          } else setFailure(response.failure)
        })
        .catch((cause) => {
          if (active) setOperationError(String(cause))
        })
        .finally(() => {
          if (active) setSummaryLoading(false)
        })
    }
    return () => {
      active = false
    }
  }, [summaryToken])
  useEffect(() => {
    setSummaryConflicts(new Map())
  }, [summaryToken])
  useEffect(() => {
    if (!summaryToken || summarySelection?.path.kind !== "sqlite_database")
      return
    let active = true
    const path = summarySelection.path.path
    const load = async () => {
      const items: EidosSyncMergeConflict[] = []
      let cursor: string | undefined
      do {
        const response = await window.eidosLite.listSyncMergeConflicts({
          stateToken: summaryToken,
          path,
          limit: 100,
          ...(cursor ? { after: cursor } : {}),
        })
        if (!active) return
        if (!response.ok) {
          setFailure(response.failure)
          return
        }
        items.push(...response.value.items)
        setSummaryConflicts((current) => new Map(current).set(path, [...items]))
        cursor = response.value.nextCursor ?? undefined
      } while (cursor && active)
    }
    void load().catch((cause) => {
      if (active) setOperationError(String(cause))
    })
    return () => {
      active = false
    }
  }, [summaryToken, summarySelection?.path.path, summarySelection?.path.kind])

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
    try {
      const next = accept(await window.eidosLite.getSyncMergeStatus())
      if (next) publishStatus(next)
    } catch (cause) {
      setOperationError(String(cause))
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    if (externalStatus) setStatus(externalStatus)
  }, [externalStatus])

  useEffect(() => {
    if (!externalStatus) void refreshStatus()
    // Durable state is reconstructed whenever the Sync inspector opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshRepository = async () => {
    const snapshot = await window.eidosLite.refreshSpace()
    if (snapshot) {
      onSpaceChange?.(snapshot)
      if (compact) await onFilesMaterialized?.(snapshot, null)
    }
  }

  const startMerge = async () => {
    setBusy("plan")
    setOperationError(null)
    try {
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
        if (next.state === "merging" && !compact) {
          onReviewMerge?.()
        } else {
          await refreshRepository()
        }
      }
    } catch (cause) {
      setOperationError(String(cause))
    } finally {
      setBusy(null)
    }
  }

  const finish = async (abort: boolean) => {
    if (status.state !== "merging") return
    setBusy(abort ? "abort" : "continue")
    setOperationError(null)
    try {
      const next = accept(
        await (abort
          ? window.eidosLite.abortSyncMerge(status.stateToken)
          : window.eidosLite.continueSyncMerge({
              stateToken: status.stateToken,
              message: message.trim() || "Merge remote updates",
            }))
      )
      if (next) {
        publishStatus(next)
        await refreshRepository()
      }
    } catch (cause) {
      setOperationError(String(cause))
    } finally {
      setBusy(null)
    }
  }
  const loadSummaryPage = async () => {
    if (status.state !== "merging" || !pathsCursor) return
    setBusy("path")
    try {
      const page = accept(
        await window.eidosLite.listSyncMergePaths({
          stateToken: status.stateToken,
          filter: "all",
          limit: 50,
          after: pathsCursor,
        })
      )
      if (page) {
        setSummaryPaths((current) => [...current, ...page.items])
        setPathsCursor(page.nextCursor)
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <section
      className={`sync-merge-workspace${compact ? " sync-merge-workspace-compact" : ""}`}
      data-sync-merge-workspace
    >
      {!compact ? (
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
      ) : null}

      {failure ? (
        <MergeAlert failure={failure} onReload={() => void refreshStatus()} />
      ) : null}
      {operationError ? <p role="alert">{operationError}</p> : null}

      {status.state === "none" ? (
        <MergeStart
          compact={compact}
          busy={busy}
          onStart={() => void startMerge()}
        />
      ) : (
        <div className="sync-merge-active-summary">
          {!compact ? <MergeIdentitySummary status={status} /> : null}
          <div className="sync-conflict-summary">
            {summaryLoading && summaryPaths.length === 0 ? (
              <p role="status">{t("Loading files…")}</p>
            ) : (
              <MergeChangeTree
                hideEmptyResolved={compact}
                paths={summaryPaths}
                conflictsByPath={summaryConflicts}
                selectedPath={summarySelection?.path.path ?? null}
                selectedTable={summarySelection?.table ?? null}
                selectedScope={summarySelection?.scope ?? "file"}
                onSelect={(target) => {
                  setSummarySelection(target)
                  onReviewMerge?.(target.path.path, target.table ?? undefined)
                }}
              />
            )}
            {pathsCursor ? (
              <button
                className="sync-inspector-link"
                disabled={busy !== null}
                onClick={() => void loadSummaryPage()}
              >
                {t("Load more files")}
              </button>
            ) : null}
          </div>
          {compact ? (
            <footer className="sync-merge-completion">
              <details className="sync-merge-message">
                <summary>{t("Merge message (optional)")}</summary>
                <input
                  aria-label={t("Merge message (optional)")}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={200}
                />
              </details>
              <button
                className="primary-action"
                data-sync-merge-continue
                disabled={busy !== null || status.unmergedCount > 0}
                onClick={() => void finish(false)}
              >
                {t("Complete Merge")}
              </button>
              <button
                className="sync-inspector-link"
                disabled={busy !== null}
                onClick={() => void finish(true)}
              >
                {t("Abort merge")}
              </button>
            </footer>
          ) : (
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
                onClick={() => onReviewMerge?.()}
              >
                <FileCode2 /> Review in Changes
              </button>
            </div>
          )}
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
  mainOnly = false,
  initialStatus,
  initialPath,
  initialTable,
  onNavigate,
  onClose,
  onStatusChange,
  onFilesMaterialized,
  theme,
  titlebarNavigation,
}: {
  initialStatus: ActiveMergeStatus
  mainOnly?: boolean
  initialPath?: string
  initialTable?: string
  onNavigate?: (path: string, table?: string) => void
  theme: ResolvedAppearance
  titlebarNavigation?: ReactNode
  onClose(): void
  onStatusChange(status: EidosSyncMergeStatus): void
  onFilesMaterialized(
    snapshot: SpaceSnapshot,
    relativePaths?: readonly string[]
  ): void | Promise<void>
}) {
  const [status, setStatus] = useState<ActiveMergeStatus>(initialStatus)
  const statusRef = useRef(initialStatus)
  const observedStatusTokenRef = useRef(initialStatus.stateToken)
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
  const [conflictRefreshKey, setConflictRefreshKey] = useState(0)
  const conflictPagesRef = useRef(conflictPages)
  conflictPagesRef.current = conflictPages
  const [versions, setVersions] = useState<EidosSyncMergeContent[]>([])
  const [textResult, setTextResult] = useState("")
  const [textResultSource, setTextResultSource] =
    useState<TextResultSource>(null)
  const [message, setMessage] = useState("Merge incoming changes")
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
    if (next.state === "merging") {
      statusRef.current = next
      setStatus(next)
    }
    onStatusChange(next)
  }

  const materialized = async (relativePaths: readonly string[]) => {
    // Every merge materialization returns only after the main process has
    // rebuilt and broadcast its authoritative Space snapshot. Read that
    // cached snapshot instead of forcing a second repository status scan and
    // directory reload for the same operation.
    const snapshot = await window.eidosLite.getSpace()
    if (snapshot) await onFilesMaterialized(snapshot, relativePaths)
  }

  const loadPaths = async (
    merge: ActiveMergeStatus,
    preferredPath?: string
  ) => {
    const response = await window.eidosLite.listSyncMergePaths({
      stateToken: merge.stateToken,
      filter: "all",
      limit: 100,
    })
    if (statusRef.current.stateToken !== merge.stateToken) return
    const page = accept(response)
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
    void loadPaths(initialStatus, initialPath).then(() => {
      if (initialTable) {
        setSelectedTable(initialTable)
        setSelectedScope("table")
      }
    })
    setBusy(null)
    // Initial durable state is supplied by App and loaded once on entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (initialStatus.stateToken === observedStatusTokenRef.current) return
    if (initialStatus.stateToken === statusRef.current.stateToken) {
      observedStatusTokenRef.current = initialStatus.stateToken
      return
    }
    if (busy) return
    if (textResultSource === "edited") {
      setFailure({
        code: "stale",
        title: "Merge changed",
        message:
          "The merge changed while you were editing. Your draft is preserved; reload when you are ready to review the latest state.",
        localSafe: true,
        retryable: true,
      })
      return
    }
    observedStatusTokenRef.current = initialStatus.stateToken
    statusRef.current = initialStatus
    setStatus(initialStatus)
    setFailure(null)
    setBusy("status")
    void loadPaths(initialStatus).finally(() => setBusy(null))
    // Parent recovery may advance the durable merge after this workspace mounts.
    // Our own mutations update statusRef before notifying the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStatus.stateToken, busy, textResultSource])

  useEffect(() => {
    if (!selectedPath || selectedPath.kind !== "sqlite_database") return
    const relativePath = selectedPath.path
    const stateToken = status.stateToken
    const cached = conflictPagesRef.current.get(relativePath)
    if (cached?.stateToken === stateToken) return

    let active = true
    const pending = new Map(conflictPagesRef.current)
    pending.set(relativePath, {
      stateToken,
      items: [],
      nextCursor: null,
      loading: true,
    })
    conflictPagesRef.current = pending
    setConflictPages(pending)

    const load = async () => {
      const response = await window.eidosLite.listSyncMergeConflicts({
        stateToken,
        path: relativePath,
        limit: 100,
      })
      if (!active) return
      const current = conflictPagesRef.current
      if (current.get(relativePath)?.stateToken !== stateToken) return
      const next = new Map(current)
      next.set(relativePath, {
        stateToken,
        items: response.ok ? response.value.items : [],
        nextCursor: response.ok ? response.value.nextCursor : null,
        loading: false,
      })
      conflictPagesRef.current = next
      setConflictPages(next)
      if (!response.ok) setFailure(response.failure)
    }
    void load()
    return () => {
      active = false
    }
  }, [
    selectedPath?.kind,
    selectedPath?.path,
    status.stateToken,
    conflictRefreshKey,
  ])

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
      setTextResult(
        result?.content.state === "utf8" ? result.content.content : ""
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
    const remainingPages = new Map(conflictPagesRef.current)
    for (const path of materializedPaths) remainingPages.delete(path)
    conflictPagesRef.current = remainingPages
    setConflictPages(remainingPages)
    setConflictRefreshKey((key) => key + 1)
    await materialized(materializedPaths)
    if (next.state === "merging") await loadPaths(next, preferredPath)
  }

  const resolvePath = async (result: "ours" | "theirs") => {
    if (!selectedPath) return
    setBusy("resolve")
    try {
      await updateAfterMutation(
        await window.eidosLite.resolveSyncMergePath({
          stateToken: status.stateToken,
          path: selectedPath.path,
          result,
        }),
        [selectedPath.path],
        selectedPath.path
      )
    } finally {
      setBusy(null)
    }
  }

  const combinePath = async () => {
    if (!selectedPath) return
    setBusy("resolve")
    try {
      await updateAfterMutation(
        await window.eidosLite.combineSyncMergePath({
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
    onNavigate?.(target.path.path, target.table ?? undefined)
    setSelectedPath(target.path)
    setSelectedTable(target.table)
    setSelectedScope(target.scope)
  }

  const selectPath = (path: EidosSyncMergePath | null) => {
    if (path) onNavigate?.(path.path)
    setSelectedPath(path)
    setSelectedTable(null)
    setSelectedScope("file")
  }

  return (
    <>
      <main className="sync-merge-editor" data-sync-merge-workbench>
        <header className="sync-merge-editor-toolbar">
          {titlebarNavigation}
          <div className="file-titlebar-identity sync-merge-editor-title">
            <MergePathIcon path={selectedPath} />
            <div>
              <strong>{selectedPath?.path ?? "Merge conflicts"}</strong>
              <span>
                {selectedPath?.state === "resolved"
                  ? "Resolved"
                  : requiresWholeFileChoice(conflicts)
                    ? "File structure"
                    : selectedTable
                      ? `${selectedTable} table`
                      : selectedScope === "structure"
                        ? "File structure"
                        : `${status.unmergedCount} remaining`}
              </span>
            </div>
            <button
              type="button"
              className="icon-button active-file-close"
              onClick={onClose}
              aria-label="Close merge view"
              title="Close merge view"
            >
              <X />
            </button>
          </div>
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
            <div className="sync-merge-base-slot">
              {selectedPath?.kind === "text_file" ? (
                <details
                  key={selectedPath.path}
                  className="merge-secondary-details sync-merge-base-menu"
                >
                  <summary>Base</summary>
                  <MergeBaseReference
                    value={mergeVersionPreview(
                      versions.find((item) => item.version === "base")?.content
                    )}
                  />
                </details>
              ) : selectedPath?.kind === "sqlite_database" ? (
                <button
                  type="button"
                  className="secondary-action sync-merge-base-toggle"
                  aria-pressed={showBase}
                  onClick={() => setShowBase((current) => !current)}
                >
                  {showBase ? "Hide Base" : "Show Base"}
                </button>
              ) : null}
            </div>
            <button
              type="button"
              className="icon-button sync-merge-unresolve"
              data-sync-merge-unresolve
              aria-label="Undo resolution"
              title="Undo resolution"
              disabled={loading || selectedPath?.state !== "resolved"}
              onClick={() => void unresolvePath()}
            >
              <RotateCcw />
            </button>
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
              theme={theme}
              onUseVersion={(source) => void resolvePath(source)}
              onEditResult={(value) => {
                setTextResult(value)
                setTextResultSource("edited")
              }}
              onSave={() => void saveText()}
            />
          ) : selectedPath?.kind === "sqlite_database" ? (
            <SqliteMergeResolution
              path={selectedPath}
              stateToken={status.stateToken}
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
              onCombinePath={() => void combinePath()}
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
              <p>Select a file from Sync to review its versions.</p>
            </div>
          )}
        </div>
      </main>

      {!mainOnly ? (
        <aside
          className="version-panel sync-merge-changes-panel"
          aria-label="Merge changes"
        >
          <header>
            <div>
              <GitMerge />
              <strong>Sync</strong>
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
      ) : null}
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

function MergeStart({
  busy,
  onStart,
  compact = false,
}: {
  busy: MergeBusy
  onStart(): void
  compact?: boolean
}) {
  const { t } = useEidosLiteI18n()
  return (
    <div className="sync-merge-empty">
      {compact ? null : (
        <p>
          Eidos first creates a guarded plan, then opens the conflict list in
          the main work area. Base, Local, and Hosted stay recoverable until you
          complete or abort.
        </p>
      )}
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
          ? t("Checking histories…")
          : busy === "apply"
            ? t("Receiving and merging…")
            : t("Receive and merge")}
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

function mergeVersionPreview(
  content: EidosSyncMergeContent["content"] | undefined
): string {
  if (content?.state === "utf8") return content.content
  return content?.state === "absent" ? "File deleted" : "Preview unavailable"
}

function MergeTextVersionPane({
  source,
  path,
  versions,
  resolved,
  disabled,
  theme,
  onUseVersion,
}: {
  source: "ours" | "theirs"
  path: string
  versions: EidosSyncMergeContent[]
  resolved: boolean
  disabled: boolean
  theme: ResolvedAppearance
  onUseVersion(source: "ours" | "theirs"): void
}) {
  const { t } = useEidosLiteI18n()
  const content = versions.find((item) => item.version === source)?.content ?? {
    state: "absent",
  }
  const title = t(source === "ours" ? "Local changes" : "Incoming changes")
  const action = resolved ? undefined : (
    <button
      type="button"
      className="sync-merge-use-version"
      disabled={disabled}
      onClick={() => onUseVersion(source)}
    >
      {t(source === "ours" ? "Use Local" : "Use Incoming")}
    </button>
  )
  return (
    <section
      className="sync-merge-diff-pane"
      data-merge-version={source === "ours" ? "local" : "hosted"}
    >
      {content.state === "absent" ? (
        <div className="version-text-diff">
          <header className="version-inspector-diff-bar version-text-diff-toolbar">
            <div>
              <strong>{title}</strong>
              <span>{t("File deleted")}</span>
            </div>
            {action}
          </header>
          <div className="sync-merge-deleted-version">
            <FileX2 aria-hidden="true" />
            <strong>{t("File deleted")}</strong>
            <span>{t("This version deletes the file")}</span>
          </div>
        </div>
      ) : (
        <InlineTextDiff
          content={{
            path,
            before: versions.find((item) => item.version === "base")
              ?.content ?? { state: "absent" },
            after: content,
          }}
          theme={theme}
          title={title}
          fixedLayout="unified"
          fixedSoftWrap
          toolbarEnd={action}
        />
      )}
    </section>
  )
}

function TextMergeResolution({
  path,
  versions,
  result,
  resultSource,
  disabled,
  saving,
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
  theme: ResolvedAppearance
  onUseVersion(source: "ours" | "theirs"): void
  onEditResult(value: string): void
  onSave(): void
}) {
  const { t } = useEidosLiteI18n()
  const [editingResult, setEditingResult] = useState(false)
  useEffect(() => setEditingResult(false), [path.path])
  const resolved = path.state === "resolved"
  const resultContent = versions.find(
    (item) => item.version === "result"
  )?.content
  const editable = !resolved && resultContent?.state === "utf8"
  const resultSourceLabel =
    resultSource === "edited"
      ? "Unsaved changes"
      : "Combine both versions in the editor"
  return (
    <section
      className="sync-merge-text-editor"
      data-sync-merge-text={path.path}
      data-sync-merge-path-state={path.state}
    >
      {resolved ? <ResolvedPathNotice title="Document resolved" /> : null}
      <div className="sync-merge-input-grid">
        {(["ours", "theirs"] as const).map((source) => (
          <MergeTextVersionPane
            key={source}
            source={source}
            path={path.path}
            versions={versions}
            resolved={resolved}
            disabled={disabled}
            theme={theme}
            onUseVersion={onUseVersion}
          />
        ))}
      </div>
      {resolved ? (
        <details className="sync-merge-result-disclosure">
          <summary>{t("Resolved result")}</summary>
          <section className="sync-merge-result-pane sync-merge-staged-result">
            <pre>
              {resultContent?.state === "absent"
                ? t("File deleted")
                : resultContent?.state === "utf8"
                  ? result
                  : t("Preview unavailable")}
            </pre>
          </section>
        </details>
      ) : editable ? (
        <details
          className="sync-merge-result-disclosure"
          open={editingResult}
          onToggle={(event) => setEditingResult(event.currentTarget.open)}
        >
          <summary>{t("Edit result")}</summary>
          {editingResult ? (
            <section className="sync-merge-result-pane">
              <header>
                <div>
                  <span
                    aria-live="polite"
                    data-sync-merge-text-result-source={
                      resultSource ?? "initial"
                    }
                  >
                    {t(resultSourceLabel)}
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
                      <Save /> {t("Save resolution")}
                    </>
                  )}
                </button>
              </header>
              <div
                className="sync-merge-result-editor"
                aria-disabled={disabled}
              >
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
                    autoFocus
                    onChange={onEditResult}
                  />
                </Suspense>
              </div>
            </section>
          ) : null}
        </details>
      ) : resultContent?.state !== "absent" ? (
        <p className="sync-merge-unavailable">
          {t("Choose a version to resolve this file")}
        </p>
      ) : null}
    </section>
  )
}

function MergeBaseReference({ value }: { value: string }) {
  const { t } = useEidosLiteI18n()
  return (
    <section className="sync-merge-base-reference">
      <header>
        <strong>{t("Base (Common Ancestor)")}</strong>
        <span>{t("Read-only reference")}</span>
      </header>
      <pre>{value}</pre>
    </section>
  )
}

function ResolvedPathNotice({ title }: { title: string }) {
  const { t } = useEidosLiteI18n()
  return (
    <div className="sync-merge-resolved-notice">
      <Check />
      <div>
        <strong>{t(title)}</strong>
        <span>{t("You can undo this choice before completing the merge")}</span>
      </div>
    </div>
  )
}

function SqliteMergeResolution({
  path,
  stateToken,
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
  onCombinePath,
  onResolveTable,
  hasMore,
  onLoadMore,
}: {
  path: EidosSyncMergePath
  stateToken: string
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
  onCombinePath(): void
  onResolveTable(table: string, result: "ours" | "theirs"): void
  hasMore: boolean
  onLoadMore(): void
}) {
  if (requiresWholeFileChoice(conflicts)) {
    return (
      <section
        className="sync-merge-sqlite-editor"
        data-sync-merge-eidos={path.path}
        data-sync-merge-path-state={path.state}
      >
        {path.state === "resolved" ? (
          <ResolvedPathNotice title="Eidos File resolved" />
        ) : null}
        <MergeStructureReview
          key={path.path}
          path={path}
          stateToken={stateToken}
          conflicts={conflicts}
          showBase={showBase}
          disabled={disabled}
          onResolvePath={onResolvePath}
        />
        {hasMore ? (
          <button type="button" disabled={disabled} onClick={onLoadMore}>
            Load more conflicts
          </button>
        ) : null}
      </section>
    )
  }
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
  const canCombine =
    rows.length === 0 &&
    nonRows.length > 0 &&
    nonRows.every(
      (item) => item.autoResolvable && item.recommendedResult === "merged"
    )
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
      {path.state === "resolved" && rows.length === 0 ? (
        <ResolvedPathNotice title="Eidos File resolved" />
      ) : null}
      {path.state === "unmerged" && canCombine ? (
        <div className="sync-merge-file-resolution-actions">
          <span>Combine the compatible changes from both versions.</span>
          <button type="button" disabled={disabled} onClick={onCombinePath}>
            Merge automatically
          </button>
        </div>
      ) : null}
      {path.state === "unmerged" &&
      (selectedScope !== "table" || nonRows.length > 0) ? (
        <details
          className="merge-file-options"
          open={(nonRows.length > 0 && !canCombine) || undefined}
        >
          <summary>Whole file options</summary>
          <div className="sync-merge-file-resolution-actions">
            <span>
              {recommendedResult === "merged"
                ? "Or replace the result with one complete file."
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
              Use Local File
              {recommendedResult === "ours" ? " · Recommended" : ""}
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
        </details>
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
