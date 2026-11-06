import { randomUUID } from "node:crypto"

import type {
  EidosSyncAction,
  EidosSyncPhase,
  EidosSyncProgress,
  EidosSyncRunResponse,
} from "../../shared/contracts"
import { eidosLiteLogger, logCorrelationKey } from "../logging"
import type { SpaceSession } from "../space/space-session"
import type { SyncControlPlane } from "./sync-control-plane"
import {
  classifySyncFailure,
  classifyCustomSyncFailure,
  createPackagedSyncFault,
  type PackagedSyncFault,
} from "./sync-failure"
import { SyncRunTracker } from "./sync-run-tracker"
import { customSyncOrigin } from "../../shared/sync-encryption"

export class SyncExecutor {
  private readonly injectedFailures: PackagedSyncFault[]

  constructor(
    private readonly syncControl: SyncControlPlane,
    injectedFailures: readonly PackagedSyncFault[] = [],
    private readonly prepareEncryptedSync?: (
      session: SpaceSession,
      remote: string,
      token: string
    ) => Promise<void>
  ) {
    this.injectedFailures = [...injectedFailures]
  }

  async run(
    session: SpaceSession,
    emitProgress: (progress: EidosSyncProgress) => void,
    action: EidosSyncAction = "fetch",
    automatic?: { signal: AbortSignal }
  ): Promise<EidosSyncRunResponse> {
    const tracker = new SyncRunTracker(randomUUID(), emitProgress)
    const logger = eidosLiteLogger()
    const spaceKey = logger
      ? logCorrelationKey(session.canonical.id)
      : undefined
    logger?.info("sync.run.started", {
      runId: tracker.runId,
      spaceKey,
    })
    let currentPhase: EidosSyncPhase = "authorization"
    let custom = false
    const transition = (phase: EidosSyncPhase, detail: string) => {
      currentPhase = phase
      logger?.debug("sync.run.phase", {
        runId: tracker.runId,
        spaceKey,
        phase,
        detail,
      })
      tracker.transition(phase, detail)
    }
    try {
      automatic?.signal.throwIfAborted()
      transition("authorization", "Authorizing this device and Hosted Space")
      const injectedFailure = this.injectedFailures.shift()
      if (injectedFailure) {
        transition(
          injectedFailure.phase,
          `Testing ${injectedFailure.code} recovery`
        )
        throw createPackagedSyncFault(injectedFailure)
      }
      const remoteUrl = await session.officialSyncRemoteUrl(automatic)
      automatic?.signal.throwIfAborted()
      custom = Boolean(remoteUrl && customSyncOrigin(remoteUrl))
      if (!remoteUrl)
        throw new Error("This Space is not connected to Eidos Sync")
      const encryptionUuid =
        typeof session.syncEncryptionUuid === "function"
          ? await session.syncEncryptionUuid()
          : undefined
      const authorization = encryptionUuid
        ? this.syncControl.repositoryAccess(
            remoteUrl,
            undefined,
            encryptionUuid
          )
        : this.syncControl.repositoryAccess(remoteUrl)
      const access = await interruptibleAuthorization(
        authorization,
        automatic?.signal
      )
      automatic?.signal.throwIfAborted()
      if ((await session.officialSyncRemoteUrl(automatic)) !== remoteUrl)
        throw new Error(
          "The cloud connection changed. Check its status before syncing again."
        )
      await this.prepareEncryptedSync?.(session, remoteUrl, access.accessToken)
      automatic?.signal.throwIfAborted()
      access.assertCurrent?.()
      const outcome = await session.syncHostedRemote(
        access.accessToken,
        access.access,
        transition,
        (progress) => tracker.transfer(progress),
        action,
        remoteUrl,
        automatic
      )
      access.assertCurrent?.()
      const telemetry = tracker.complete(outcome.message)
      logger?.info("sync.run.completed", {
        runId: tracker.runId,
        spaceKey,
        durationMs: telemetry.durationMs,
        phases: telemetry.phases.map((phase) => ({
          phase: phase.phase,
          durationMs: phase.durationMs,
        })),
      })
      return {
        ok: true,
        result: {
          ...outcome,
          runId: tracker.runId,
          telemetry,
        },
      }
    } catch (error) {
      if (
        automatic &&
        (automatic.signal.aborted ||
          (error instanceof Error && error.name === "AbortError"))
      )
        throw error
      const failure = custom
        ? classifyCustomSyncFailure(error, currentPhase)
        : classifySyncFailure(error, currentPhase)
      const telemetry = tracker.fail(failure.message)
      logger?.warn(
        "sync.run.failed",
        {
          runId: tracker.runId,
          spaceKey,
          phase: currentPhase,
          failureCode: failure.code,
          status: failure.status,
          retryable: failure.retryable,
          durationMs: telemetry.durationMs,
        },
        error
      )
      return {
        ok: false,
        runId: tracker.runId,
        failure,
        telemetry,
      }
    }
  }
}

// Authorization does not hold a repository lock. Let foreground/manual work
// proceed on cancellation while the bounded, read-only access check settles.
function interruptibleAuthorization<T>(
  request: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  if (!signal) return request
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) abort()
    void request
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort))
  })
}
