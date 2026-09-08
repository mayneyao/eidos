import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import {
  ArrowDown,
  ArrowUp,
  Check,
  Cloud,
  CloudOff,
  FileText,
  GitMerge,
  LoaderCircle,
  UserRound,
  X,
} from "lucide-react"
import type {
  EidosSyncAction,
  EidosSyncFailure,
  EidosSyncMergeStatus,
  EidosSyncProgress,
  SpaceSnapshot,
  SpaceSyncHistoryStatus,
  SpaceVersionCommit,
} from "../shared/contracts"
import { useEidosLiteI18n } from "./i18n"
import { SyncMergeWorkspace } from "./sync-merge-workspace"

export interface SyncInspectorState {
  history?: SpaceSyncHistoryStatus
  dirty: boolean
  busy: boolean
  progress: EidosSyncProgress | null
  failure: EidosSyncFailure | null
  readOnly: boolean
  storageBlocked: boolean
  checking: boolean
}

export function syncInspectorAction(
  state: SyncInspectorState
): EidosSyncAction | "review" | "merge" | "account" {
  if (state.storageBlocked && !state.history?.behind) return "account"
  if (state.history?.behind) {
    if (state.dirty) return "review"
    return state.history.ahead ? "merge" : "pull"
  }
  if (state.history?.ahead && !state.readOnly) return "push"
  return "fetch"
}

// History summaries are bounded metadata. Only show a known contiguous prefix,
// never fill a missing remote history with unrelated local commits.
export function pendingVersionPreview(
  commits: SpaceVersionCommit[],
  head: string | undefined,
  stop: string | undefined,
  count: number
) {
  const byId = new Map(commits.map((commit) => [commit.id, commit]))
  const result: SpaceVersionCommit[] = []
  const visited = new Set<string>()
  while (
    head &&
    head !== stop &&
    result.length < Math.min(count, 10) &&
    !visited.has(head)
  ) {
    visited.add(head)
    const commit = byId.get(head)
    if (!commit) break
    result.push(commit)
    if ((commit.parents?.length ?? 0) > 1) break
    head = commit.parent ?? undefined
  }
  return result
}

export function SyncInspector({
  state,
  account,
  spaceKey,
  onClose,
  onAction,
  onRetry,
  onReview,
  onAccount,
  onMergeStatusChange,
  mergeStatus,
  onReviewMerge,
  onSpaceChange,
  onFilesMaterialized,
  onLocalRecovery,
  onRemoteRecovery,
}: {
  state: SyncInspectorState
  account?(props: {
    buttonRef: RefObject<HTMLButtonElement>
    expanded: boolean
    onToggle(): void
  }): ReactNode
  spaceKey: string
  onClose(): void
  onAction(action: EidosSyncAction): void
  onRetry(): void
  onReview?(): void
  onAccount(): void
  onMergeStatusChange?(status: EidosSyncMergeStatus): void
  mergeStatus?: EidosSyncMergeStatus
  onReviewMerge?(path?: string, table?: string): void
  onSpaceChange?(snapshot: SpaceSnapshot): void
  onFilesMaterialized?(
    snapshot: SpaceSnapshot,
    paths: readonly string[] | null
  ): void | Promise<void>
  onLocalRecovery?(): void
  onRemoteRecovery?(): void
}) {
  const { t } = useEidosLiteI18n()
  const [commits, setCommits] = useState<SpaceVersionCommit[]>([])
  const [listState, setListState] = useState<"loading" | "ready" | "error">(
    "ready"
  )
  const [settings, setSettings] = useState(false)
  const settingsRef = useRef<HTMLElement>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!settings) return
    const dismiss = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !settingsRef.current?.contains(event.target) &&
        !settingsButtonRef.current?.contains(event.target)
      )
        setSettings(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation()
        setSettings(false)
        settingsButtonRef.current?.focus()
      }
    }
    document.addEventListener("pointerdown", dismiss)
    document.addEventListener("keydown", escape, true)
    return () => {
      document.removeEventListener("pointerdown", dismiss)
      document.removeEventListener("keydown", escape, true)
    }
  }, [settings])
  const [merge, setMerge] = useState<EidosSyncMergeStatus>({ state: "none" })
  useEffect(() => {
    if (mergeStatus) setMerge(mergeStatus)
  }, [mergeStatus])
  const history = state.history
  useEffect(() => {
    let alive = true
    if (window.eidosLite.getSyncMergeStatus) {
      void window.eidosLite
        .getSyncMergeStatus()
        .then((response) => {
          if (alive && response.ok) setMerge(response.value)
        })
        .catch(() => undefined)
    }
    return () => {
      alive = false
    }
  }, [spaceKey])
  const active = state.progress?.state === "active" || state.busy
  const action = syncInspectorAction(state)
  const merging = merge.state === "merging" || action === "merge"
  useEffect(() => {
    let alive = true
    setCommits([])
    if (
      !(history?.ahead || history?.behind) ||
      state.failure ||
      !window.eidosLite.getVersionHistory
    ) {
      setListState("ready")
      return
    }
    setListState("loading")
    void window.eidosLite
      .getVersionHistory(50)
      .then((page) => {
        if (alive) {
          setCommits(page.commits)
          setListState("ready")
        }
      })
      .catch(() => {
        if (alive) setListState("error")
      })
    return () => {
      alive = false
    }
  }, [
    spaceKey,
    history?.localHead,
    history?.remoteHead,
    history?.checkedAtMs,
    history?.ahead,
    history?.behind,
    state.failure,
  ])
  const title =
    state.failure?.title ??
    (active
      ? t("Sync operation in progress")
      : state.checking
        ? t("Checking remote updates…")
        : merging
          ? merge.state === "merging"
            ? merge.unmergedCount > 0
              ? t("Resolve merge conflicts")
              : t("All conflicts resolved")
            : t("Local and remote both have updates")
          : action === "review"
            ? t("Save local changes before receiving")
            : history?.behind
              ? t("{count} versions to receive", { count: history.behind })
              : history?.ahead
                ? t("{count} versions to upload", { count: history.ahead })
                : history?.checkedAtMs && history.state === "up_to_date"
                  ? t("Versions are up to date")
                  : t("Remote updates have not been checked"))
  const label =
    action === "push"
      ? t("Upload {count} versions", { count: history?.ahead ?? 0 })
      : action === "pull"
        ? t("Receive {count} versions", { count: history?.behind ?? 0 })
        : action === "review"
          ? t("Review local changes")
          : action === "account"
            ? t("Manage storage")
            : t("Check remote updates")
  const Icon =
    state.failure?.state === "offline"
      ? CloudOff
      : active
        ? LoaderCircle
        : merging
          ? GitMerge
          : history?.behind
            ? ArrowDown
            : history?.ahead
              ? ArrowUp
              : history?.checkedAtMs
                ? Check
                : Cloud
  const transfer = state.progress?.transfer
  const run = () => {
    if (action === "review") onReview?.()
    else if (action === "account") onAccount()
    else if (action !== "merge") onAction(action)
  }
  const renderVersions = (direction: "upload" | "receive", count: number) => {
    if (!count) return null
    const versions = pendingVersionPreview(
      commits,
      direction === "upload" ? history?.localHead : history?.remoteHead,
      history?.commonAncestor,
      count
    )
    return (
      <section className="sync-version-group" key={direction}>
        <h3>
          {t(
            direction === "upload"
              ? "Versions to upload"
              : "Versions to receive"
          )}{" "}
          <span>{count}</span>
        </h3>
        {versions.map((version) => (
          <div className="sync-version-row" key={version.id}>
            <FileText aria-hidden="true" />
            <div>
              <strong title={version.message}>
                {version.message || version.id.slice(0, 8)}
              </strong>
              <small>{new Date(version.timestampMs).toLocaleString()}</small>
            </div>
          </div>
        ))}
        {listState === "loading" ? (
          <p role="status">{t("Loading versions…")}</p>
        ) : versions.length < count ? (
          <button className="sync-inspector-link" onClick={onReview}>
            {t("Versions")}
          </button>
        ) : null}
      </section>
    )
  }
  return (
    <div className="sync-inspector-host">
      <aside
        className="sync-inspector-b"
        role="complementary"
        aria-label={t("Sync")}
        data-sync-design="b"
        data-active-merge={merge.state === "merging"}
      >
        <header>
          <div className="sync-inspector-heading">
            <strong>{t("Sync")}</strong>
            <small
              title={`${t("Last checked")}: ${history?.checkedAtMs ? new Date(history.checkedAtMs).toLocaleString() : t("Not checked")}`}
            >
              <span className="sync-checked-label">{t("Last checked")}: </span>
              <span className="sync-checked-full">
                {history?.checkedAtMs
                  ? new Date(history.checkedAtMs).toLocaleTimeString()
                  : t("Not checked")}
              </span>
              <span className="sync-checked-compact" aria-hidden="true">
                {history?.checkedAtMs
                  ? new Date(history.checkedAtMs).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: false,
                    })
                  : "—"}
              </span>
            </small>
          </div>
          {account ? (
            account({
              buttonRef: settingsButtonRef,
              expanded: settings,
              onToggle: () => setSettings(!settings),
            })
          ) : (
            <button
              ref={settingsButtonRef}
              className="icon-button"
              onClick={() => setSettings(!settings)}
              aria-label={t("Account menu")}
              aria-expanded={settings}
            >
              <UserRound />
            </button>
          )}
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t("Close Eidos Sync")}
          >
            <X />
          </button>
        </header>
        <div className="sync-inspector-b-status" aria-live="polite">
          <Icon aria-hidden="true" className={active ? "spin" : undefined} />
          <h2>{title}</h2>
          {merge.state === "merging" ? (
            <p>
              {t("{count} files remaining", { count: merge.unmergedCount })}
            </p>
          ) : history ? (
            <p className="sync-version-counts" data-sync-version-counts>
              <span>
                {t("Local to upload")}: <strong>{history.ahead ?? "—"}</strong>
              </span>
              <span>
                {t("Remote to receive")}:{" "}
                <strong>{history.behind ?? "—"}</strong>
              </span>
            </p>
          ) : null}
          {state.failure ? (
            <p>{state.failure.message}</p>
          ) : merging ? (
            <p>
              {t(
                merge.state === "merging"
                  ? "Review the merge before completing."
                  : "Compatible changes merge automatically. Only conflicts need your attention."
              )}
            </p>
          ) : state.readOnly ? (
            <p>{t("Download only")}</p>
          ) : null}
          {active ? (
            <div className="sync-inspector-transfer" role="status">
              <progress
                max={transfer?.totalBytes || undefined}
                value={
                  transfer?.totalBytes ? transfer.transferredBytes : undefined
                }
              />
              <small>
                {transfer
                  ? `${(transfer.transferredBytes / 1048576).toFixed(1)} MB${transfer.totalBytes ? ` / ${(transfer.totalBytes / 1048576).toFixed(1)} MB` : ""}`
                  : t("Working…")}
              </small>
            </div>
          ) : state.failure ? (
            <button className="primary-action" onClick={onRetry}>
              {state.failure.actionLabel || t("Retry")}
            </button>
          ) : !merging ? (
            <button
              className="primary-action"
              data-sync-next={action}
              disabled={
                state.busy ||
                state.checking ||
                (action === "review" && !onReview)
              }
              onClick={run}
            >
              {label}
            </button>
          ) : null}
          {!active && !state.failure && action !== "fetch" && !merging ? (
            <button
              className="sync-inspector-link"
              onClick={() => onAction("fetch")}
            >
              {t("Check remote updates")}
            </button>
          ) : null}
        </div>
        <div className="sync-inspector-b-content">
          {merging && merge.state !== "merging" ? (
            <>
              {renderVersions("receive", history?.behind ?? 0)}
              {renderVersions("upload", history?.ahead ?? 0)}
            </>
          ) : null}
          {merging ? (
            <SyncMergeWorkspace
              externalStatus={mergeStatus}
              compact
              onStatusChange={(next) => {
                setMerge(next)
                onMergeStatusChange?.(next)
              }}
              onReviewMerge={onReviewMerge}
              onSpaceChange={onSpaceChange}
              onFilesMaterialized={onFilesMaterialized}
            />
          ) : (
            <>
              {state.failure && history?.checkedAtMs ? (
                <p className="sync-inspector-caption">
                  {t("Results from the last successful check")}
                </p>
              ) : null}
              {renderVersions("receive", history?.behind ?? 0)}
              {renderVersions("upload", history?.ahead ?? 0)}
              {!history?.ahead && !history?.behind ? (
                <p className="sync-inspector-empty">
                  {t(
                    history?.checkedAtMs
                      ? "No versions waiting to transfer"
                      : "Check remote updates to see incoming versions."
                  )}
                </p>
              ) : null}
              {listState === "error" ? (
                <p role="alert">
                  {t("Version list unavailable. Your local versions are safe.")}
                </p>
              ) : null}
            </>
          )}
          {settings ? (
            <section
              ref={settingsRef}
              className="sync-inspector-settings"
              aria-label={t("Account menu")}
              onClick={(event) => {
                if (
                  event.target instanceof Element &&
                  event.target.closest("button")
                ) {
                  setSettings(false)
                }
              }}
            >
              <button className="sync-inspector-link" onClick={onAccount}>
                {t("Manage account")}
              </button>
              {merging ? (
                <>
                  <button
                    className="sync-inspector-link"
                    disabled={merge.state === "merging" || active}
                    onClick={onLocalRecovery}
                  >
                    {t("Keep a local copy")}
                  </button>
                  <button
                    className="sync-inspector-link"
                    disabled={merge.state === "merging" || active}
                    onClick={onRemoteRecovery}
                  >
                    {t("Open a cloud copy")}
                  </button>
                </>
              ) : null}
              <button
                className="sync-inspector-link"
                onClick={() =>
                  void window.eidosLite.openSettingsDestination("logs")
                }
              >
                {t("Open logs")}
              </button>
            </section>
          ) : null}
        </div>
        {state.dirty && !merging ? (
          <footer>
            <div className="sync-inspector-local">
              <span>
                {t("Local changes have not been saved as a version.")}
              </span>
              <button className="sync-inspector-link" onClick={onReview}>
                {t("Review local changes")}
              </button>
            </div>
          </footer>
        ) : null}
      </aside>
    </div>
  )
}
