import { useEffect, useState } from "react"
import {
  Cloud,
  CloudDownload,
  CloudUpload,
  Copy,
  HardDrive,
  LoaderCircle,
  LogIn,
  ShieldAlert,
  ShieldCheck,
  Timer,
  UserRound,
  X,
} from "lucide-react"

import type {
  EidosSyncFailure,
  EidosSyncRepositoryList,
  EidosSyncProgress,
  EidosSyncQueueStatus,
  EidosSyncRecoveryResult,
  EidosSyncRunResult,
  EidosSyncStatus,
  EidosSyncTelemetry,
  SpaceSnapshot,
} from "../shared/contracts"

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function SyncPanel({
  mode,
  onClose,
  onClone,
  onRequestClone,
  onReviewLocal,
  onSpaceChange,
}: {
  mode: "enable" | "clone"
  onClose(): void
  onClone?(snapshot: SpaceSnapshot): void
  onRequestClone?(): void
  onReviewLocal?(): void
  onSpaceChange?(snapshot: SpaceSnapshot): void
}) {
  const [status, setStatus] = useState<EidosSyncStatus | null>(null)
  const [repositories, setRepositories] =
    useState<EidosSyncRepositoryList | null>(null)
  const [syncResult, setSyncResult] = useState<EidosSyncRunResult | null>(null)
  const [syncFailure, setSyncFailure] = useState<EidosSyncFailure | null>(null)
  const [syncFailureTelemetry, setSyncFailureTelemetry] =
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
  const [busy, setBusy] = useState<
    | "loading"
    | "sign-in"
    | "sign-out"
    | "enable"
    | "repositories"
    | "clone"
    | "sync"
    | "recover-local"
    | "recover-hosted"
    | "help"
    | null
  >("loading")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const value = await window.eidosLite.getSyncStatus()
        if (!active) return
        setStatus(value)
        if (mode === "clone" && value.canClone) {
          setBusy("repositories")
          const listed = await window.eidosLite.listSyncRepositories()
          if (!active) return
          setRepositories(listed)
        }
        setBusy(null)
      } catch (cause) {
        if (!active) return
        setError(errorMessage(cause))
        setBusy(null)
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [mode])

  useEffect(
    () =>
      window.eidosLite.onSyncProgress((progress) => {
        setSyncProgress(progress)
        setSyncElapsedMs(progress.elapsedMs)
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
    []
  )

  useEffect(() => {
    let active = true
    void window.eidosLite.getSyncQueueStatus().then(
      (queue) => {
        if (!active) return
        setSyncQueueStatus(queue)
        if (queue?.lastFailure) setSyncFailure(queue.lastFailure)
      },
      (cause) => {
        if (active) setError(errorMessage(cause))
      }
    )
    const unsubscribe = window.eidosLite.onSyncQueueChanged((queue) => {
      if (!active) return
      setSyncQueueStatus(queue)
      if (queue.lastFailure) setSyncFailure(queue.lastFailure)
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

  const signIn = async () => {
    setBusy("sign-in")
    setError(null)
    try {
      const signedIn = await window.eidosLite.beginSyncSignIn()
      setStatus(signedIn)
      setSyncFailure(null)
      setSyncFailureTelemetry(null)
      if (mode === "clone" && signedIn.canClone) {
        setBusy("repositories")
        setRepositories(await window.eidosLite.listSyncRepositories())
      }
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(null)
    }
  }

  const signOut = async () => {
    setBusy("sign-out")
    setError(null)
    try {
      setStatus(await window.eidosLite.signOutSync())
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(null)
    }
  }

  const enableSync = async () => {
    setBusy("enable")
    setError(null)
    try {
      setStatus(await window.eidosLite.enableSync())
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(null)
    }
  }

  const cloneRepository = async (remoteUrl: string) => {
    setBusy("clone")
    setError(null)
    try {
      const snapshot = await window.eidosLite.cloneSyncRepository(remoteUrl)
      if (snapshot) onClone?.(snapshot)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(null)
    }
  }

  const syncNow = async () => {
    setBusy("sync")
    setError(null)
    setSyncResult(null)
    setSyncFailure(null)
    setSyncFailureTelemetry(null)
    setSyncProgress(null)
    setSyncProgressHistory([])
    setSyncElapsedMs(0)
    setRecoveryResult(null)
    try {
      const response = await window.eidosLite.runSync()
      if (response.ok) {
        setSyncResult(response.result)
        onSpaceChange?.(response.result.snapshot)
        setStatus(await window.eidosLite.getSyncStatus())
      } else {
        setSyncFailure(response.failure)
        setSyncFailureTelemetry(response.telemetry)
      }
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(null)
    }
  }

  const recoverLocal = async () => {
    setBusy("recover-local")
    setError(null)
    setRecoveryResult(null)
    try {
      setRecoveryResult(await window.eidosLite.copyLocalRecoverySpace())
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(null)
    }
  }

  const recoverHosted = async () => {
    setBusy("recover-hosted")
    setError(null)
    setRecoveryResult(null)
    try {
      setRecoveryResult(await window.eidosLite.cloneHostedRecoverySpace())
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(null)
    }
  }

  const runTelemetry = syncResult?.telemetry ?? syncFailureTelemetry
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

  const runFailureAction = async () => {
    if (!syncFailure) return
    if (syncFailure.action === "retry-now") {
      await syncNow()
      return
    }
    if (syncFailure.action === "sign-in") {
      await signIn()
      return
    }
    if (syncFailure.action === "manage-account") {
      setBusy("help")
      try {
        await window.eidosLite.openSyncHelp("account")
      } catch (cause) {
        setError(errorMessage(cause))
      } finally {
        setBusy(null)
      }
      return
    }
    if (syncFailure.action === "update") {
      setBusy("help")
      try {
        await window.eidosLite.openSyncHelp("download")
      } catch (cause) {
        setError(errorMessage(cause))
      } finally {
        setBusy(null)
      }
      return
    }
    if (syncFailure.action === "clone-hosted") {
      onRequestClone?.()
      return
    }
    if (syncFailure.action === "review-local") {
      onReviewLocal?.()
      return
    }
    setSyncFailure(null)
    setSyncFailureTelemetry(null)
  }

  return (
    <div className="sync-dialog-backdrop" role="presentation">
      <aside
        className="sync-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-dialog-title"
        data-sync-mode={mode}
        data-sync-environment={status?.environment ?? "loading"}
        data-sync-account-state={status?.account.state ?? "loading"}
        data-sync-can-enable={status?.canEnable ? "true" : "false"}
        data-sync-can-clone={status?.canClone ? "true" : "false"}
        data-sync-remote-state={status?.remote.state ?? "loading"}
      >
        <header>
          <div>
            <Cloud />
            <span>
              <strong id="sync-dialog-title">
                {mode === "enable" ? "Enable Eidos Sync" : "Clone Synced Space"}
              </strong>
              <small>Whole-Space Hosted Remote</small>
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

        <div className="sync-dialog-body">
          <p className="sync-local-note">
            <HardDrive /> Local files remain available without an account.
          </p>

          {syncQueueStatus && syncQueueStatus.state !== "idle" ? (
            <section
              className="sync-queue-state"
              data-sync-queue-state={syncQueueStatus.state}
            >
              {syncQueueStatus.state === "running" ? (
                <LoaderCircle className="spin" />
              ) : (
                <Timer />
              )}
              <div>
                <strong>
                  {syncQueueStatus.state === "running"
                    ? "Syncing the whole Space"
                    : syncQueueStatus.state === "retry-wait"
                      ? "Background retry scheduled"
                      : syncQueueStatus.state === "pending"
                        ? "Whole-Space Sync queued"
                        : "Background Sync paused"}
                </strong>
                <p>
                  {syncQueueStatus.state === "retry-wait" &&
                  syncQueueStatus.nextAttemptAtMs
                    ? `Attempt ${syncQueueStatus.attempt + 1} of ${syncQueueStatus.maxAttempts} after ${new Date(syncQueueStatus.nextAttemptAtMs).toLocaleTimeString()}.`
                    : syncQueueStatus.state === "paused"
                      ? "Use the action below when you are ready. Local files remain safe."
                      : "One pending item represents all current Space checkpoints."}
                </p>
              </div>
            </section>
          ) : null}

          {busy === "loading" ? (
            <p className="sync-loading" role="status">
              <LoaderCircle className="spin" /> Reading secure account state…
            </p>
          ) : null}

          {status ? (
            <>
              <dl className="sync-status-list">
                <div>
                  <dt>Environment</dt>
                  <dd>{status.environment}</dd>
                </div>
                <div>
                  <dt>Account</dt>
                  <dd>
                    {status.account.state === "signed-in"
                      ? (status.account.user?.email ??
                        status.account.user?.name ??
                        "Signed in")
                      : "Signed out"}
                  </dd>
                </div>
                <div>
                  <dt>Device</dt>
                  <dd>{status.device.state.replace(/-/g, " ")}</dd>
                </div>
                <div>
                  <dt>Entitlement</dt>
                  <dd>{status.entitlement.state.replace(/-/g, " ")}</dd>
                </div>
                {status.entitlement.quotaBytes !== undefined ? (
                  <div>
                    <dt>Storage quota</dt>
                    <dd>{formatBytes(status.entitlement.quotaBytes)}</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Hosted Remote</dt>
                  <dd>{status.remote.state.replace(/-/g, " ")}</dd>
                </div>
              </dl>

              {status.blocker ? (
                <section className="sync-gate-message">
                  <ShieldAlert />
                  <div>
                    <strong>{status.blocker.message}</strong>
                    <p>{status.entitlement.detail}</p>
                  </div>
                </section>
              ) : (
                <section className="sync-gate-message sync-gate-ready">
                  <ShieldCheck />
                  <div>
                    <strong>Account and device checks passed.</strong>
                    <p>{status.entitlement.detail}</p>
                  </div>
                </section>
              )}

              {status.account.state === "signed-out" ? (
                <button
                  type="button"
                  className="primary-action sync-sign-in"
                  data-sync-sign-in
                  disabled={busy !== null}
                  onClick={() => void signIn()}
                >
                  {busy === "sign-in" ? (
                    <LoaderCircle className="spin" />
                  ) : (
                    <LogIn />
                  )}
                  {busy === "sign-in"
                    ? "Waiting for browser…"
                    : "Sign in with eidos.space"}
                </button>
              ) : (
                <>
                  {mode === "enable" && status.canEnable ? (
                    <button
                      type="button"
                      className="primary-action sync-enable"
                      data-sync-enable
                      disabled={busy !== null}
                      onClick={() => void enableSync()}
                    >
                      {busy === "enable" ? (
                        <LoaderCircle className="spin" />
                      ) : (
                        <Cloud />
                      )}
                      {busy === "enable"
                        ? "Connecting whole Space…"
                        : "Connect and push whole Space"}
                    </button>
                  ) : null}
                  {mode === "enable" && status.remote.state === "connected" ? (
                    <button
                      type="button"
                      className="primary-action sync-run"
                      data-sync-run
                      disabled={busy !== null}
                      onClick={() => void syncNow()}
                    >
                      {busy === "sync" ? (
                        <LoaderCircle className="spin" />
                      ) : (
                        <CloudUpload />
                      )}
                      {busy === "sync" ? "Syncing whole Space…" : "Sync Now"}
                    </button>
                  ) : null}
                  {mode === "clone" && status.canClone ? (
                    <section
                      className="sync-repositories"
                      data-sync-repositories
                    >
                      <header>
                        <strong>Hosted Spaces</strong>
                        <small>{repositories?.namespace ?? "Loading…"}</small>
                      </header>
                      {busy === "repositories" ? (
                        <p className="sync-loading" role="status">
                          <LoaderCircle className="spin" /> Loading Hosted
                          Spaces…
                        </p>
                      ) : repositories?.repositories.length ? (
                        <div>
                          {repositories.repositories.map((repository) => (
                            <button
                              type="button"
                              className="sync-repository"
                              data-sync-clone-remote={repository.remoteUrl}
                              key={repository.remoteUrl}
                              disabled={busy !== null}
                              onClick={() =>
                                void cloneRepository(repository.remoteUrl)
                              }
                            >
                              {busy === "clone" ? (
                                <LoaderCircle className="spin" />
                              ) : (
                                <CloudDownload />
                              )}
                              <span>
                                <strong>{repository.name}</strong>
                                <small>
                                  {new Date(
                                    repository.createdAtMs
                                  ).toLocaleString()}
                                </small>
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="sync-empty">
                          This account has no Hosted Spaces to clone.
                        </p>
                      )}
                    </section>
                  ) : null}
                  <button
                    type="button"
                    className="secondary-action sync-sign-out"
                    disabled={busy !== null}
                    onClick={() => void signOut()}
                  >
                    <UserRound />
                    {busy === "sign-out" ? "Signing out…" : "Sign out"}
                  </button>
                </>
              )}
            </>
          ) : null}

          {error ? (
            <p className="welcome-error" role="alert">
              <ShieldAlert /> {error}
            </p>
          ) : null}
          {syncProgress || syncResult || syncFailure ? (
            <section
              className="sync-progress"
              data-sync-progress={syncProgress?.state ?? "completed"}
              data-sync-progress-phase={
                syncProgress?.phase ?? visiblePhases.at(-1)?.phase
              }
              role="status"
            >
              <header>
                <Timer />
                <strong>
                  {syncProgress?.state === "active"
                    ? syncProgress.detail
                    : "Sync timing"}
                </strong>
                <span>
                  {formatDuration(runTelemetry?.durationMs ?? syncElapsedMs)}
                </span>
              </header>
              <ol>
                {visiblePhases.map((phase, index) => (
                  <li
                    data-sync-phase={phase.phase}
                    key={`${phase.phase}-${index}`}
                  >
                    <span>{syncPhaseLabel(phase.phase)}</span>
                    {runTelemetry ? (
                      <small>{formatDuration(phase.durationMs)}</small>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          {syncResult ? (
            <section
              className={`sync-result sync-result-${syncResult.state}`}
              data-sync-result={syncResult.state}
              data-sync-duration-ms={syncResult.telemetry.durationMs}
              role="status"
            >
              {syncResult.state === "conflict" ? (
                <ShieldAlert />
              ) : (
                <ShieldCheck />
              )}
              <div>
                <strong>
                  {syncResult.state === "conflict"
                    ? "Sync needs attention"
                    : syncResult.state === "read-only"
                      ? "Read-only Sync complete"
                      : "Sync complete"}
                </strong>
                <p>{syncResult.message}</p>
              </div>
            </section>
          ) : null}
          {syncResult?.state === "conflict" ? (
            <section className="sync-recovery" data-sync-recovery>
              <header>
                <strong>Preserve both histories</strong>
                <p>
                  Both choices create a new ordinary folder. This Space and its
                  checkpoints remain unchanged.
                </p>
              </header>
              <div>
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
                    ? "Copying Local Space…"
                    : "Keep Local as Recovery Space"}
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
                    <CloudDownload />
                  )}
                  {busy === "recover-hosted"
                    ? "Cloning Hosted Space…"
                    : "Clone Hosted to New Folder"}
                </button>
              </div>
            </section>
          ) : null}
          {syncFailure ? (
            <section
              className={`sync-failure sync-failure-${syncFailure.state}`}
              data-sync-failure={syncFailure.code}
              data-sync-failure-state={syncFailure.state}
              data-sync-failure-action={syncFailure.action}
              data-sync-local-safe={syncFailure.localSafe ? "true" : "false"}
              role="alert"
            >
              <ShieldAlert />
              <div>
                <strong>{syncFailure.title}</strong>
                <p>{syncFailure.message}</p>
                <small>
                  <HardDrive /> Local files safe · Continue editing without Sync
                </small>
                <div className="sync-failure-actions">
                  <button
                    type="button"
                    className="secondary-action"
                    data-sync-failure-primary-action
                    disabled={
                      busy !== null ||
                      (syncFailure.action === "clone-hosted" &&
                        !onRequestClone) ||
                      (syncFailure.action === "review-local" && !onReviewLocal)
                    }
                    onClick={() => void runFailureAction()}
                  >
                    {busy === "help" ? (
                      <LoaderCircle className="spin" />
                    ) : (
                      <ShieldCheck />
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
                      <HardDrive /> Work locally
                    </button>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}
          {recoveryResult ? (
            <section
              className="sync-result"
              data-sync-recovery-result={recoveryResult.kind}
              role="status"
            >
              <ShieldCheck />
              <div>
                <strong>
                  {recoveryResult.kind === "local-copy"
                    ? "Local Recovery Space created"
                    : "Hosted Recovery Space cloned"}
                </strong>
                <p>
                  {recoveryResult.name} opened in a new window at{" "}
                  {recoveryResult.displayPath}.
                </p>
              </div>
            </section>
          ) : null}
        </div>

        <footer>
          {mode === "clone"
            ? "Clone validates the entire temporary Space before publishing it as an ordinary local folder."
            : "Eidos Lite will not provision or push a Remote until account, device, entitlement, and quota checks succeed."}
        </footer>
      </aside>
    </div>
  )
}

function syncPhaseLabel(phase: EidosSyncProgress["phase"]): string {
  return {
    authorization: "Authorize",
    fetch: "Fetch",
    analyze: "Analyze",
    drain: "Drain & close",
    pull: "Pull",
    validate: "Validate",
    reopen: "Reopen",
    push: "Push",
  }[phase]
}

function formatDuration(value: number): string {
  if (value < 1_000) return `${Math.round(value)} ms`
  return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)} s`
}

function formatBytes(value: number): string {
  if (value === 0) return "0 bytes"
  const gibibytes = value / (1024 * 1024 * 1024)
  return `${gibibytes.toLocaleString(undefined, { maximumFractionDigits: 1 })} GiB`
}
