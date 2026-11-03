import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react"
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CircleCheckBig,
  Cloud,
  CloudOff,
  FileText,
  GitMerge,
  LoaderCircle,
  LockKeyhole,
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
import {
  IndeterminateSyncProgress,
  SyncTransferStatus,
} from "./sync-connect-shared"
import { useEidosLiteI18n } from "./i18n"
import { SyncMergeWorkspace } from "./sync-merge-workspace"
import { SyncTransportTabs } from "./sync-transport-tabs"
import appLogo from "../../assets/logo.svg"

export interface SyncInspectorState {
  history?: SpaceSyncHistoryStatus
  dirty: boolean
  busy: boolean
  syncing?: boolean
  progress: EidosSyncProgress | null
  failure: EidosSyncFailure | null
  readOnly: boolean
  storageBlocked: boolean
  checking: boolean
  encryptionLocked?: boolean
}

function relativeCheckTime(timestamp: number, locale: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })
  if (seconds < 60) return formatter.format(0, "second")
  if (seconds < 3600)
    return formatter.format(-Math.floor(seconds / 60), "minute")
  if (seconds < 86400)
    return formatter.format(-Math.floor(seconds / 3600), "hour")
  return formatter.format(-Math.floor(seconds / 86400), "day")
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
  if (
    state.history?.state === "up_to_date" &&
    !state.dirty &&
    !state.readOnly &&
    !state.storageBlocked
  )
    return "sync"
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
  setupContent,
  setupFooter,
  unlockContent,
  connectionActions,
  connectionDetails,
  serverName,
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
  setupContent?: ReactNode
  setupFooter?: ReactNode
  unlockContent?: ReactNode
  connectionActions?: ReactNode
  connectionDetails?: ReactNode
  serverName?: string
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
  const { t, locale } = useEidosLiteI18n()
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
  const [merge, setMerge] = useState<EidosSyncMergeStatus>(
    mergeStatus ?? { state: "none" }
  )
  useEffect(() => {
    if (mergeStatus) setMerge(mergeStatus)
  }, [mergeStatus])
  const history = state.history
  useEffect(() => {
    let alive = true
    if (!mergeStatus && window.eidosLite.getSyncMergeStatus) {
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
  }, [spaceKey, mergeStatus])
  const active =
    (state.progress?.operation === "sync" &&
      state.progress.state === "active") ||
    state.syncing === true
  const action = syncInspectorAction(state)
  const [mergeBusy, setMergeBusy] = useState(false)
  const merging =
    mergeBusy ||
    merge.state === "merging" ||
    (!active && !state.failure && action === "merge")
  const compactStatus =
    !setupContent && !state.failure && !state.encryptionLocked && !merging
  const compactFailure =
    !setupContent &&
    !active &&
    !merging &&
    !state.encryptionLocked &&
    !!state.failure
  const localChangesFailure =
    compactFailure && state.failure?.code === "local-changes"
  const compactLocked = !setupContent && !merging && !!state.encryptionLocked
  useEffect(() => {
    let alive = true
    setCommits([])
    // Each direction previews at most ten versions, so only page what the
    // inspector can display instead of always reading fifty commits.
    const pageSize = Math.min(
      50,
      (history?.behind ? 10 : 0) + (history?.ahead ? 10 : 0)
    )
    if (
      pageSize === 0 ||
      state.failure ||
      !window.eidosLite.getVersionHistory
    ) {
      setListState("ready")
      return
    }
    setListState("loading")
    void window.eidosLite
      .getVersionHistory(pageSize)
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
    history?.ahead,
    history?.behind,
    state.failure,
  ])
  const title =
    (state.encryptionLocked
      ? t("Encrypted Sync is locked")
      : active
        ? t("Syncing this Space")
        : state.failure
          ? t(state.failure.title)
          : undefined) ??
    (merging
      ? merge.state === "merging"
        ? merge.unmergedCount > 0
          ? t("Local and cloud both changed")
          : t("All conflicts resolved")
        : t("Local and remote both have updates")
      : state.checking
        ? t("Checking remote updates…")
        : state.readOnly
          ? t("Sync writes are paused")
          : action === "review"
            ? t("Save local changes before receiving")
            : history?.behind
              ? history.behind === 1
                ? t("1 version to receive")
                : t("{count} versions to receive", { count: history.behind })
              : history?.ahead
                ? state.readOnly
                  ? t("Sync writes are paused")
                  : history.ahead === 1
                    ? t("1 version to upload")
                    : t("{count} versions to upload", { count: history.ahead })
                : history?.checkedAtMs && history.state === "up_to_date"
                  ? t("Everything is up to date")
                  : t("Remote updates have not been checked"))
  const label =
    action === "push"
      ? history?.ahead === 1
        ? t("Upload 1 version")
        : t("Upload {count} versions", { count: history?.ahead ?? 0 })
      : action === "pull"
        ? history?.behind === 1
          ? t("Receive 1 version")
          : t("Receive {count} versions", { count: history?.behind ?? 0 })
        : action === "sync"
          ? t("Check remote updates")
          : action === "review"
            ? t("Review local changes")
            : action === "account"
              ? t("Manage storage")
              : t("Check remote updates")
  const Icon = state.encryptionLocked
    ? LockKeyhole
    : active
      ? LoaderCircle
      : state.failure
        ? CloudOff
        : merging
          ? merge.state === "merging" && merge.unmergedCount > 0
            ? AlertTriangle
            : GitMerge
          : state.readOnly
            ? AlertTriangle
            : history?.behind
              ? ArrowDown
              : history?.ahead
                ? ArrowUp
                : history?.checkedAtMs
                  ? CircleCheckBig
                  : Cloud
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
              <small>
                {new Date(version.timestampMs).toLocaleString(locale)}
              </small>
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
        data-sync-setup={setupContent ? "true" : undefined}
      >
        <header>
          <div className="sync-inspector-heading">
            <img className="sync-dialog-mark" src={appLogo} alt="" />
            <strong>{t("Sync")}</strong>
          </div>
          {merging ? null : account ? (
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
        <SyncTransportTabs
          key={spaceKey}
          reviewRequired={merging || settings}
          reviewLabel={merging ? t("Resolve merge conflicts") : undefined}
        >
          {compactLocked ? (
            <div className="sync-minimal-status" aria-live="polite">
              <div>
                <span>{t("Status")}</span>
                <strong>{t("Encrypted Sync is locked")}</strong>
              </div>
              <div>
                <span>{t("Server")}</span>
                <strong>{serverName}</strong>
              </div>
            </div>
          ) : compactFailure ? (
            <div className="sync-minimal-status" aria-live="polite">
              <div>
                <span>{t("Status")}</span>
                <strong>
                  {localChangesFailure
                    ? t("Save local changes to sync")
                    : t(state.failure!.title)}
                </strong>
              </div>
              {!localChangesFailure ? (
                <p className="sync-minimal-error">
                  {t(state.failure!.message)}
                </p>
              ) : null}
              <div>
                <span>{t("Server")}</span>
                <strong>{serverName}</strong>
              </div>
            </div>
          ) : compactStatus ? (
            <div className="sync-minimal-status" aria-live="polite">
              <div>
                <span>{t("Status")}</span>
                <strong>
                  {active
                    ? t("Syncing…")
                    : history?.state === "up_to_date" &&
                        !state.readOnly &&
                        !state.checking
                      ? t("Up to date")
                      : title}
                </strong>
              </div>
              {state.readOnly && !active ? (
                <p className="sync-minimal-error" data-sync-readonly>
                  {t(
                    "Your Sync plan is read-only or expired. Downloads and exports still work; renew to upload saved versions again."
                  )}
                </p>
              ) : null}
              {active && state.progress ? (
                <SyncTransferStatus progress={state.progress} />
              ) : active ? (
                <div className="sync-minimal-transfer">
                  <IndeterminateSyncProgress label={t("Transfer progress")} />
                </div>
              ) : null}
              <div>
                <span>{t("Server")}</span>
                <strong>{serverName}</strong>
              </div>
              {history?.checkedAtMs ? (
                <div>
                  <span>{t("Last checked")}</span>
                  <strong>
                    {relativeCheckTime(history.checkedAtMs, locale)}
                  </strong>
                </div>
              ) : null}
            </div>
          ) : !setupContent ? (
            <div
              className="sync-inspector-b-status"
              aria-live="polite"
              data-read-only={
                state.readOnly &&
                !merging &&
                !active &&
                !state.failure &&
                !state.encryptionLocked
                  ? "true"
                  : undefined
              }
              data-up-to-date={
                !active &&
                !merging &&
                !state.failure &&
                !state.readOnly &&
                !state.encryptionLocked &&
                history?.state === "up_to_date"
                  ? "true"
                  : undefined
              }
            >
              <Icon
                aria-hidden="true"
                className={active ? "spin" : undefined}
              />
              <h2>{title}</h2>
              {active && state.progress?.detail ? (
                <p className="sync-status-description">
                  {t(state.progress.detail)}
                </p>
              ) : null}
              {!active &&
              !state.failure &&
              !state.encryptionLocked &&
              !merging &&
              state.readOnly ? (
                <p
                  className="sync-status-description sync-readonly-notice"
                  data-sync-readonly
                >
                  {t(
                    "Your Sync plan is read-only or expired. Downloads and exports still work; renew to upload saved versions again."
                  )}
                </p>
              ) : null}
              {merge.state !== "merging" &&
              !active &&
              history &&
              (history.ahead || history.behind) ? (
                <p className="sync-version-counts" data-sync-version-counts>
                  <span>
                    {t("Local to upload")}:{" "}
                    <strong>{history.ahead ?? "—"}</strong>
                  </span>
                  <span>
                    {t("Remote to receive")}:{" "}
                    <strong>{history.behind ?? "—"}</strong>
                  </span>
                </p>
              ) : null}
              {state.failure && !active ? (
                <p>{t(state.failure.message)}</p>
              ) : merging ? (
                <p className="sync-status-description">
                  {t(
                    merge.state === "merging"
                      ? merge.unmergedCount > 0
                        ? "Review conflicting files and tables in Changes. Nothing was overwritten."
                        : "Review the merge before completing."
                      : "Compatible changes merge automatically. Only conflicts need your attention."
                  )}
                </p>
              ) : null}
              <div className="sync-status-actions">
                {active && !state.encryptionLocked ? (
                  <div className="sync-inspector-transfer" role="status">
                    {state.progress ? (
                      <SyncTransferStatus progress={state.progress} />
                    ) : (
                      <IndeterminateSyncProgress
                        label={t("Transfer progress")}
                      />
                    )}
                  </div>
                ) : state.encryptionLocked ? null : state.failure ? (
                  <button
                    className="primary-action"
                    disabled={state.busy}
                    onClick={onRetry}
                  >
                    {t(state.failure.actionLabel || "Retry")}
                  </button>
                ) : !merging ? (
                  <button
                    className={
                      action === "sync" ? "secondary-action" : "primary-action"
                    }
                    data-sync-next={
                      state.readOnly
                        ? "account"
                        : action === "sync"
                          ? "fetch"
                          : action
                    }
                    disabled={
                      state.busy ||
                      state.checking ||
                      (!state.readOnly && action === "review" && !onReview)
                    }
                    onClick={
                      state.readOnly
                        ? onAccount
                        : action === "sync"
                          ? () => onAction("fetch")
                          : run
                    }
                  >
                    {state.readOnly ? t("Manage Sync access") : label}
                  </button>
                ) : null}
                {!active &&
                state.readOnly &&
                !state.encryptionLocked &&
                !merging &&
                action === "pull" ? (
                  <button
                    className="sync-inspector-link"
                    disabled={state.busy || state.checking}
                    onClick={() => onAction("pull")}
                  >
                    {label}
                  </button>
                ) : null}
                {!active &&
                !state.encryptionLocked &&
                !merging &&
                ((state.failure
                  ? state.failure.action === "manage-account" ||
                    state.failure.code === "remote-persistence-failed"
                  : action !== "fetch" && action !== "sync") ||
                  state.readOnly) ? (
                  <button
                    className="sync-inspector-link"
                    data-sync-check-remote
                    disabled={state.busy || state.checking}
                    onClick={() => onAction("fetch")}
                  >
                    {t("Check remote updates")}
                  </button>
                ) : null}
                {!active && !merging && onReview ? (
                  <button
                    className="sync-inspector-link sync-open-versions"
                    onClick={onReview}
                  >
                    {t("Open Versions")}
                  </button>
                ) : null}
                {!active && merge.state === "merging" && onReviewMerge ? (
                  <button
                    className="primary-action"
                    onClick={() => onReviewMerge()}
                  >
                    {t("Review in Changes")}
                  </button>
                ) : null}
                {!active && merge.state === "merging" && onReview ? (
                  <button className="sync-inspector-link" onClick={onReview}>
                    {t("Open Versions")}
                  </button>
                ) : null}
                {state.failure && !active && onLocalRecovery ? (
                  <button
                    className="sync-inspector-link"
                    disabled={state.busy}
                    onClick={onLocalRecovery}
                  >
                    {t("Keep a local copy")}
                  </button>
                ) : null}
              </div>
              {active && history && (history.ahead || history.behind) ? (
                <p className="sync-version-counts" data-sync-version-counts>
                  <span>
                    {t("Local to upload")}:{" "}
                    <strong>{history.ahead ?? "—"}</strong>
                  </span>
                  <span>
                    {t("Remote to receive")}:{" "}
                    <strong>{history.behind ?? "—"}</strong>
                  </span>
                </p>
              ) : null}
              {state.failure && !active ? (
                <small className="sync-status-checked">
                  {t("Local files safe")}
                </small>
              ) : null}
              {!active &&
              merge.state === "merging" &&
              merge.unmergedCount > 0 ? (
                <small className="sync-status-checked">
                  {t("Merging waits until every conflict is resolved.")}
                </small>
              ) : null}
              {history?.checkedAtMs ? (
                <small className="sync-status-checked">
                  {t("Last checked")}{" "}
                  {relativeCheckTime(history.checkedAtMs, locale)}
                </small>
              ) : null}
            </div>
          ) : null}
          <div className="sync-inspector-b-content">
            {state.failure &&
            !active &&
            !setupContent &&
            !merging &&
            !compactFailure ? (
              <details className="sync-inspector-failure-details">
                <summary>{t("Details")}</summary>
                <dl>
                  {state.failure.status ? (
                    <div>
                      <dt>{t("Error")}</dt>
                      <dd>{state.failure.status}</dd>
                    </div>
                  ) : null}
                  {history?.ahead ? (
                    <div>
                      <dt>{t("Waiting to upload")}</dt>
                      <dd>{t("{count} versions", { count: history.ahead })}</dd>
                    </div>
                  ) : null}
                </dl>
              </details>
            ) : null}
            {!merging ? setupContent : null}
            {!setupContent && merging && merge.state !== "merging" ? (
              <>
                {renderVersions("receive", history?.behind ?? 0)}
                {renderVersions("upload", history?.ahead ?? 0)}
              </>
            ) : null}
            {merging ? (
              <SyncMergeWorkspace
                externalStatus={merge}
                onBusyChange={setMergeBusy}
                compact
                onStatusChange={(next) => {
                  setMerge(next)
                  onMergeStatusChange?.(next)
                }}
                onReviewMerge={onReviewMerge}
                onSpaceChange={onSpaceChange}
                onFilesMaterialized={onFilesMaterialized}
              />
            ) : setupContent ||
              active ||
              compactFailure ||
              compactLocked ? null : (
              <>
                {state.failure && history?.checkedAtMs ? (
                  <p className="sync-inspector-caption">
                    {t("Results from the last successful check")}
                  </p>
                ) : null}
                {renderVersions("receive", history?.behind ?? 0)}
                {renderVersions("upload", history?.ahead ?? 0)}
                {!history?.ahead &&
                !history?.behind &&
                history?.state !== "up_to_date" ? (
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
                    {t(
                      "Version list unavailable. Your local versions are safe."
                    )}
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
                <button
                  className="sync-inspector-link"
                  onClick={() =>
                    void window.eidosLite.openSettingsDestination(
                      "account-sync"
                    )
                  }
                >
                  {t("Sync settings")}
                </button>
                {action === "sync" && !active && !state.failure ? (
                  <button
                    className="sync-inspector-link"
                    disabled={state.busy || state.checking}
                    onClick={() => onAction("sync")}
                  >
                    {t("Sync now")}
                  </button>
                ) : null}
                {connectionActions ? connectionActions : null}
                {compactFailure && onLocalRecovery && !localChangesFailure ? (
                  <button
                    className="sync-inspector-link"
                    disabled={state.busy}
                    onClick={onLocalRecovery}
                  >
                    {t("Keep a local copy")}
                  </button>
                ) : null}
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
                {state.failure ? (
                  <button
                    className="sync-inspector-link"
                    onClick={() =>
                      void window.eidosLite.openSettingsDestination("logs")
                    }
                  >
                    {t("Open logs")}
                  </button>
                ) : null}
              </section>
            ) : null}
            {!setupContent &&
            !state.encryptionLocked &&
            !compactStatus &&
            !compactFailure
              ? connectionDetails
              : null}
          </div>
          {connectionActions && !setupContent && !connectionDetails ? (
            <footer className="sync-inspector-connection-actions">
              {connectionActions}
            </footer>
          ) : null}
          {!setupContent && unlockContent && !merging ? (
            <footer className="sync-inspector-unlock" data-sync-unlock>
              {unlockContent}
            </footer>
          ) : null}
          {setupContent && setupFooter && !merging ? (
            <footer className="sync-setup-footer">{setupFooter}</footer>
          ) : null}
          {compactStatus ? (
            <footer className="sync-setup-footer sync-minimal-footer">
              <button
                className="primary-action"
                data-sync-next={state.readOnly ? "account" : action}
                disabled={
                  active ||
                  state.busy ||
                  state.checking ||
                  (action === "review" && !onReview)
                }
                onClick={
                  state.readOnly
                    ? onAccount
                    : action === "sync"
                      ? () => onAction("sync")
                      : run
                }
              >
                {active
                  ? t("Syncing…")
                  : state.readOnly
                    ? t("Manage Sync access")
                    : action === "sync"
                      ? t("Sync now")
                      : label}
              </button>
              {state.readOnly && action === "pull" && !active ? (
                <button
                  className="sync-inspector-link"
                  disabled={state.busy || state.checking}
                  onClick={() => onAction("pull")}
                >
                  {label}
                </button>
              ) : null}
            </footer>
          ) : null}
          {compactFailure ? (
            <footer className="sync-setup-footer sync-minimal-footer">
              <button
                className="primary-action"
                disabled={state.busy}
                onClick={onRetry}
              >
                {t(state.failure!.actionLabel || "Retry")}
              </button>
              {state.failure?.action === "manage-account" ||
              state.failure?.code === "remote-persistence-failed" ? (
                <button
                  className="sync-inspector-link"
                  data-sync-check-remote
                  disabled={state.busy || state.checking}
                  onClick={() => onAction("fetch")}
                >
                  {t("Check remote updates")}
                </button>
              ) : null}
            </footer>
          ) : null}
          {!setupContent &&
          state.dirty &&
          !merging &&
          !compactFailure &&
          !compactLocked ? (
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
        </SyncTransportTabs>
      </aside>
    </div>
  )
}
