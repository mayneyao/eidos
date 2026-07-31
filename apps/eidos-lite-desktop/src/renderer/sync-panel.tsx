import { useEffect, useState } from "react"
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  Cloud,
  CloudDownload,
  CloudUpload,
  Copy,
  FileWarning,
  FolderDown,
  HardDrive,
  LoaderCircle,
  LogIn,
  RefreshCw,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react"

import type {
  EidosSyncFailure,
  EidosSyncOperation,
  EidosSyncPhase,
  EidosSyncPreflight,
  EidosSyncProgress,
  EidosSyncQueueStatus,
  EidosSyncRecoveryResult,
  EidosSyncRepository,
  EidosSyncRepositoryList,
  EidosSyncRunResult,
  EidosSyncStatus,
  EidosSyncTelemetry,
  SpaceSnapshot,
  SyncAccountUser,
} from "../shared/contracts"
import {
  clearSyncStatusSnapshots,
  readSyncStatusSnapshot,
  writeSyncStatusSnapshot,
} from "./sync-status-cache"

type BusyAction =
  | "sign-in"
  | "sign-out"
  | "enable"
  | "repositories"
  | "clone"
  | "sync"
  | "recover-local"
  | "recover-hosted"
  | "help"
  | "diagnostics"
  | null

type FailureContext = "connect" | "clone" | "sync"

interface LoadError {
  kind: "offline" | "session-expired" | "unavailable"
  title: string
  message: string
}

type SyncTone = "neutral" | "active" | "success" | "warning" | "danger"

interface SyncPill {
  label: string
  tone: SyncTone
}

interface SyncOverview {
  pill: SyncPill
  title: string
  message: string
  tone: SyncTone
}

interface SyncStorageUsage {
  usedBytes: number
  reservedBytes: number
  quotaBytes: number
  remainingBytes: number
}

const OPERATION_LABELS: Record<EidosSyncOperation, string> = {
  connect: "Connecting this Space",
  sync: "Syncing this Space",
  clone: "Opening a synced Space",
  recovery: "Creating a safe copy",
}

const OPERATION_STEPS: Record<
  EidosSyncOperation,
  Array<{ label: string; phases: EidosSyncPhase[] }>
> = {
  connect: [
    { label: "Check access", phases: ["authorization"] },
    { label: "Prepare Space", phases: ["analyze", "drain"] },
    { label: "Upload", phases: ["push"] },
    { label: "Finish", phases: ["validate", "reopen"] },
  ],
  sync: [
    {
      label: "Check for updates",
      phases: ["authorization", "fetch", "analyze"],
    },
    {
      label: "Get updates",
      phases: ["drain", "pull", "validate", "reopen"],
    },
    { label: "Upload changes", phases: ["push"] },
  ],
  clone: [
    { label: "Choose location", phases: ["authorization", "drain"] },
    { label: "Download", phases: ["fetch"] },
    { label: "Check files", phases: ["validate"] },
    { label: "Open Space", phases: ["reopen"] },
  ],
  recovery: [
    { label: "Prepare", phases: ["authorization", "drain"] },
    { label: "Create copy", phases: ["fetch", "pull", "push"] },
    { label: "Check files", phases: ["validate"] },
    { label: "Open Space", phases: ["reopen"] },
  ],
}

export function SyncPanel({
  mode,
  cacheKey = mode === "clone" ? "welcome" : "current-space",
  hasUncheckpointedChanges = false,
  onClose,
  onClone,
  onRequestClone,
  onReviewLocal,
  onSpaceChange,
}: {
  mode: "enable" | "clone"
  cacheKey?: string
  hasUncheckpointedChanges?: boolean
  onClose(): void
  onClone?(snapshot: SpaceSnapshot): void
  onRequestClone?(): void
  onReviewLocal?(): void
  onSpaceChange?(snapshot: SpaceSnapshot): void
}) {
  const [initialSnapshot] = useState(() => readSyncStatusSnapshot(cacheKey))
  const [status, setStatus] = useState<EidosSyncStatus>(
    initialSnapshot?.status ?? initialSyncStatus()
  )
  const [repositories, setRepositories] =
    useState<EidosSyncRepositoryList | null>(null)
  const [selectedRepository, setSelectedRepository] =
    useState<EidosSyncRepository | null>(null)
  const [preflight, setPreflight] = useState<EidosSyncPreflight | null>(null)
  const [confirmWarnings, setConfirmWarnings] = useState(false)
  const [syncResult, setSyncResult] = useState<EidosSyncRunResult | null>(null)
  const [syncFailure, setSyncFailure] = useState<EidosSyncFailure | null>(null)
  const [failureContext, setFailureContext] = useState<FailureContext>("sync")
  const [syncFailureTelemetry, setSyncFailureTelemetry] =
    useState<EidosSyncTelemetry | null>(null)
  const [operationTelemetry, setOperationTelemetry] =
    useState<EidosSyncTelemetry | null>(null)
  const [syncProgress, setSyncProgress] = useState<EidosSyncProgress | null>(
    null
  )
  const [syncQueueStatus, setSyncQueueStatus] =
    useState<EidosSyncQueueStatus | null>(null)
  const [syncProgressHistory, setSyncProgressHistory] = useState<
    EidosSyncProgress[]
  >([])
  const [syncElapsedMs, setSyncElapsedMs] = useState(0)
  const [recoveryResult, setRecoveryResult] =
    useState<EidosSyncRecoveryResult | null>(null)
  const [busy, setBusy] = useState<BusyAction>(null)
  const [checking, setChecking] = useState(true)
  const [, setCheckedAtMs] = useState(initialSnapshot?.checkedAtMs ?? 0)
  const [lastSyncedAtMs, setLastSyncedAtMs] = useState(
    initialSnapshot?.lastSyncedAtMs
  )
  const [loadError, setLoadError] = useState<LoadError | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false)

  const loadResources = async (value: EidosSyncStatus) => {
    if (mode === "enable" && value.canEnable) {
      setPreflight(await window.eidosLite.getSyncPreflight())
      setConfirmWarnings(false)
    }
    if (mode === "clone" && value.canClone) {
      setBusy("repositories")
      setRepositories(await window.eidosLite.listSyncRepositories())
    }
  }

  useEffect(() => {
    let active = true
    const load = async () => {
      const snapshotBeforeCheck = readSyncStatusSnapshot(cacheKey)
      setChecking(true)
      setLoadError(null)
      try {
        const value = await window.eidosLite.getSyncStatus()
        if (!active) return
        if (
          value.account.state === "signed-out" &&
          snapshotBeforeCheck?.status.account.state === "signed-in"
        ) {
          setLoadError(
            syncStatusLoadError(
              new Error("Your Eidos Sync session expired. Sign in again."),
              true
            )
          )
          return
        }
        const checkedAt = Date.now()
        setStatus(value)
        setCheckedAtMs(checkedAt)
        writeSyncStatusSnapshot(cacheKey, {
          version: 1,
          status: value,
          checkedAtMs: checkedAt,
          ...(lastSyncedAtMs ? { lastSyncedAtMs } : {}),
        })
        await loadResources(value)
        if (active) setBusy(null)
      } catch (cause) {
        console.error("Could not load Eidos Sync", cause)
        if (!active) return
        setLoadError(syncStatusLoadError(cause, initialSnapshot !== null))
        setBusy(null)
      } finally {
        if (active) setChecking(false)
      }
    }
    void load()
    return () => {
      active = false
    }
    // loadResources intentionally follows the current panel mode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, mode, reloadKey])

  useEffect(
    () =>
      window.eidosLite.onSyncProgress((progress) => {
        setSyncProgress(progress)
        setSyncElapsedMs(progress.elapsedMs)
        if (
          progress.state === "completed" &&
          progress.operation !== "recovery"
        ) {
          const completedAtMs = Date.now()
          setLastSyncedAtMs(completedAtMs)
          const current = readSyncStatusSnapshot(cacheKey)
          if (current) {
            writeSyncStatusSnapshot(cacheKey, {
              ...current,
              lastSyncedAtMs: completedAtMs,
            })
          }
        }
        setSyncProgressHistory((current) => {
          const sameRun = current.filter(
            (entry) => entry.runId === progress.runId
          )
          const previous = sameRun.at(-1)
          return previous?.phase === progress.phase
            ? [...sameRun.slice(0, -1), progress]
            : [...sameRun, progress]
        })
      }),
    [cacheKey]
  )

  useEffect(() => {
    let active = true
    void window.eidosLite.getSyncQueueStatus().then(
      (queue) => {
        if (!active) return
        setSyncQueueStatus(queue)
        if (queue?.lastFailure) {
          setSyncFailure(queue.lastFailure)
          setFailureContext("sync")
        }
      },
      (cause) => console.error("Could not read the Sync queue", cause)
    )
    const unsubscribe = window.eidosLite.onSyncQueueChanged((queue) => {
      if (!active) return
      setSyncQueueStatus(queue)
      if (queue.lastFailure) {
        setSyncFailure(queue.lastFailure)
        setFailureContext("sync")
      }
      if (queue.state === "idle") setSyncFailure(null)
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!syncProgress || syncProgress.state !== "active") return
    const update = () =>
      setSyncElapsedMs(Math.max(0, Date.now() - syncProgress.startedAtMs))
    update()
    const timer = window.setInterval(update, 100)
    return () => window.clearInterval(timer)
  }, [syncProgress])

  const rememberStatus = (
    value: EidosSyncStatus,
    options: { synced?: boolean } = {}
  ) => {
    const checkedAt = Date.now()
    const syncedAt =
      value.account.state === "signed-out"
        ? undefined
        : options.synced
          ? checkedAt
          : lastSyncedAtMs
    setStatus(value)
    setCheckedAtMs(checkedAt)
    setLastSyncedAtMs(syncedAt)
    writeSyncStatusSnapshot(cacheKey, {
      version: 1,
      status: value,
      checkedAtMs: checkedAt,
      ...(syncedAt ? { lastSyncedAtMs: syncedAt } : {}),
    })
  }

  const resetOperation = () => {
    setLoadError(null)
    setSyncResult(null)
    setSyncFailure(null)
    setSyncFailureTelemetry(null)
    setOperationTelemetry(null)
    setSyncProgress(null)
    setSyncProgressHistory([])
    setSyncElapsedMs(0)
    setRecoveryResult(null)
  }

  const showUnexpectedError = (
    cause: unknown,
    title: string,
    message: string
  ) => {
    console.error(title, cause)
    setLoadError({ kind: "unavailable", title, message })
  }

  const signIn = async () => {
    setBusy("sign-in")
    setLoadError(null)
    try {
      const signedIn = await window.eidosLite.beginSyncSignIn()
      rememberStatus(signedIn)
      setSyncFailure(null)
      setSyncFailureTelemetry(null)
      await loadResources(signedIn)
    } catch (cause) {
      showUnexpectedError(
        cause,
        "Sign-in did not finish",
        "No local files were changed. Try signing in again."
      )
    } finally {
      setBusy(null)
    }
  }

  const signOut = async () => {
    setBusy("sign-out")
    setLoadError(null)
    try {
      const signedOut = await window.eidosLite.signOutSync()
      clearSyncStatusSnapshots()
      setLastSyncedAtMs(undefined)
      rememberStatus(signedOut)
      setRepositories(null)
      setPreflight(null)
    } catch (cause) {
      showUnexpectedError(
        cause,
        "Could not sign out",
        "Your local files are unaffected. Try again from Sync details."
      )
    } finally {
      setBusy(null)
    }
  }

  const enableSync = async () => {
    if (!preflight) return
    resetOperation()
    setFailureContext("connect")
    setBusy("enable")
    try {
      const response = await window.eidosLite.enableSync({
        manifestId: preflight.manifestId,
        confirmWarnings,
      })
      setOperationTelemetry(response.telemetry)
      if (response.ok) {
        rememberStatus(response.status, { synced: true })
      } else {
        setSyncFailure(response.failure)
        setSyncFailureTelemetry(response.telemetry)
        try {
          setPreflight(await window.eidosLite.getSyncPreflight())
          setConfirmWarnings(false)
        } catch (cause) {
          console.error("Could not refresh the Sync safety review", cause)
        }
      }
    } catch (cause) {
      showUnexpectedError(
        cause,
        "Could not connect this Space",
        "Nothing was removed locally. Review the flagged files and try again."
      )
    } finally {
      setBusy(null)
    }
  }

  const cloneRepository = async (repository: EidosSyncRepository) => {
    resetOperation()
    setSelectedRepository(repository)
    setFailureContext("clone")
    setBusy("clone")
    try {
      const response = await window.eidosLite.cloneSyncRepository(
        repository.remoteUrl
      )
      setOperationTelemetry(response.telemetry)
      if (response.ok) {
        if (response.snapshot) {
          setLastSyncedAtMs(Date.now())
          onClone?.(response.snapshot)
        }
      } else {
        setSyncFailure(response.failure)
        setSyncFailureTelemetry(response.telemetry)
      }
    } catch (cause) {
      showUnexpectedError(
        cause,
        "Could not open this synced Space",
        "No local Space was replaced. Choose the Space and try again."
      )
    } finally {
      setBusy(null)
    }
  }

  const syncNow = async () => {
    resetOperation()
    setFailureContext("sync")
    setBusy("sync")
    try {
      const response = await window.eidosLite.runSync()
      if (response.ok) {
        setSyncResult(response.result)
        onSpaceChange?.(response.result.snapshot)
        rememberStatus(await window.eidosLite.getSyncStatus(), {
          synced: true,
        })
      } else {
        setSyncFailure(response.failure)
        setSyncFailureTelemetry(response.telemetry)
      }
    } catch (cause) {
      showUnexpectedError(
        cause,
        "Sync did not finish",
        "Your local files are safe. Check your connection and try again."
      )
    } finally {
      setBusy(null)
    }
  }

  const recoverLocal = async () => {
    setBusy("recover-local")
    setLoadError(null)
    setRecoveryResult(null)
    try {
      setRecoveryResult(await window.eidosLite.copyLocalRecoverySpace())
    } catch (cause) {
      showUnexpectedError(
        cause,
        "Could not create the local copy",
        "The current Space was not changed. Choose a new location and try again."
      )
    } finally {
      setBusy(null)
    }
  }

  const recoverHosted = async () => {
    setBusy("recover-hosted")
    setLoadError(null)
    setRecoveryResult(null)
    try {
      setRecoveryResult(await window.eidosLite.cloneHostedRecoverySpace())
    } catch (cause) {
      showUnexpectedError(
        cause,
        "Could not create the cloud copy",
        "The current Space was not changed. Check your connection and try again."
      )
    } finally {
      setBusy(null)
    }
  }

  const openHelp = async (destination: "account" | "download") => {
    setBusy("help")
    try {
      await window.eidosLite.openSyncHelp(destination)
    } catch (cause) {
      showUnexpectedError(
        cause,
        "Could not open this page",
        "Try again, or open eidos.space in your browser."
      )
    } finally {
      setBusy(null)
    }
  }

  const runFailureAction = async () => {
    if (!syncFailure) return
    if (syncFailure.action === "retry-now") {
      if (failureContext === "connect") await enableSync()
      else if (failureContext === "clone" && selectedRepository) {
        await cloneRepository(selectedRepository)
      } else await syncNow()
      return
    }
    if (syncFailure.action === "sign-in") {
      await signIn()
      return
    }
    if (syncFailure.action === "manage-account") {
      await openHelp("account")
      return
    }
    if (syncFailure.action === "update") {
      await openHelp("download")
      return
    }
    if (syncFailure.action === "clone-hosted") {
      if (mode === "clone") {
        setSyncFailure(null)
      } else {
        onRequestClone?.()
      }
      return
    }
    if (syncFailure.action === "review-local") {
      onReviewLocal?.()
      return
    }
    setSyncFailure(null)
    setSyncFailureTelemetry(null)
  }

  const runTelemetry =
    syncResult?.telemetry ?? syncFailureTelemetry ?? operationTelemetry
  const visiblePhases = runTelemetry
    ? runTelemetry.phases
    : syncProgressHistory.map((progress) => ({
        phase: progress.phase,
        detail: progress.detail,
        durationMs:
          progress.state === "active"
            ? Math.max(0, Date.now() - progress.phaseStartedAtMs)
            : 0,
      }))
  const overview = syncOverview({
    mode,
    loadError,
    status,
    queue: syncQueueStatus,
    progress: syncProgress,
    result: syncResult,
    failure: syncFailure,
    hasUncheckpointedChanges,
    selectedRepository,
  })
  const accountName =
    status.account.user?.email ?? status.account.user?.name ?? "Signed in"
  const storage = syncStorageUsage(status)
  const storageIsLow = storage ? isStorageLow(storage) : false
  const operationsBlocked = checking || loadError !== null

  return (
    <div className="sync-dialog-backdrop" role="presentation">
      <aside
        className="sync-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-dialog-title"
        data-sync-mode={mode}
        data-sync-environment={status.environment}
        data-sync-account-state={status.account.state}
        data-sync-can-enable={status.canEnable ? "true" : "false"}
        data-sync-can-clone={status.canClone ? "true" : "false"}
        data-sync-remote-state={status.remote.state}
      >
        <header>
          <div>
            <Cloud />
            <span className="sync-dialog-copy">
              <span className="sync-dialog-title-line">
                <strong id="sync-dialog-title">Sync</strong>
                {status.environment === "staging" ? (
                  <span
                    className="environment-badge"
                    data-service-environment="staging"
                  >
                    Staging
                  </span>
                ) : null}
              </span>
              <small>
                {mode === "clone"
                  ? "Open a cloud Space locally"
                  : "Keep this Space up to date"}
              </small>
            </span>
          </div>
          <div className="sync-dialog-header-side">
            {status.account.state === "signed-in" ? (
              <SyncIdentityChip
                user={status.account.user}
                checking={checking}
              />
            ) : (
              <span className="sync-local-only">Local only</span>
            )}
            <button
              type="button"
              className="icon-button"
              onClick={onClose}
              aria-label="Close Eidos Sync"
            >
              <X />
            </button>
          </div>
        </header>

        <div className="sync-dialog-body" data-sync-tone={overview.tone}>
          <section
            className="sync-status"
            data-sync-overview={overview.tone}
            data-sync-queue-state={syncQueueStatus?.state ?? "idle"}
            {...(syncFailure
              ? {
                  "data-sync-failure": syncFailure.code,
                  "data-sync-failure-state": syncFailure.state,
                  "data-sync-failure-action": syncFailure.action,
                  "data-sync-local-safe": "true",
                }
              : {})}
            aria-live="polite"
          >
            <span
              className={`sync-status-pill sync-status-pill-${overview.pill.tone}`}
            >
              {overview.pill.tone === "success" ? <Check /> : null}
              {overview.pill.label}
            </span>
            <h2>{overview.title}</h2>
            <p className="sync-status-message">{overview.message}</p>
            {status.account.state === "signed-in" && checking && !loadError ? (
              <p className="sync-status-quiet">
                <LoaderCircle className="spin" /> Checking account and cloud
                status…
              </p>
            ) : null}
            {status.account.state === "signed-in" &&
            !checking &&
            lastSyncedAtMs &&
            !syncFailure &&
            syncProgress?.state !== "active" ? (
              <p className="sync-status-meta">
                Last synced {formatRelativeTime(lastSyncedAtMs)}
              </p>
            ) : null}
            {syncFailure ? (
              <small className="sync-local-safe">
                <HardDrive /> Local files safe
              </small>
            ) : null}
          </section>

          {status.account.state === "signed-in" && storage ? (
            <SyncStorageSummary storage={storage} low={storageIsLow} />
          ) : null}

          {loadError ? (
            <div className="sync-primary-actions">
              <button
                type="button"
                className="primary-action"
                onClick={() =>
                  loadError.kind === "session-expired"
                    ? void signIn()
                    : setReloadKey((current) => current + 1)
                }
                disabled={busy !== null}
              >
                {loadError.kind === "session-expired" ? (
                  <LogIn />
                ) : (
                  <RefreshCw />
                )}
                {loadError.kind === "session-expired"
                  ? "Sign in again"
                  : "Try again"}
              </button>
            </div>
          ) : null}

          {syncFailure ? (
            <div className="sync-primary-actions sync-failure-actions">
              <button
                type="button"
                className="primary-action"
                data-sync-failure-primary-action
                disabled={
                  busy !== null ||
                  (syncFailure.action === "clone-hosted" &&
                    mode !== "clone" &&
                    !onRequestClone) ||
                  (syncFailure.action === "review-local" && !onReviewLocal)
                }
                onClick={() => void runFailureAction()}
              >
                {busy === "help" ? (
                  <LoaderCircle className="spin" />
                ) : (
                  <RefreshCw />
                )}
                {syncFailure.actionLabel}
              </button>
              {syncFailure.action !== "work-locally" ? (
                <button
                  type="button"
                  className="secondary-action"
                  data-sync-work-locally
                  disabled={busy !== null}
                  onClick={() => {
                    setSyncFailure(null)
                    setSyncFailureTelemetry(null)
                  }}
                >
                  Keep working locally
                </button>
              ) : null}
            </div>
          ) : null}

          {syncProgress?.state === "active" ? (
            <>
              <OperationProgress
                progress={syncProgress}
                elapsedMs={syncElapsedMs}
              />
              <div className="sync-primary-actions">
                <button
                  type="button"
                  className="secondary-action sync-keep-working"
                  data-sync-keep-working
                  onClick={onClose}
                >
                  {mode === "clone" ? "Continue in background" : "Keep working"}
                </button>
              </div>
            </>
          ) : null}

          {!syncFailure && !loadError ? (
            <>
              {status.account.state === "signed-out" ? (
                <div className="sync-primary-actions">
                  <button
                    type="button"
                    className="primary-action sync-sign-in"
                    data-sync-sign-in
                    disabled={busy !== null || checking}
                    onClick={() => void signIn()}
                  >
                    {busy === "sign-in" ? (
                      <LoaderCircle className="spin" />
                    ) : (
                      <LogIn />
                    )}
                    {busy === "sign-in"
                      ? "Waiting for your browser…"
                      : "Sign in to continue"}
                  </button>
                </div>
              ) : null}

              {mode === "enable" &&
              status.account.state === "signed-in" &&
              status.remote.state === "not-connected" ? (
                <>
                  {status.canEnable ? (
                    <SyncSafetyReview
                      preflight={preflight}
                      confirmWarnings={confirmWarnings}
                      onConfirmWarnings={setConfirmWarnings}
                    />
                  ) : null}
                  <div className="sync-primary-actions">
                    {status.canEnable ? (
                      <button
                        type="button"
                        className="primary-action sync-enable"
                        data-sync-enable
                        disabled={
                          busy !== null ||
                          operationsBlocked ||
                          !preflight ||
                          preflight.blockerCount > 0 ||
                          (preflight.warningCount > 0 && !confirmWarnings)
                        }
                        onClick={() => void enableSync()}
                      >
                        {busy === "enable" ? (
                          <LoaderCircle className="spin" />
                        ) : (
                          <CloudUpload />
                        )}
                        {busy === "enable"
                          ? "Connecting this Space…"
                          : "Connect this Space"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="primary-action"
                        disabled={busy !== null || operationsBlocked}
                        onClick={() => void openHelp("account")}
                      >
                        <UserRound /> Manage account
                      </button>
                    )}
                    {status.canEnable && storageIsLow ? (
                      <button
                        type="button"
                        className="secondary-action"
                        data-sync-manage-storage
                        disabled={busy !== null}
                        onClick={() => void openHelp("account")}
                      >
                        <UserRound /> Manage storage
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}

              {mode === "enable" &&
              status.account.state === "signed-in" &&
              status.remote.state === "connected" ? (
                <div className="sync-primary-actions">
                  {hasUncheckpointedChanges ? (
                    <button
                      type="button"
                      className="primary-action"
                      data-sync-review-local
                      disabled={
                        busy !== null || operationsBlocked || !onReviewLocal
                      }
                      onClick={onReviewLocal}
                    >
                      <FileWarning /> Review local changes
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="primary-action sync-run"
                        data-sync-run
                        disabled={busy !== null || operationsBlocked}
                        onClick={() => void syncNow()}
                      >
                        {busy === "sync" ? (
                          <LoaderCircle className="spin" />
                        ) : status.entitlement.state === "read-only" ? (
                          <CloudDownload />
                        ) : (
                          <RefreshCw />
                        )}
                        {busy === "sync"
                          ? "Syncing…"
                          : status.entitlement.state === "read-only"
                            ? "Get cloud updates"
                            : syncResult
                              ? "Check again"
                              : "Sync now"}
                      </button>
                      {storageIsLow ? (
                        <button
                          type="button"
                          className="secondary-action"
                          data-sync-manage-storage
                          disabled={busy !== null}
                          onClick={() => void openHelp("account")}
                        >
                          <UserRound /> Manage storage
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}

              {mode === "clone" &&
              status.account.state === "signed-in" &&
              status.canClone ? (
                <RepositoryPicker
                  repositories={repositories}
                  busy={busy}
                  disabled={operationsBlocked}
                  selectedRepository={selectedRepository}
                  onSelect={(repository) => void cloneRepository(repository)}
                />
              ) : null}
            </>
          ) : null}

          {syncResult?.state === "conflict" ? (
            <section className="sync-recovery" data-sync-recovery>
              <header>
                <strong>Keep both versions safe</strong>
                <p>
                  Eidos will not merge or overwrite this Space automatically.
                  Create either copy in a new folder, then decide what to keep.
                </p>
              </header>
              <dl className="sync-divergence-summary">
                <div>
                  <dt>Local-only updates</dt>
                  <dd data-sync-local-ahead>{syncResult.ahead}</dd>
                </div>
                <div>
                  <dt>Cloud-only updates</dt>
                  <dd data-sync-hosted-ahead>{syncResult.behind}</dd>
                </div>
              </dl>
              <div className="sync-recovery-actions">
                <button
                  type="button"
                  className="secondary-action"
                  data-sync-recover-local
                  disabled={busy !== null}
                  onClick={() => void recoverLocal()}
                >
                  {busy === "recover-local" ? (
                    <LoaderCircle className="spin" />
                  ) : (
                    <Copy />
                  )}
                  {busy === "recover-local"
                    ? "Creating local copy…"
                    : "Keep a local copy"}
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  data-sync-recover-hosted
                  disabled={busy !== null}
                  onClick={() => void recoverHosted()}
                >
                  {busy === "recover-hosted" ? (
                    <LoaderCircle className="spin" />
                  ) : (
                    <FolderDown />
                  )}
                  {busy === "recover-hosted"
                    ? "Creating cloud copy…"
                    : "Open a cloud copy"}
                </button>
              </div>
            </section>
          ) : null}

          {recoveryResult ? (
            <section
              className="sync-inline-result"
              data-sync-recovery-result={recoveryResult.kind}
              role="status"
            >
              <CheckCircle2 />
              <div>
                <strong>
                  {recoveryResult.kind === "local-copy"
                    ? "Local Recovery Space created"
                    : "Cloud Recovery Space opened"}
                </strong>
                <p>
                  {recoveryResult.name} opened in a new window. Its folder is{" "}
                  {recoveryResult.displayPath}.
                </p>
              </div>
            </section>
          ) : null}

          <details className="sync-details" data-sync-details>
            <summary>
              <ChevronRight /> Details
            </summary>
            <div className="sync-details-body">
              <dl>
                <div>
                  <dt>Account</dt>
                  <dd>
                    {status.account.state === "signed-in"
                      ? accountName
                      : "Signed out"}
                  </dd>
                </div>
                <div>
                  <dt>Access</dt>
                  <dd>{accessLabel(status)}</dd>
                </div>
                <div>
                  <dt>Cloud connection</dt>
                  <dd>
                    {status.remote.state === "connected"
                      ? "Connected"
                      : "Not connected"}
                  </dd>
                </div>
                {!storage && status.entitlement.quotaBytes !== undefined ? (
                  <div>
                    <dt>Cloud storage</dt>
                    <dd>Usage temporarily unavailable</dd>
                  </div>
                ) : null}
              </dl>

              {visiblePhases.length > 0 ? (
                <section className="sync-diagnostics">
                  <header>
                    <strong>Last operation</strong>
                    <span>
                      {formatDuration(
                        runTelemetry?.durationMs ?? syncElapsedMs
                      )}
                    </span>
                  </header>
                  <ol>
                    {visiblePhases.map((phase, index) => (
                      <li
                        data-sync-phase={phase.phase}
                        key={`${phase.phase}-${index}`}
                      >
                        <span>
                          <Check /> {technicalPhaseLabel(phase.phase)}
                        </span>
                        <small>
                          {phase.detail}
                          {runTelemetry
                            ? ` · ${formatDuration(phase.durationMs)}`
                            : ""}
                        </small>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}

              <div className="sync-details-actions">
                <button
                  type="button"
                  className="secondary-action"
                  disabled={busy !== null}
                  onClick={() => {
                    setBusy("diagnostics")
                    void window.eidosLite
                      .copyDiagnostics()
                      .then(() => setDiagnosticsCopied(true))
                      .catch((cause) =>
                        showUnexpectedError(
                          cause,
                          "Could not copy diagnostics",
                          "Open the logs folder and try again."
                        )
                      )
                      .finally(() => setBusy(null))
                  }}
                >
                  <Copy />{" "}
                  {diagnosticsCopied
                    ? "Diagnostics copied"
                    : "Copy diagnostics"}
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  disabled={busy !== null}
                  onClick={() =>
                    void window.eidosLite.openSettingsDestination("logs")
                  }
                >
                  <FolderDown /> Open logs
                </button>
                {status.account.state === "signed-in" ? (
                  <button
                    type="button"
                    className="secondary-action sync-sign-out"
                    disabled={busy !== null}
                    onClick={() => void signOut()}
                  >
                    <UserRound />
                    {busy === "sign-out" ? "Signing out…" : "Sign out"}
                  </button>
                ) : null}
              </div>
            </div>
          </details>
        </div>
      </aside>
    </div>
  )
}

function syncOverview({
  mode,
  loadError,
  status,
  queue,
  progress,
  result,
  failure,
  hasUncheckpointedChanges,
  selectedRepository,
}: {
  mode: "enable" | "clone"
  loadError: LoadError | null
  status: EidosSyncStatus
  queue: EidosSyncQueueStatus | null
  progress: EidosSyncProgress | null
  result: EidosSyncRunResult | null
  failure: EidosSyncFailure | null
  hasUncheckpointedChanges: boolean
  selectedRepository: EidosSyncRepository | null
}): SyncOverview {
  if (loadError) {
    const pill: SyncPill =
      loadError.kind === "offline"
        ? { label: "Offline", tone: "warning" }
        : loadError.kind === "session-expired"
          ? { label: "Sign-in needed", tone: "warning" }
          : { label: "Needs attention", tone: "danger" }
    return {
      pill,
      title: loadError.title,
      message: loadError.message,
      tone: loadError.kind === "unavailable" ? "danger" : "warning",
    }
  }
  if (failure) {
    if (queue?.state === "retry-wait") {
      return {
        pill: { label: "Retrying soon", tone: "warning" },
        title: "Sync will try again soon",
        message: queue.nextAttemptAtMs
          ? `Next attempt around ${new Date(queue.nextAttemptAtMs).toLocaleTimeString()}. Your local files are safe.`
          : "Eidos will retry when the service is available. Your local files are safe.",
        tone: "warning",
      }
    }
    return {
      pill:
        failure.state === "offline"
          ? { label: "Offline", tone: "warning" }
          : { label: "Needs attention", tone: "danger" },
      title: failure.title,
      message: failure.message,
      tone: failure.state === "offline" ? "warning" : "danger",
    }
  }
  if (progress?.state === "active") {
    return {
      pill: { label: operationPillLabel(progress), tone: "active" },
      title:
        progress.operation === "clone" && selectedRepository
          ? `Opening ${selectedRepository.name}`
          : OPERATION_LABELS[progress.operation],
      message: friendlyProgressDetail(progress),
      tone: "active",
    }
  }
  if (mode === "clone") {
    if (status.account.state === "signed-out") {
      return {
        pill: { label: "Not connected", tone: "neutral" },
        title: "Sign in to see your Spaces",
        message:
          "Choose a synced Space and Eidos will keep an ordinary local copy for offline work.",
        tone: "neutral",
      }
    }
    if (!status.canClone) {
      return {
        pill: { label: "Unavailable", tone: "warning" },
        title: "Sync access is required",
        message:
          "Manage your account to open a synced Space. Existing local Spaces are unaffected.",
        tone: "warning",
      }
    }
    return {
      pill: { label: "Open from cloud", tone: "neutral" },
      title: "Choose a synced Space",
      message:
        status.entitlement.state === "read-only"
          ? "You can download cloud updates. Changes you make will stay on this device."
          : "Eidos will download it to a local folder and keep it available offline.",
      tone: "neutral",
    }
  }
  if (result?.state === "conflict") {
    return {
      pill: { label: "Needs review", tone: "danger" },
      title: "Local and cloud changes differ",
      message:
        "Nothing was overwritten. Keep both versions in separate folders before deciding what to merge.",
      tone: "danger",
    }
  }
  if (result?.state === "read-only") {
    return {
      pill: { label: "Up to date", tone: "success" },
      title: "Up to date in read-only mode",
      message:
        "Cloud changes are available locally. Your changes remain on this device.",
      tone: "success",
    }
  }
  if (result?.state === "synced") {
    if (result.pulled && result.pushed) {
      return {
        pill: { label: "Up to date", tone: "success" },
        title: "Cloud and local changes are up to date",
        message: "Updates were downloaded and your changes were uploaded.",
        tone: "success",
      }
    }
    if (result.pulled) {
      return {
        pill: { label: "Up to date", tone: "success" },
        title: "Cloud updates received",
        message: "This local Space now includes the latest cloud changes.",
        tone: "success",
      }
    }
    if (result.pushed) {
      return {
        pill: { label: "Up to date", tone: "success" },
        title: "Changes uploaded",
        message: "Your cloud Space now includes the latest local changes.",
        tone: "success",
      }
    }
    return {
      pill: { label: "Up to date", tone: "success" },
      title: "Everything is up to date",
      message: "There are no new local or cloud updates.",
      tone: "success",
    }
  }
  if (status.account.state === "signed-out") {
    return {
      pill: { label: "Not connected", tone: "neutral" },
      title: "Keep this Space in sync",
      message:
        "Back up your work and continue on another device. Local work never requires an account.",
      tone: "neutral",
    }
  }
  const storage = syncStorageUsage(status)
  if (
    status.entitlement.state === "read-write" &&
    storage &&
    isStorageLow(storage)
  ) {
    return {
      pill: {
        label: `${formatBytes(storage.usedBytes + storage.reservedBytes)} of ${formatBytes(storage.quotaBytes)}`,
        tone: "danger",
      },
      title: `${formatBytes(storage.remainingBytes)} cloud storage left`,
      message:
        "Manage storage before the next large upload. Your local files remain safe.",
      tone: "warning",
    }
  }
  if (status.remote.state === "not-connected") {
    if (!status.canEnable) {
      return {
        pill: { label: "Unavailable", tone: "warning" },
        title: "Sync access is required",
        message:
          "Manage your account to connect this Space. Local files are unaffected.",
        tone: "warning",
      }
    }
    return {
      pill: { label: "Not connected", tone: "neutral" },
      title: "Keep this Space up to date",
      message:
        "Connect once to create a cloud copy, then Eidos can sync updates across devices.",
      tone: "neutral",
    }
  }
  if (hasUncheckpointedChanges) {
    return {
      pill: { label: "Changes to upload", tone: "active" },
      title: "Review your latest changes",
      message:
        "Finish saving the current changes in History before uploading them. Your cloud Space has not changed.",
      tone: "warning",
    }
  }
  if (queue?.state === "running") {
    return {
      pill: { label: "Syncing", tone: "active" },
      title: "Syncing this Space",
      message: "Checking for cloud updates and uploading saved changes.",
      tone: "active",
    }
  }
  if (queue?.state === "pending") {
    return {
      pill: { label: "Changes to upload", tone: "active" },
      title: "Changes are queued",
      message: "Eidos will sync the latest saved changes in the background.",
      tone: "active",
    }
  }
  if (queue?.state === "retry-wait") {
    return {
      pill: { label: "Retrying soon", tone: "warning" },
      title: "Sync will try again soon",
      message: queue.nextAttemptAtMs
        ? `Next attempt around ${new Date(queue.nextAttemptAtMs).toLocaleTimeString()}. Local files are safe.`
        : "Local files are safe while Eidos waits for the service.",
      tone: "warning",
    }
  }
  if (status.entitlement.state === "read-only") {
    return {
      pill: { label: "View only", tone: "warning" },
      title: "Ready to get updates",
      message:
        "This account can download cloud changes, but local changes will stay on this device.",
      tone: "neutral",
    }
  }
  if (progress?.operation === "connect" && progress.state === "completed") {
    return {
      pill: { label: "Connected", tone: "success" },
      title: "This Space is ready to sync",
      message: "The first cloud copy is complete.",
      tone: "success",
    }
  }
  return {
    pill: { label: "Ready", tone: "neutral" },
    title: "Ready to sync",
    message: "Check for cloud updates and upload your latest saved changes.",
    tone: "neutral",
  }
}

function operationStepPercent(progress: EidosSyncProgress): number {
  const steps = OPERATION_STEPS[progress.operation]
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.phases.includes(progress.phase))
  )
  return Math.round(((activeIndex + 1) / steps.length) * 100)
}

function operationPillLabel(progress: EidosSyncProgress): string {
  const percent = operationStepPercent(progress)
  if (progress.operation === "sync") return `Syncing ${percent}%`
  if (progress.operation === "recovery") return `Copying ${percent}%`
  return `Connecting ${percent}%`
}

function SyncIdentityChip({
  user,
  checking,
}: {
  user?: SyncAccountUser
  checking: boolean
}) {
  const label = user?.email ?? user?.name ?? "Signed in"
  const initials = accountInitials(user?.name ?? user?.email ?? label)
  return (
    <span
      className="sync-identity-chip"
      data-sync-account-summary
      data-sync-account-checking={checking ? "true" : "false"}
      title={label}
    >
      <span className="sync-account-avatar" aria-hidden="true">
        <span>{initials}</span>
        {user?.avatarDataUrl || user?.avatarUrl ? (
          <img src={user.avatarDataUrl ?? user.avatarUrl} alt="" />
        ) : null}
      </span>
      <span className="sync-identity-label">{label}</span>
    </span>
  )
}

function SyncStorageSummary({
  storage,
  low,
}: {
  storage: SyncStorageUsage
  low: boolean
}) {
  const consumed = storage.usedBytes + storage.reservedBytes
  const usedPercent =
    storage.quotaBytes === 0
      ? 100
      : Math.min(100, Math.round((consumed / storage.quotaBytes) * 100))
  return (
    <section
      className="sync-storage-summary"
      data-sync-storage-used={storage.usedBytes}
      data-sync-storage-remaining={storage.remainingBytes}
      data-sync-storage-quota={storage.quotaBytes}
      data-sync-storage-low={low ? "true" : "false"}
    >
      <header>
        <span>Cloud storage</span>
        <strong>
          {formatBytes(storage.usedBytes)} of {formatBytes(storage.quotaBytes)}
          {" used"}
        </strong>
      </header>
      <progress
        aria-label={`${usedPercent}% of cloud storage used`}
        max={Math.max(1, storage.quotaBytes)}
        value={consumed}
      />
      <footer>
        <span>{usedPercent}% used</span>
        <span>{formatBytes(storage.remainingBytes)} available</span>
      </footer>
      {storage.reservedBytes > 0 ? (
        <small>
          {formatBytes(storage.reservedBytes)} reserved for the current upload
        </small>
      ) : null}
    </section>
  )
}

function OperationProgress({
  progress,
  elapsedMs,
}: {
  progress: EidosSyncProgress
  elapsedMs: number
}) {
  const steps = OPERATION_STEPS[progress.operation]
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.phases.includes(progress.phase))
  )
  const percent = operationStepPercent(progress)
  return (
    <section
      className="sync-operation-progress"
      data-sync-progress={progress.state}
      data-sync-operation={progress.operation}
      data-sync-progress-phase={progress.phase}
      role="status"
    >
      <header>
        <span>{friendlyProgressDetail(progress)}</span>
        <small>{formatDuration(elapsedMs)}</small>
      </header>
      <progress
        className="sync-operation-bar"
        aria-label={`${percent}% complete`}
        max={100}
        value={percent}
      />
      <ol>
        {steps.map((step, index) => {
          const state =
            index < activeIndex
              ? "complete"
              : index === activeIndex
                ? "active"
                : "pending"
          return (
            <li data-step-state={state} key={step.label}>
              <span aria-hidden="true">
                {state === "complete" ? (
                  <Check />
                ) : state === "active" ? (
                  <LoaderCircle className="spin" />
                ) : null}
              </span>
              <small>{step.label}</small>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function RepositoryPicker({
  repositories,
  busy,
  disabled,
  selectedRepository,
  onSelect,
}: {
  repositories: EidosSyncRepositoryList | null
  busy: BusyAction
  disabled: boolean
  selectedRepository: EidosSyncRepository | null
  onSelect(repository: EidosSyncRepository): void
}) {
  return (
    <section className="sync-repositories" data-sync-repositories>
      <header>
        <strong>Your synced Spaces</strong>
        {repositories ? (
          <small>
            {repositories.repositories.length}{" "}
            {repositories.repositories.length === 1 ? "Space" : "Spaces"}
          </small>
        ) : null}
      </header>
      {busy === "repositories" ? (
        <p className="sync-loading" role="status">
          <LoaderCircle className="spin" /> Loading your synced Spaces…
        </p>
      ) : repositories?.repositories.length ? (
        <div>
          {repositories.repositories.map((repository) => {
            const selected =
              selectedRepository?.remoteUrl === repository.remoteUrl
            return (
              <button
                type="button"
                className="sync-repository"
                data-sync-open-space={repository.name}
                key={repository.remoteUrl}
                disabled={busy !== null || disabled}
                onClick={() => onSelect(repository)}
              >
                {busy === "clone" && selected ? (
                  <LoaderCircle className="spin" />
                ) : (
                  <FolderDown />
                )}
                <span>
                  <strong>{repository.name}</strong>
                  <small>
                    Cloud copy created{" "}
                    {new Date(repository.createdAtMs).toLocaleDateString()}
                  </small>
                </span>
                <ChevronRight />
              </button>
            )
          })}
        </div>
      ) : (
        <p className="sync-empty">
          No synced Spaces yet. Connect a local Space first, then it will appear
          here.
        </p>
      )}
    </section>
  )
}

function SyncSafetyReview({
  preflight,
  confirmWarnings,
  onConfirmWarnings,
}: {
  preflight: EidosSyncPreflight | null
  confirmWarnings: boolean
  onConfirmWarnings(value: boolean): void
}) {
  return (
    <section
      className="sync-safety-review"
      data-sync-preflight
      data-sync-preflight-blocked={preflight?.blockerCount ? "true" : "false"}
    >
      <header>
        <ShieldCheck />
        <div>
          <strong>Before the first upload</strong>
          <p>
            Eidos checks the whole Space for files that may be private,
            unsupported, or unusually large.
          </p>
        </div>
      </header>
      {preflight ? (
        <>
          <p className="sync-scope-summary">
            <strong>{preflight.fileCount} files</strong>
            <span>{formatBytes(preflight.totalBytes)}</span>
            <span>{preflight.eidosFileCount} Eidos Files</span>
          </p>

          {preflight.blockerCount > 0 ? (
            <div className="sync-safety-issue" role="alert">
              <AlertTriangle />
              <div>
                <strong>Fix these files before connecting</strong>
                <p>
                  Move, replace, or remove the blocked entries, then reopen
                  Sync.
                </p>
                <PreflightEntries
                  entries={preflight.blockers}
                  total={preflight.blockerCount}
                />
              </div>
            </div>
          ) : null}

          {preflight.warningCount > 0 ? (
            <div className="sync-safety-issue">
              <FileWarning />
              <div>
                <strong>Review files before upload</strong>
                <p>
                  These files may contain private information or use more cloud
                  storage than expected.
                </p>
                <PreflightEntries
                  entries={preflight.warnings}
                  total={preflight.warningCount}
                />
              </div>
            </div>
          ) : (
            <p className="sync-safety-clear">
              <CheckCircle2 /> No files need your review.
            </p>
          )}

          {preflight.warningCount > 0 && preflight.blockerCount === 0 ? (
            <label className="sync-preflight-confirm">
              <input
                type="checkbox"
                data-sync-preflight-confirm
                checked={confirmWarnings}
                onChange={(event) => onConfirmWarnings(event.target.checked)}
              />
              <span>
                I reviewed the flagged files and want to include them in the
                cloud copy.
              </span>
            </label>
          ) : null}

          <details className="sync-scope-details">
            <summary>
              <ChevronRight /> Files not included ({preflight.excludedCount})
            </summary>
            {preflight.excluded.length ? (
              <ul>
                {preflight.excluded.map((entry) => (
                  <li key={entry.relativePath}>
                    <span>{entry.relativePath}</span>
                    <small>{exclusionLabel(entry.reason)}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No files are excluded.</p>
            )}
            {preflight.excludedCount > preflight.excluded.length ? (
              <p>+{preflight.excludedCount - preflight.excluded.length} more</p>
            ) : null}
          </details>
        </>
      ) : (
        <p className="sync-loading" role="status">
          <LoaderCircle className="spin" /> Checking files in this Space…
        </p>
      )}
    </section>
  )
}

function PreflightEntries({
  entries,
  total,
}: {
  entries: EidosSyncPreflight["warnings"]
  total: number
}) {
  return (
    <>
      <ul>
        {entries.slice(0, 12).map((entry) => (
          <li key={entry.relativePath}>
            <span title={entry.relativePath}>{entry.relativePath}</span>
            <small>
              {entry.concerns.map(concernLabel).join(" · ")}
              {entry.size > 0 ? ` · ${formatBytes(entry.size)}` : ""}
            </small>
          </li>
        ))}
      </ul>
      {total > 12 ? <p>+{total - 12} more files to review</p> : null}
    </>
  )
}

function friendlyProgressDetail(progress: EidosSyncProgress): string {
  if (progress.operation === "connect") {
    return {
      authorization: "Checking that this account can use Sync…",
      analyze: "Preparing the first cloud copy…",
      drain: "Preparing local files…",
      push: "Uploading this Space for the first time…",
      validate: "Confirming the cloud copy…",
      fetch: "Checking cloud access…",
      pull: "Getting cloud updates…",
      reopen: "Finishing the connection…",
    }[progress.phase]
  }
  if (progress.operation === "clone") {
    return {
      authorization: "Checking access to this Space…",
      drain: "Choose where to keep the local copy…",
      fetch: "Downloading files from the cloud…",
      analyze: "Preparing the local copy…",
      pull: "Downloading files from the cloud…",
      validate: "Checking the downloaded files…",
      reopen: "Opening the local Space…",
      push: "Finishing the local copy…",
    }[progress.phase]
  }
  return {
    authorization: "Starting a secure Sync…",
    fetch: "Checking for cloud updates…",
    analyze: "Comparing local and cloud changes…",
    drain: "Preparing local files for updates…",
    pull: "Getting cloud updates…",
    validate: "Checking updated files…",
    reopen: "Reopening your files…",
    push: "Uploading local changes…",
  }[progress.phase]
}

function technicalPhaseLabel(phase: EidosSyncPhase): string {
  return {
    authorization: "Authorization",
    fetch: "Fetch",
    analyze: "Compare",
    drain: "Prepare files",
    pull: "Pull",
    validate: "Validate",
    reopen: "Reopen",
    push: "Push",
  }[phase]
}

function concernLabel(
  concern: EidosSyncPreflight["warnings"][number]["concerns"][number]
) {
  return {
    hidden: "hidden file",
    "suspected-secret": "may contain private data",
    "large-file": "large file",
    "file-too-large": "too large to sync",
    symlink: "linked file",
    "unsupported-entry": "unsupported file type",
  }[concern]
}

function exclusionLabel(
  reason: EidosSyncPreflight["excluded"][number]["reason"]
) {
  return {
    "graft-metadata": "version history data",
    "graft-ignore": "ignored by Space settings",
    "os-noise": "system file",
    "temporary-file": "temporary file",
  }[reason]
}

function accessLabel(status: EidosSyncStatus): string {
  if (status.account.state === "signed-out") return "Sign-in required"
  if (status.entitlement.state === "read-write") return "Download and upload"
  if (status.entitlement.state === "read-only") return "Download only"
  if (status.entitlement.state === "blocked") return "Blocked"
  return "Sync access required"
}

function initialSyncStatus(): EidosSyncStatus {
  return {
    environment: "production",
    account: { state: "signed-out" },
    device: { state: "not-registered" },
    entitlement: {
      state: "not-checked",
      detail: "Sync account details have not been checked yet.",
    },
    remote: { state: "not-connected" },
    canEnable: false,
    canClone: false,
    blocker: {
      code: "authentication-required",
      message: "Sign in with your eidos.space account to continue.",
    },
  }
}

function syncStatusLoadError(
  cause: unknown,
  hasCachedStatus: boolean
): LoadError {
  const message = cause instanceof Error ? cause.message.toLowerCase() : ""
  const sessionExpired =
    message.includes("session expired") ||
    message.includes("sign in again") ||
    message.includes("not authorized") ||
    message.includes("authentication-required")
  if (sessionExpired) {
    return {
      kind: "session-expired",
      title: "Sign in again to continue syncing",
      message:
        "Your local data is safe. We kept your account summary so you can continue without reselecting anything.",
    }
  }
  if (
    hasCachedStatus ||
    message.includes("offline") ||
    message.includes("unavailable") ||
    message.includes("timed out") ||
    message.includes("could not be reached")
  ) {
    return {
      kind: "offline",
      title: "We’ll sync when you’re back online",
      message:
        "Showing the last known Sync status. You can keep working on this device and try again later.",
    }
  }
  return {
    kind: "unavailable",
    title: "Sync couldn’t be checked",
    message:
      "Your local files are safe and remain available. Try checking your account and cloud status again.",
  }
}

function accountInitials(value: string): string {
  const words = value
    .replace(/@.*$/, "")
    .split(/[\s._-]+/)
    .filter(Boolean)
  return (
    words.length > 1
      ? `${words[0]?.[0] ?? ""}${words.at(-1)?.[0] ?? ""}`
      : (words[0]?.slice(0, 2) ?? "E")
  ).toUpperCase()
}

function formatRelativeTime(value: number): string {
  if (!value) return "recently"
  const elapsed = Math.max(0, Date.now() - value)
  if (elapsed < 60_000) return "just now"
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`
  return new Date(value).toLocaleDateString()
}

function syncStorageUsage(status: EidosSyncStatus): SyncStorageUsage | null {
  const { usedBytes, reservedBytes, quotaBytes, remainingBytes } =
    status.entitlement
  if (
    usedBytes === undefined ||
    reservedBytes === undefined ||
    quotaBytes === undefined ||
    remainingBytes === undefined
  ) {
    return null
  }
  return { usedBytes, reservedBytes, quotaBytes, remainingBytes }
}

function isStorageLow(storage: SyncStorageUsage): boolean {
  if (storage.quotaBytes === 0) return true
  return (storage.usedBytes + storage.reservedBytes) / storage.quotaBytes >= 0.9
}

function formatDuration(value: number): string {
  if (value < 1_000) return `${Math.round(value)} ms`
  return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)} s`
}

function formatBytes(value: number): string {
  if (value === 0) return "0 bytes"
  const units = ["bytes", "KiB", "MiB", "GiB", "TiB"]
  const unit = Math.min(
    units.length - 1,
    Math.floor(Math.log(value) / Math.log(1024))
  )
  const scaled = value / 1024 ** unit
  return `${scaled.toLocaleString(undefined, {
    maximumFractionDigits: unit === 0 ? 0 : 1,
  })} ${units[unit]}`
}
