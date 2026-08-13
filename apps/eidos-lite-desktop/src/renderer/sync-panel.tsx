import { useEffect, useState } from "react"
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cloud,
  CloudDownload,
  CloudOff,
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
  type LucideIcon,
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
  EidosSyncMergeStatus,
  SpaceSnapshot,
  SpaceSyncHistoryStatus,
  SyncAccountUser,
} from "../shared/contracts"
import {
  clearSyncStatusSnapshots,
  readSyncAccountContext,
  readSyncStatusSnapshot,
  writeSyncStatusSnapshot,
} from "./sync-status-cache"
import { SyncMergeWorkspace } from "./sync-merge-workspace"

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

interface SyncOverview {
  icon: LucideIcon
  spin?: boolean
  title: string
  message?: string
  tone: SyncTone
}

interface SyncStorageUsage {
  usedBytes: number
  reservedBytes: number
  quotaBytes: number
  remainingBytes: number
}

type SpaceSizeState =
  | "idle"
  | "loading"
  | "cached"
  | "available"
  | "unavailable"

type SyncStorageState = "normal" | "warning" | "full" | "over"

const OPERATION_LABELS: Record<EidosSyncOperation, string> = {
  connect: "Connecting this Space",
  sync: "Syncing this Space",
  clone: "Opening a synced Space",
  recovery: "Creating a safe copy",
}

export function SyncPanel({
  mode,
  variant = "dialog",
  platform = "unknown",
  cacheKey = mode === "clone" ? "welcome" : "current-space",
  hasUncheckpointedChanges = false,
  syncHistory,
  onClose,
  onClone,
  onRequestClone,
  onReviewLocal,
  onMergeStatusChange,
  onReviewMerge,
  onSpaceChange,
}: {
  mode: "enable" | "clone"
  variant?: "dialog" | "inspector"
  platform?: string
  cacheKey?: string
  hasUncheckpointedChanges?: boolean
  syncHistory?: SpaceSyncHistoryStatus
  onClose(): void
  onClone?(snapshot: SpaceSnapshot): void
  onRequestClone?(): void
  onReviewLocal?(): void
  onMergeStatusChange?(status: EidosSyncMergeStatus): void
  onReviewMerge?(): void
  onSpaceChange?(snapshot: SpaceSnapshot): void
}) {
  const [initialSnapshot] = useState(() => readSyncStatusSnapshot(cacheKey))
  const [initialAccountContext] = useState(() => readSyncAccountContext())
  const [status, setStatus] = useState<EidosSyncStatus>(
    initialSnapshot?.status ??
      syncStatusFromAccountContext(initialAccountContext) ??
      initialSyncStatus()
  )
  const [repositories, setRepositories] =
    useState<EidosSyncRepositoryList | null>(
      initialSnapshot?.repositories ?? null
    )
  const [selectedRepository, setSelectedRepository] =
    useState<EidosSyncRepository | null>(null)
  const [preflight, setPreflight] = useState<EidosSyncPreflight | null>(null)
  const [spaceBytes, setSpaceBytes] = useState(initialSnapshot?.spaceBytes)
  const [spaceSizeState, setSpaceSizeState] = useState<SpaceSizeState>(
    initialSnapshot?.spaceBytes === undefined ? "idle" : "cached"
  )
  const [preflightRefreshKey, setPreflightRefreshKey] = useState(0)
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
  const [repositoriesCheckedAtMs, setRepositoriesCheckedAtMs] = useState(
    initialSnapshot?.repositoriesCheckedAtMs
  )
  const [loadError, setLoadError] = useState<LoadError | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [diagnosticsCopied, setDiagnosticsCopied] = useState(false)
  const [mergeActive, setMergeActive] = useState(false)

  const loadResources = async (value: EidosSyncStatus) => {
    if (mode === "clone" && value.canClone) {
      const cached = readSyncStatusSnapshot(cacheKey)
      if (!cached?.repositories) setBusy("repositories")
      try {
        const nextRepositories = await window.eidosLite.listSyncRepositories()
        setRepositories(nextRepositories)
        const repositoriesCheckedAt = Date.now()
        setRepositoriesCheckedAtMs(repositoriesCheckedAt)
        const current = readSyncStatusSnapshot(cacheKey)
        if (current) {
          writeSyncStatusSnapshot(cacheKey, {
            ...current,
            repositories: nextRepositories,
            repositoriesCheckedAtMs: repositoriesCheckedAt,
          })
        }
      } catch (cause) {
        if (!cached?.repositories) throw cause
        console.error("Could not refresh synced Spaces", cause)
      }
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
          (snapshotBeforeCheck?.status.account.state === "signed-in" ||
            initialAccountContext?.account.state === "signed-in")
        ) {
          clearSyncStatusSnapshots()
          setStatus(value)
          setRepositories(null)
          setPreflight(null)
          setLastSyncedAtMs(undefined)
          setLoadError(null)
          return
        }
        const checkedAt = Date.now()
        setStatus(value)
        setCheckedAtMs(checkedAt)
        writeSyncStatusSnapshot(cacheKey, {
          ...(snapshotBeforeCheck ?? {}),
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
        const nextLoadError = syncStatusLoadError(
          cause,
          initialSnapshot !== null ||
            initialAccountContext?.account.state === "signed-in"
        )
        if (nextLoadError.kind === "session-expired") {
          clearSyncStatusSnapshots()
          setStatus({
            ...initialSyncStatus(),
            environment:
              initialSnapshot?.status.environment ??
              initialAccountContext?.environment ??
              "production",
          })
          setRepositories(null)
          setPreflight(null)
          setLastSyncedAtMs(undefined)
          setLoadError(null)
        } else {
          setLoadError(nextLoadError)
        }
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
  }, [cacheKey, mode, reloadKey, initialAccountContext, initialSnapshot])

  const shouldLoadSpaceSize =
    mode === "enable" &&
    status.account.state === "signed-in" &&
    status.entitlement.state === "read-write"

  useEffect(() => {
    if (!shouldLoadSpaceSize) {
      setSpaceSizeState("idle")
      return
    }

    let active = true
    const cachedSpaceBytes = readSyncStatusSnapshot(cacheKey)?.spaceBytes
    setSpaceSizeState(cachedSpaceBytes === undefined ? "loading" : "cached")
    if (typeof window.eidosLite.getSyncPreflight !== "function") {
      setSpaceSizeState(
        cachedSpaceBytes === undefined ? "unavailable" : "cached"
      )
      return
    }
    void window.eidosLite.getSyncPreflight().then(
      (value) => {
        if (!active) return
        setPreflight(value)
        setSpaceBytes(value.totalBytes)
        setConfirmWarnings(false)
        setSpaceSizeState("available")
        const current = readSyncStatusSnapshot(cacheKey)
        if (current) {
          writeSyncStatusSnapshot(cacheKey, {
            ...current,
            spaceBytes: value.totalBytes,
            spaceSizeCheckedAtMs: Date.now(),
          })
        }
      },
      (cause) => {
        console.error("Could not calculate this Space size", cause)
        if (!active) return
        setPreflight(null)
        setSpaceSizeState(
          cachedSpaceBytes === undefined ? "unavailable" : "cached"
        )
      }
    )
    return () => {
      active = false
    }
  }, [cacheKey, preflightRefreshKey, shouldLoadSpaceSize])

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
    if (
      status.entitlement.state !== "read-only" &&
      status.entitlement.state !== "read-write"
    ) {
      setSyncQueueStatus(null)
      setSyncFailure(null)
      return
    }
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
  }, [status.entitlement.state])

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
      ...(readSyncStatusSnapshot(cacheKey) ?? {}),
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
        setPreflightRefreshKey((current) => current + 1)
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
        repository.remoteUrl,
        repository.displayName
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
        setPreflightRefreshKey((current) => current + 1)
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

  const openHelp = async (
    destination: "account" | "download" | "sync-access"
  ) => {
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
    if (syncFailure.action === "work-locally") {
      onClose()
      return
    }
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
    checking,
    hasCachedAccount:
      initialSnapshot !== null ||
      initialAccountContext?.account.state === "signed-in",
    syncHistory,
  })
  const accountName =
    status.account.user?.email ?? status.account.user?.name ?? "Signed in"
  const storage = syncStorageUsage(status)
  const storageState = storage ? syncStorageState(storage) : "normal"
  const storageNeedsAttention = storageState !== "normal"
  const storageBlocksCurrentUpload =
    status.entitlement.state === "read-write" &&
    storage !== null &&
    (storageState === "over" ||
      (storageState === "full" && storage.usedBytes >= storage.quotaBytes)) &&
    (storage.reservedBytes > 0 || syncHistory?.state === "ahead")
  const operationsBlocked =
    loadError !== null || (checking && initialSnapshot === null)
  const spaceStatusPending =
    checking && initialSnapshot === null && status.account.state === "signed-in"
  const syncAction = syncPrimaryAction({
    status,
    syncHistory,
    hasUncheckpointedChanges,
    syncResult,
  })
  const syncActionIsPrimary =
    status.entitlement.state === "read-only" ||
    syncHistory?.state === "ahead" ||
    syncHistory?.state === "behind"
  const mergeReviewNeeded =
    syncResult?.state === "conflict" || syncHistory?.state === "diverged"
  if (shouldRenderSyncAccessGate(status)) {
    return (
      <SyncAccessGate
        mode={mode}
        variant={variant}
        platform={platform}
        environment={status.environment}
        accountState={status.account.state}
        entitlementState={status.entitlement.state}
        busy={busy}
        checking={checking}
        onClose={onClose}
        onSignIn={() => void signIn()}
        onManageAccess={() => void openHelp("sync-access")}
        onCheckAgain={() => {
          setLoadError(null)
          setReloadKey((current) => current + 1)
        }}
      />
    )
  }

  const signedIn = status.account.state === "signed-in"
  const heroMeta =
    signedIn &&
    (mode === "clone" ? repositoriesCheckedAtMs : lastSyncedAtMs) &&
    !syncFailure &&
    syncProgress?.state !== "active"
      ? `${mode === "clone" ? "List updated" : "Last synced"} ${formatRelativeTime(
          mode === "clone"
            ? (repositoriesCheckedAtMs ?? 0)
            : (lastSyncedAtMs ?? 0)
        )}`
      : null
  const direction =
    mode === "enable" &&
    signedIn &&
    status.remote.state === "connected" &&
    syncProgress?.state !== "active"
      ? syncDirection(syncHistory)
      : null

  return (
    <div
      className={
        variant === "dialog" ? "sync-dialog-backdrop" : "sync-inspector-host"
      }
      role="presentation"
      data-platform={platform}
    >
      <aside
        className={`sync-dialog${variant === "inspector" ? " sync-dialog-inspector" : ""}`}
        role={variant === "dialog" ? "dialog" : "complementary"}
        aria-modal={variant === "dialog" ? "true" : undefined}
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
            {signedIn ? (
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
            className="sync-hero"
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
            <span className="sync-hero-icon" aria-hidden="true">
              <overview.icon className={overview.spin ? "spin" : undefined} />
            </span>
            <div className="sync-hero-copy">
              <h2>{overview.title}</h2>
              {overview.message ? <p>{overview.message}</p> : null}
              {direction ? (
                <span className="sync-direction">
                  {direction.upload > 0 ? (
                    <span
                      className="sync-direction-item"
                      data-sync-direction="upload"
                    >
                      <ArrowUp /> {direction.upload} to upload
                    </span>
                  ) : null}
                  {direction.download > 0 ? (
                    <span
                      className="sync-direction-item"
                      data-sync-direction="download"
                    >
                      <ArrowDown /> {direction.download} to download
                    </span>
                  ) : null}
                </span>
              ) : null}
              {heroMeta ? (
                <small className="sync-hero-meta">{heroMeta}</small>
              ) : null}
              {syncFailure ? (
                <small className="sync-local-safe">
                  <HardDrive /> Local files safe
                </small>
              ) : null}
            </div>
          </section>

          {loadError ? (
            <div className="sync-actions">
              <button
                type="button"
                className="primary-action"
                onClick={() =>
                  loadError.kind === "session-expired" ||
                  status.account.state === "signed-out"
                    ? void signIn()
                    : setReloadKey((current) => current + 1)
                }
                disabled={busy !== null}
              >
                {loadError.kind === "session-expired" ||
                status.account.state === "signed-out" ? (
                  <LogIn />
                ) : (
                  <RefreshCw />
                )}
                {loadError.kind === "session-expired"
                  ? "Sign in again"
                  : status.account.state === "signed-out"
                    ? "Sign in"
                    : "Try again"}
              </button>
            </div>
          ) : null}

          {syncFailure && !loadError ? (
            <div className="sync-actions">
              <button
                type="button"
                className={
                  syncFailure.action === "work-locally"
                    ? "secondary-action"
                    : "primary-action"
                }
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
                ) : syncFailure.action === "work-locally" ? null : (
                  <FailureActionIcon action={syncFailure.action} />
                )}
                {syncFailure.action === "work-locally"
                  ? "Close"
                  : syncFailure.actionLabel}
              </button>
            </div>
          ) : null}

          {syncProgress?.state === "active" ? (
            <>
              <OperationProgress
                progress={syncProgress}
                elapsedMs={syncElapsedMs}
              />
              <div className="sync-actions">
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

          {!syncFailure && !loadError && !spaceStatusPending ? (
            <>
              {!signedIn ? (
                <div className="sync-actions">
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
              signedIn &&
              status.remote.state === "not-connected" ? (
                <>
                  {status.canEnable ? (
                    <SyncSafetyReview
                      preflight={preflight}
                      confirmWarnings={confirmWarnings}
                      onConfirmWarnings={setConfirmWarnings}
                    />
                  ) : null}
                  <div className="sync-actions">
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
                  </div>
                </>
              ) : null}

              {mode === "enable" &&
              signedIn &&
              status.remote.state === "connected" &&
              (!mergeReviewNeeded || hasUncheckpointedChanges) ? (
                <div className="sync-actions">
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
                      <FileWarning /> Review changes
                    </button>
                  ) : storageBlocksCurrentUpload ? (
                    <button
                      type="button"
                      className="primary-action"
                      data-sync-manage-storage
                      disabled={busy !== null}
                      onClick={() => void openHelp("account")}
                    >
                      <UserRound /> Manage storage
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`${
                        syncActionIsPrimary
                          ? "primary-action"
                          : "secondary-action"
                      } sync-run`}
                      data-sync-run
                      disabled={busy !== null || operationsBlocked}
                      onClick={() => void syncNow()}
                    >
                      {busy === "sync" ? (
                        <LoaderCircle className="spin" />
                      ) : status.entitlement.state === "read-only" ? (
                        <CloudDownload />
                      ) : syncHistory?.state === "ahead" ? (
                        <CloudUpload />
                      ) : syncHistory?.state === "behind" ? (
                        <CloudDownload />
                      ) : (
                        <RefreshCw />
                      )}
                      {busy === "sync" ? "Syncing…" : syncAction}
                    </button>
                  )}
                </div>
              ) : null}

              {mode === "clone" && signedIn && status.canClone ? (
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

          {(syncResult?.state === "conflict" ||
            syncHistory?.state === "diverged") &&
          status.remote.state === "connected" ? (
            <SyncMergeWorkspace
              onStatusChange={(merge) => {
                setMergeActive(merge.state === "merging")
                onMergeStatusChange?.(merge)
              }}
              onReviewMerge={onReviewMerge}
              onSpaceChange={onSpaceChange}
            />
          ) : null}

          {syncResult?.state === "conflict" ||
          syncHistory?.state === "diverged" ? (
            <section className="sync-section" data-sync-recovery>
              <div className="sync-section-head">
                <h3>Recovery copies</h3>
              </div>
              <p className="sync-caption">
                {mergeActive
                  ? "Abort the active merge before creating Recovery Spaces."
                  : "These copies will not merge or overwrite either side."}
              </p>
              <div className="sync-stat-grid">
                <div>
                  <strong data-sync-local-ahead>
                    {syncResult?.ahead ?? syncHistory?.ahead ?? 0}
                  </strong>
                  <span>Local-only updates</span>
                </div>
                <div>
                  <strong data-sync-hosted-ahead>
                    {syncResult?.behind ?? syncHistory?.behind ?? 0}
                  </strong>
                  <span>Cloud-only updates</span>
                </div>
              </div>
              <div className="sync-actions sync-recovery-actions">
                <button
                  type="button"
                  className="secondary-action"
                  data-sync-recover-local
                  disabled={busy !== null || mergeActive}
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
                  disabled={busy !== null || mergeActive}
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

          {mode === "enable" && signedIn ? (
            <SyncStorageSection
              storage={storage}
              storageState={storageState}
              spaceBytes={preflight?.totalBytes ?? spaceBytes}
              spaceSizeState={spaceSizeState}
              blocksUpload={storageBlocksCurrentUpload}
              managing={busy === "help"}
              onManageStorage={
                storageNeedsAttention || storageBlocksCurrentUpload
                  ? () => void openHelp("account")
                  : undefined
              }
            />
          ) : null}

          {signedIn ? (
            <section className="sync-section sync-about" data-sync-details>
              <div className="sync-section-head">
                <h3>Connection</h3>
              </div>
              <dl className="sync-kv">
                <div>
                  <dt>Account</dt>
                  <dd>{accountName}</dd>
                </div>
                <div>
                  <dt>Access</dt>
                  <dd>{accessLabel(status)}</dd>
                </div>
                <div>
                  <dt>Cloud</dt>
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
                <details className="sync-more sync-diagnostics">
                  <summary>
                    <ChevronRight /> Last operation
                    <span>
                      {formatDuration(
                        runTelemetry?.durationMs ?? syncElapsedMs
                      )}
                    </span>
                  </summary>
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
                </details>
              ) : null}

              <div className="sync-ghost-row">
                <button
                  type="button"
                  className="sync-ghost"
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
                  className="sync-ghost"
                  disabled={busy !== null}
                  onClick={() =>
                    void window.eidosLite.openSettingsDestination("logs")
                  }
                >
                  <FolderDown /> Open logs
                </button>
                <button
                  type="button"
                  className="sync-ghost sync-sign-out"
                  disabled={busy !== null}
                  onClick={() => void signOut()}
                >
                  <UserRound />
                  {busy === "sign-out" ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </aside>
    </div>
  )
}

function shouldRenderSyncAccessGate(status: EidosSyncStatus): boolean {
  return (
    status.account.state === "signed-out" ||
    (status.entitlement.state !== "read-only" &&
      status.entitlement.state !== "read-write")
  )
}

function SyncAccessGate({
  mode,
  variant,
  platform,
  environment,
  accountState,
  entitlementState,
  busy,
  checking,
  onClose,
  onSignIn,
  onManageAccess,
  onCheckAgain,
}: {
  mode: "enable" | "clone"
  variant: "dialog" | "inspector"
  platform: string
  environment: EidosSyncStatus["environment"]
  accountState: EidosSyncStatus["account"]["state"]
  entitlementState: EidosSyncStatus["entitlement"]["state"]
  busy: BusyAction
  checking: boolean
  onClose(): void
  onSignIn(): void
  onManageAccess(): void
  onCheckAgain(): void
}) {
  const signedOut = accountState === "signed-out"
  const blocked = entitlementState === "blocked"
  return (
    <div
      className={
        variant === "dialog" ? "sync-dialog-backdrop" : "sync-inspector-host"
      }
      role="presentation"
      data-platform={platform}
    >
      <aside
        className={`sync-dialog${variant === "inspector" ? " sync-dialog-inspector" : ""}`}
        role={variant === "dialog" ? "dialog" : "complementary"}
        aria-modal={variant === "dialog" ? "true" : undefined}
        aria-labelledby="sync-dialog-title"
        data-sync-mode={mode}
        data-sync-environment={environment}
        data-sync-account-state={accountState}
        data-sync-can-enable="false"
        data-sync-access-gate={signedOut ? "sign-in" : "access-required"}
      >
        <header>
          <div>
            <Cloud />
            <span className="sync-dialog-title-line">
              <strong id="sync-dialog-title">Sync</strong>
              {environment === "staging" ? (
                <span
                  className="environment-badge"
                  data-service-environment="staging"
                >
                  Staging
                </span>
              ) : null}
            </span>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close Eidos Sync"
          >
            <X />
          </button>
        </header>
        <div className="sync-dialog-body sync-gate">
          <span className="sync-hero-icon sync-gate-icon" aria-hidden="true">
            {signedOut ? <LogIn /> : <ShieldCheck />}
          </span>
          <h2>{signedOut ? "Sign in to use Sync" : "Sync access required"}</h2>
          <p>
            {signedOut
              ? "Use your eidos.space account to check whether Sync is available."
              : blocked
                ? "Manage your Sync access on eidos.space, then check again here."
                : "Apply for or review Sync access on eidos.space, then check again here."}
          </p>
          <div className="sync-actions">
            {signedOut ? (
              <button
                type="button"
                className="primary-action"
                data-sync-sign-in=""
                disabled={busy !== null}
                onClick={onSignIn}
              >
                {busy === "sign-in" ? (
                  <LoaderCircle className="spin" />
                ) : (
                  <LogIn />
                )}
                {busy === "sign-in" ? "Waiting for your browser…" : "Sign in"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="primary-action"
                  data-sync-manage-access=""
                  disabled={busy !== null}
                  onClick={onManageAccess}
                >
                  <UserRound /> Manage Sync access
                </button>
                <button
                  type="button"
                  className="secondary-action"
                  data-sync-check-access=""
                  disabled={busy !== null || checking}
                  onClick={onCheckAgain}
                >
                  {checking ? <LoaderCircle className="spin" /> : <RefreshCw />}
                  {checking ? "Checking…" : "Check again"}
                </button>
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  )
}

function FailureActionIcon({ action }: { action: EidosSyncFailure["action"] }) {
  if (action === "sign-in") return <LogIn />
  if (action === "manage-account") return <UserRound />
  if (action === "clone-hosted") return <FolderDown />
  if (action === "review-local") return <FileWarning />
  if (action === "update") return <CloudDownload />
  return <RefreshCw />
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
  checking,
  hasCachedAccount,
  syncHistory,
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
  checking: boolean
  hasCachedAccount: boolean
  syncHistory?: SpaceSyncHistoryStatus
}): SyncOverview {
  if (loadError) {
    if (loadError.kind === "offline") {
      return {
        icon: CloudOff,
        title: loadError.title,
        message: loadError.message,
        tone: "warning",
      }
    }
    if (loadError.kind === "session-expired") {
      return {
        icon: LogIn,
        title: loadError.title,
        message: loadError.message,
        tone: "warning",
      }
    }
    return {
      icon: AlertTriangle,
      title: loadError.title,
      message: loadError.message,
      tone: "danger",
    }
  }
  if (failure) {
    if (queue?.state === "retry-wait") {
      return {
        icon: Clock,
        title: "Sync will try again soon",
        message: queue.nextAttemptAtMs
          ? `Next attempt around ${new Date(queue.nextAttemptAtMs).toLocaleTimeString()}. Your local files are safe.`
          : "Eidos will retry when the service is available. Your local files are safe.",
        tone: "warning",
      }
    }
    if (failure.state === "offline") {
      return {
        icon: CloudOff,
        title: failure.title,
        message: failure.message,
        tone: "warning",
      }
    }
    return {
      icon: AlertTriangle,
      title: failure.title,
      message: failure.message,
      tone: "danger",
    }
  }
  if (progress?.state === "active") {
    return {
      icon: LoaderCircle,
      spin: true,
      title:
        progress.operation === "clone" && selectedRepository
          ? `Opening ${repositoryDisplayName(selectedRepository)}`
          : OPERATION_LABELS[progress.operation],
      tone: "active",
    }
  }
  if (checking && hasCachedAccount) {
    return {
      icon: LoaderCircle,
      spin: true,
      title:
        mode === "clone" ? "Refreshing your Spaces" : "Checking this Space",
      tone: "neutral",
    }
  }
  if (mode === "clone") {
    if (status.account.state === "signed-out") {
      return {
        icon: LogIn,
        title: "Sign in to see your Spaces",
        message:
          "Choose a synced Space and Eidos will keep an ordinary local copy for offline work.",
        tone: "neutral",
      }
    }
    if (!status.canClone) {
      return {
        icon: ShieldCheck,
        title: "Sync access is required",
        message:
          "Manage your account to open a synced Space. Existing local Spaces are unaffected.",
        tone: "warning",
      }
    }
    return {
      icon: FolderDown,
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
      icon: AlertTriangle,
      title: "Local and cloud both changed",
      message:
        "Review conflicting files and tables in Changes. Nothing was overwritten.",
      tone: "danger",
    }
  }
  if (result?.state === "read-only") {
    return {
      icon: CheckCircle2,
      title: "Everything is up to date",
      message:
        "Cloud updates were downloaded. Your changes remain on this device.",
      tone: "success",
    }
  }
  if (result?.state === "synced") {
    const message =
      result.pulled && result.pushed
        ? "Downloaded and uploaded saved versions."
        : result.pulled
          ? "Downloaded cloud updates."
          : result.pushed
            ? "Uploaded saved versions."
            : undefined
    return {
      icon: CheckCircle2,
      title: "Everything is up to date",
      message,
      tone: "success",
    }
  }
  if (status.account.state === "signed-out") {
    return {
      icon: Cloud,
      title: "Keep this Space in sync",
      message:
        "Back up your work and continue on another device. Local work never requires an account.",
      tone: "neutral",
    }
  }
  if (status.remote.state === "not-connected") {
    if (!status.canEnable) {
      return {
        icon: ShieldCheck,
        title: "Sync access is required",
        message:
          "Manage your account to connect this Space. Local files are unaffected.",
        tone: "warning",
      }
    }
    return {
      icon: Cloud,
      title: "Sync is off for this Space",
      message:
        "Connect once to keep saved versions available on your other devices.",
      tone: "neutral",
    }
  }
  if (hasUncheckpointedChanges) {
    return {
      icon: FileWarning,
      title: "Unsaved changes",
      message: "Only saved versions sync. Review and save a version first.",
      tone: "active",
    }
  }
  if (queue?.state === "running") {
    return {
      icon: LoaderCircle,
      spin: true,
      title: "Syncing this Space",
      tone: "active",
    }
  }
  if (queue?.state === "pending") {
    return {
      icon: Clock,
      title: "Sync queued",
      message: "Saved changes will upload in the background.",
      tone: "active",
    }
  }
  if (queue?.state === "retry-wait") {
    return {
      icon: Clock,
      title: "Sync will try again soon",
      message: queue.nextAttemptAtMs
        ? `Next attempt around ${new Date(queue.nextAttemptAtMs).toLocaleTimeString()}. Local files are safe.`
        : "Local files are safe while Eidos waits for the service.",
      tone: "warning",
    }
  }
  if (status.entitlement.state === "read-only") {
    return {
      icon: CloudDownload,
      title: "Download only",
      message:
        "Cloud updates can be downloaded. Changes you make stay on this device.",
      tone: "neutral",
    }
  }
  if (progress?.operation === "connect" && progress.state === "completed") {
    return {
      icon: CheckCircle2,
      title: "Sync is ready",
      message: "The first cloud copy is complete.",
      tone: "success",
    }
  }
  if (syncHistory?.state === "diverged") {
    return {
      icon: AlertTriangle,
      title: "Local and cloud both changed",
      message:
        "Review conflicting files and tables in Changes. Nothing was overwritten.",
      tone: "warning",
    }
  }
  const storage = syncStorageUsage(status)
  const storageState = storage ? syncStorageState(storage) : "normal"
  const storageLimitsCurrentUpload =
    storage !== null &&
    (storage.reservedBytes > 0 || syncHistory?.state === "ahead")
  if (
    status.entitlement.state === "read-write" &&
    storage &&
    storageLimitsCurrentUpload
  ) {
    const projectedBytes = storage.usedBytes + storage.reservedBytes
    if (storageState === "over") {
      const pendingExceedsPlan =
        storage.reservedBytes > 0 && storage.usedBytes <= storage.quotaBytes
      return {
        icon: HardDrive,
        title: pendingExceedsPlan
          ? "Pending upload exceeds your plan"
          : "Cloud storage is over its limit",
        message: pendingExceedsPlan
          ? "Manage storage before this upload can finish. Your local files remain safe."
          : "Manage storage before uploading more. Your local files remain safe.",
        tone: "danger",
      }
    }
    if (storageState === "full") {
      const pendingFillsPlan =
        storage.reservedBytes > 0 && storage.usedBytes < storage.quotaBytes
      return {
        icon: HardDrive,
        title: pendingFillsPlan
          ? "Pending upload will fill cloud storage"
          : "Cloud storage is full",
        message: pendingFillsPlan
          ? "This upload uses the remaining plan capacity. Your local files remain safe."
          : "Manage storage before uploading more. Your local files remain safe.",
        tone: "danger",
      }
    }
  }
  if (syncHistory?.state === "ahead") {
    return {
      icon: CloudUpload,
      title: `${syncHistory.ahead} saved ${syncHistory.ahead === 1 ? "version" : "versions"} to upload`,
      tone: "active",
    }
  }
  if (syncHistory?.state === "behind") {
    return {
      icon: CloudDownload,
      title: `${syncHistory.behind} ${syncHistory.behind === 1 ? "update is" : "updates are"} available`,
      tone: "active",
    }
  }
  if (syncHistory?.state === "up_to_date") {
    return {
      icon: CheckCircle2,
      title: "Everything is up to date",
      tone: "success",
    }
  }
  return {
    icon: Cloud,
    title: "Sync is on",
    tone: "neutral",
  }
}

function syncPrimaryAction({
  status,
  syncHistory,
  hasUncheckpointedChanges,
  syncResult,
}: {
  status: EidosSyncStatus
  syncHistory?: SpaceSyncHistoryStatus
  hasUncheckpointedChanges: boolean
  syncResult: EidosSyncRunResult | null
}): string {
  if (hasUncheckpointedChanges) return "Review changes"
  if (status.entitlement.state === "read-only") return "Get cloud updates"
  if (syncHistory?.state === "ahead") {
    return `Upload ${syncHistory.ahead} ${syncHistory.ahead === 1 ? "version" : "versions"}`
  }
  if (syncHistory?.state === "behind") {
    return `Download ${syncHistory.behind} ${syncHistory.behind === 1 ? "update" : "updates"}`
  }
  if (syncHistory?.state === "diverged") return "Check cloud status"
  if (syncResult) return "Check again"
  return "Check now"
}

function syncDirection(
  syncHistory?: SpaceSyncHistoryStatus
): { upload: number; download: number } | null {
  if (!syncHistory || syncHistory.state === "unknown") return null
  const upload = Math.max(0, syncHistory.ahead)
  const download = Math.max(0, syncHistory.behind)
  return upload > 0 || download > 0 ? { upload, download } : null
}

function transferPercent(progress: EidosSyncProgress): number | null {
  const transfer = progress.transfer
  if (!transfer || transfer.totalBytes === null || transfer.totalBytes <= 0) {
    return null
  }
  return Math.max(
    0,
    Math.min(
      100,
      Math.round((transfer.transferredBytes / transfer.totalBytes) * 100)
    )
  )
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

function SyncStorageSection({
  storage,
  storageState,
  spaceBytes,
  spaceSizeState,
  blocksUpload,
  managing,
  onManageStorage,
}: {
  storage: SyncStorageUsage | null
  storageState: SyncStorageState
  spaceBytes?: number
  spaceSizeState: SpaceSizeState
  blocksUpload: boolean
  managing: boolean
  onManageStorage?: () => void
}) {
  const projectedBytes = storage
    ? storage.usedBytes + storage.reservedBytes
    : undefined
  const overageBytes =
    storage && projectedBytes
      ? Math.max(0, projectedBytes - storage.quotaBytes)
      : 0
  const hasQuota = storage !== null && storage.quotaBytes > 0
  const usedTrackBytes =
    storage && hasQuota
      ? Math.min(Math.max(0, storage.usedBytes), storage.quotaBytes)
      : 0
  const pendingTrackBytes =
    storage && hasQuota
      ? Math.min(
          Math.max(0, storage.reservedBytes),
          Math.max(0, storage.quotaBytes - usedTrackBytes)
        )
      : 0
  const segmentWidth = (value: number) =>
    storage && hasQuota ? `${(value / storage.quotaBytes) * 100}%` : "0%"
  const flag =
    storageState === "warning"
      ? "Running low"
      : storageState === "full"
        ? storage &&
          storage.reservedBytes > 0 &&
          storage.usedBytes < storage.quotaBytes
          ? "Full after pending upload"
          : "Storage full"
        : storageState === "over"
          ? `${formatBytes(overageBytes)} over plan`
          : null
  return (
    <section
      className="sync-section sync-storage"
      aria-label="Storage"
      data-sync-space-bytes={
        spaceSizeState === "available" || spaceSizeState === "cached"
          ? spaceBytes
          : undefined
      }
      data-sync-space-size-state={spaceSizeState}
      data-sync-storage-used={storage?.usedBytes}
      data-sync-storage-remaining={storage?.remainingBytes}
      data-sync-storage-quota={storage?.quotaBytes}
      data-sync-storage-state={storage ? storageState : "unavailable"}
    >
      <div className="sync-section-head">
        <h3>Storage</h3>
        {flag ? <span className="sync-section-flag">{flag}</span> : null}
      </div>

      {hasQuota && storage ? (
        <>
          <div className="sync-meter">
            <progress
              className="sync-storage-semantic-progress"
              aria-label={`${formatBytes(storage.usedBytes)} of ${formatBytes(storage.quotaBytes)} cloud storage used`}
              max={storage.quotaBytes}
              value={storage.usedBytes}
            />
            <div className="sync-storage-segments" aria-hidden="true">
              <span
                className="sync-storage-segment sync-storage-segment-cloud"
                data-sync-storage-segment="cloud-used"
                data-sync-storage-segment-bytes={usedTrackBytes}
                style={{ width: segmentWidth(usedTrackBytes) }}
              />
              <span
                className="sync-storage-segment sync-storage-segment-pending"
                data-sync-storage-segment="pending"
                data-sync-storage-segment-bytes={pendingTrackBytes}
                style={{ width: segmentWidth(pendingTrackBytes) }}
              />
            </div>
          </div>
          <p className="sync-caption" data-sync-storage-caption>
            {formatBytes(storage.usedBytes)} of{" "}
            {formatBytes(storage.quotaBytes)}
            {" · "}
            {formatStoragePercent(storage.usedBytes, storage.quotaBytes)} used
            {storage.reservedBytes > 0
              ? ` · ${formatBytes(storage.reservedBytes)} pending`
              : ""}
          </p>
        </>
      ) : (
        <p className="sync-caption" data-sync-storage-caption>
          {storage
            ? "No cloud storage is available on this plan."
            : "Cloud usage is temporarily unavailable."}
        </p>
      )}

      <details
        className="sync-more"
        data-sync-storage-disclosure
        open={blocksUpload || undefined}
      >
        <summary>
          <ChevronRight /> Breakdown
        </summary>
        <dl className="sync-kv">
          <div data-sync-space-size>
            <dt>This Space on this device</dt>
            <dd
              aria-live="polite"
              title={
                spaceSizeState === "cached"
                  ? "Showing the last calculated size while Eidos refreshes it"
                  : undefined
              }
            >
              {spaceSizeState === "loading" ? (
                <>
                  <LoaderCircle className="spin" /> Calculating…
                </>
              ) : (spaceSizeState === "available" ||
                  spaceSizeState === "cached") &&
                spaceBytes !== undefined ? (
                formatBytes(spaceBytes)
              ) : (
                "Unavailable"
              )}
            </dd>
          </div>
          <div>
            <dt>Cloud used</dt>
            <dd>{storage ? formatBytes(storage.usedBytes) : "Unavailable"}</dd>
          </div>
          <div>
            <dt>Plan total</dt>
            <dd>{storage ? formatBytes(storage.quotaBytes) : "Unavailable"}</dd>
          </div>
          {storage &&
          storage.reservedBytes > 0 &&
          projectedBytes !== undefined ? (
            <div data-sync-storage-reserved={storage.reservedBytes}>
              <dt>Pending upload</dt>
              <dd>
                {formatBytes(storage.reservedBytes)} ·{" "}
                {formatBytes(projectedBytes)} projected
              </dd>
            </div>
          ) : null}
          {storage ? (
            <div>
              <dt>Available</dt>
              <dd>
                {formatBytes(storage.remainingBytes)}
                {storage.reservedBytes > 0 ? " after pending uploads" : ""}
              </dd>
            </div>
          ) : null}
        </dl>
        <p className="sync-note">
          This Space is a local sync size, not its billed cloud contribution.
          Cloud usage can differ because of history and deduplication.
        </p>
        {onManageStorage ? (
          <div className="sync-actions">
            <button
              type="button"
              className="secondary-action sync-storage-manage"
              data-sync-manage-storage
              disabled={managing}
              onClick={onManageStorage}
            >
              <UserRound /> {managing ? "Opening account…" : "Manage storage"}
            </button>
          </div>
        ) : null}
      </details>
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
  const percent = transferPercent(progress)
  const transfer = progress.transfer
  const transferVerb =
    transfer?.direction === "upload" ? "Uploaded" : "Downloaded"
  const transferValueText = transfer
    ? transfer.totalBytes === null
      ? `${transferVerb} ${formatBytes(transfer.transferredBytes)}; calculating total size`
      : `${transferVerb} ${formatBytes(transfer.transferredBytes)} of ${formatBytes(transfer.totalBytes)}`
    : undefined
  return (
    <section
      className="sync-progress"
      data-sync-progress={progress.state}
      data-sync-operation={progress.operation}
      data-sync-progress-phase={progress.phase}
      role="status"
    >
      <div
        className="sync-progress-track"
        role="progressbar"
        aria-label={
          percent === null ? "Transfer in progress" : `${percent}% complete`
        }
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={transferValueText}
      >
        {percent === null ? (
          <span className="sync-progress-indeterminate" />
        ) : (
          <span
            className="sync-progress-fill"
            style={{ width: `${percent}%` }}
          />
        )}
      </div>
      <div className="sync-progress-meta">
        <span>{friendlyProgressDetail(progress)}</span>
        <span>
          {percent === null ? formatDuration(elapsedMs) : `${percent}%`}
        </span>
      </div>
      {transfer ? (
        <div
          className="sync-progress-metrics"
          data-sync-transfer={transfer.direction}
        >
          <span data-sync-transfer-bytes>
            {transferVerb}{" "}
            <strong>{formatBytes(transfer.transferredBytes)}</strong>
            {transfer.totalBytes === null
              ? ""
              : ` of ${formatBytes(transfer.totalBytes)}`}
          </span>
          {transfer.totalBytes === null ? (
            <span data-sync-transfer-total>Calculating total size…</span>
          ) : null}
          <span data-sync-transfer-speed>
            {transfer.bytesPerSecond > 0
              ? `${formatBytes(transfer.bytesPerSecond)}/s`
              : "Measuring speed…"}
          </span>
          <span data-sync-transfer-remaining>
            {transfer.totalBytes === null
              ? "Calculating time left…"
              : transfer.estimatedRemainingMs === null
                ? "Estimating time left…"
                : transfer.estimatedRemainingMs <= 0
                  ? "Finishing…"
                  : `${formatDuration(transfer.estimatedRemainingMs)} left`}
          </span>
        </div>
      ) : null}
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
  const [query, setQuery] = useState("")
  const visibleRepositories = [...(repositories?.repositories ?? [])]
    .sort((left, right) => {
      const namedDifference =
        Number(isOpaqueRepositoryName(left)) -
        Number(isOpaqueRepositoryName(right))
      return (
        namedDifference ||
        right.createdAtMs - left.createdAtMs ||
        left.displayName.localeCompare(right.displayName)
      )
    })
    .filter((repository) => {
      const needle = query.trim().toLocaleLowerCase()
      if (!needle) return true
      return `${repositoryDisplayName(repository)} ${repository.name}`
        .toLocaleLowerCase()
        .includes(needle)
    })
  return (
    <section className="sync-repositories" data-sync-repositories>
      <div className="sync-section-head">
        <h3>Your synced Spaces</h3>
        {repositories ? (
          <span className="sync-section-flag sync-section-count">
            {repositories.repositories.length}{" "}
            {repositories.repositories.length === 1 ? "Space" : "Spaces"}
          </span>
        ) : null}
      </div>
      {busy === "repositories" ? (
        <p className="sync-loading" role="status">
          <LoaderCircle className="spin" /> Loading your synced Spaces…
        </p>
      ) : repositories?.repositories.length ? (
        <div className="sync-repository-list">
          {repositories.repositories.length > 8 ? (
            <label className="sync-repository-search">
              <span className="sr-only">Search synced Spaces</span>
              <input
                type="search"
                placeholder="Search Spaces"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
              />
            </label>
          ) : null}
          {visibleRepositories.map((repository) => {
            const selected =
              selectedRepository?.remoteUrl === repository.remoteUrl
            const displayName = repositoryDisplayName(repository)
            return (
              <button
                type="button"
                className="sync-repository"
                data-sync-open-space={displayName}
                key={repository.remoteUrl}
                disabled={busy !== null || disabled}
                onClick={() => onSelect(repository)}
              >
                <span className="sync-repository-icon" aria-hidden="true">
                  {busy === "clone" && selected ? (
                    <LoaderCircle className="spin" />
                  ) : (
                    <FolderDown />
                  )}
                </span>
                <span className="sync-repository-copy">
                  <strong>{displayName}</strong>
                  <small>
                    Created{" "}
                    {new Date(repository.createdAtMs).toLocaleDateString()}
                    {isOpaqueRepositoryName(repository)
                      ? ` · ${shortRepositoryId(repository.name)}`
                      : ""}
                  </small>
                </span>
                <ChevronRight />
              </button>
            )
          })}
          {visibleRepositories.length === 0 ? (
            <p className="sync-empty">No Spaces match “{query}”.</p>
          ) : null}
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

function isOpaqueRepositoryName(repository: EidosSyncRepository): boolean {
  const normalizedDisplayName = repository.displayName.trim().toLowerCase()
  const normalizedName = repository.name.trim().toLowerCase()
  return (
    normalizedDisplayName === normalizedName ||
    /^[a-f0-9]{24,}$/i.test(repository.displayName.trim())
  )
}

function repositoryDisplayName(repository: EidosSyncRepository): string {
  return isOpaqueRepositoryName(repository)
    ? "Unnamed Space"
    : repository.displayName
}

function shortRepositoryId(value: string): string {
  return value.length > 10 ? `${value.slice(0, 8)}…` : value
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
      className="sync-section sync-safety-review"
      data-sync-preflight
      data-sync-preflight-blocked={preflight?.blockerCount ? "true" : "false"}
    >
      <div className="sync-section-head">
        <h3>First upload check</h3>
        {preflight ? (
          <span className="sync-section-count">
            {preflight.fileCount} files · {formatBytes(preflight.totalBytes)} ·{" "}
            {preflight.eidosFileCount} Eidos Files
          </span>
        ) : null}
      </div>
      {preflight ? (
        <>
          {preflight.blockerCount > 0 ? (
            <div className="sync-flag-list" role="alert">
              <header>
                <AlertTriangle />
                <strong>Fix these files before connecting</strong>
              </header>
              <PreflightEntries
                entries={preflight.blockers}
                total={preflight.blockerCount}
              />
            </div>
          ) : null}

          {preflight.warningCount > 0 ? (
            <div className="sync-flag-list">
              <header>
                <FileWarning />
                <strong>Review files before upload</strong>
              </header>
              <p>
                These files may contain private information or use more cloud
                storage than expected.
              </p>
              <PreflightEntries
                entries={preflight.warnings}
                total={preflight.warningCount}
              />
            </div>
          ) : preflight.blockerCount === 0 ? (
            <p className="sync-clear">
              <CheckCircle2 /> No files need your review.
            </p>
          ) : null}

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

          <details className="sync-more sync-scope-details">
            <summary>
              <ChevronRight /> Not included ({preflight.excludedCount})
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

function syncStatusFromAccountContext(
  context: ReturnType<typeof readSyncAccountContext>
): EidosSyncStatus | null {
  if (!context) return null
  return {
    environment: context.environment,
    account: context.account,
    device: context.device,
    entitlement: context.entitlement,
    remote: { state: "not-connected" },
    canEnable: false,
    canClone:
      context.account.state === "signed-in" &&
      (context.entitlement.state === "read-only" ||
        context.entitlement.state === "read-write"),
    blocker:
      context.account.state === "signed-out"
        ? {
            code: "authentication-required",
            message: "Sign in with your eidos.space account to continue.",
          }
        : context.entitlement.state === "blocked"
          ? {
              code: "access-blocked",
              message: "Eidos Sync access is currently blocked.",
            }
          : context.entitlement.state === "none" ||
              context.entitlement.state === "not-checked"
            ? {
                code: "access-required",
                message: "Eidos Sync access is required.",
              }
            : context.entitlement.state === "read-only"
              ? {
                  code: "read-only",
                  message: "Eidos Sync access is read-only.",
                }
              : null,
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
  if (usedBytes === undefined || quotaBytes === undefined) {
    return null
  }
  const pendingBytes = reservedBytes ?? 0
  return {
    usedBytes,
    reservedBytes: pendingBytes,
    quotaBytes,
    remainingBytes:
      remainingBytes ?? Math.max(0, quotaBytes - usedBytes - pendingBytes),
  }
}

function syncStorageState(storage: SyncStorageUsage): SyncStorageState {
  const projectedBytes = storage.usedBytes + storage.reservedBytes
  if (storage.quotaBytes <= 0) return projectedBytes > 0 ? "over" : "full"
  if (projectedBytes > storage.quotaBytes) return "over"
  if (projectedBytes === storage.quotaBytes) return "full"
  return projectedBytes / storage.quotaBytes >= 0.9 ? "warning" : "normal"
}

function formatStoragePercent(usedBytes: number, quotaBytes: number): string {
  if (quotaBytes <= 0) return usedBytes > 0 ? "Over 100%" : "0%"
  if (usedBytes <= 0) return "0%"
  const percent = (usedBytes / quotaBytes) * 100
  if (percent < 1) return "<1%"
  if (percent < 10) {
    return `${percent.toLocaleString(undefined, {
      maximumFractionDigits: 1,
    })}%`
  }
  return `${Math.round(percent).toLocaleString()}%`
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
