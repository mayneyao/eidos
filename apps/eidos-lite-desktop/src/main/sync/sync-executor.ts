import { randomUUID } from "node:crypto"

import type {
  EidosSyncPhase,
  EidosSyncProgress,
  EidosSyncRunResponse,
} from "../../shared/contracts"
import type { SpaceSession } from "../space/space-session"
import type { SyncControlPlane } from "./sync-control-plane"
import {
  classifySyncFailure,
  createPackagedSyncFault,
  type PackagedSyncFault,
} from "./sync-failure"
import { SyncRunTracker } from "./sync-run-tracker"

export class SyncExecutor {
  private readonly injectedFailures: PackagedSyncFault[]

  constructor(
    private readonly syncControl: SyncControlPlane,
    injectedFailures: readonly PackagedSyncFault[] = []
  ) {
    this.injectedFailures = [...injectedFailures]
  }

  async run(
    session: SpaceSession,
    emitProgress: (progress: EidosSyncProgress) => void
  ): Promise<EidosSyncRunResponse> {
    const tracker = new SyncRunTracker(randomUUID(), emitProgress)
    let currentPhase: EidosSyncPhase = "authorization"
    const transition = (phase: EidosSyncPhase, detail: string) => {
      currentPhase = phase
      tracker.transition(phase, detail)
    }
    try {
      transition("authorization", "Authorizing this device and Hosted Space")
      const injectedFailure = this.injectedFailures.shift()
      if (injectedFailure) {
        transition(
          injectedFailure.phase,
          `Testing ${injectedFailure.code} recovery`
        )
        throw createPackagedSyncFault(injectedFailure)
      }
      const remoteUrl = await session.officialSyncRemoteUrl()
      if (!remoteUrl)
        throw new Error("This Space is not connected to Eidos Sync")
      const access = await this.syncControl.repositoryAccess(remoteUrl)
      const outcome = await session.syncHostedRemote(
        access.accessToken,
        access.access,
        transition
      )
      return {
        ok: true,
        result: {
          ...outcome,
          runId: tracker.runId,
          telemetry: tracker.complete(outcome.message),
        },
      }
    } catch (error) {
      const failure = classifySyncFailure(error, currentPhase)
      return {
        ok: false,
        runId: tracker.runId,
        failure,
        telemetry: tracker.fail(failure.message),
      }
    }
  }
}
