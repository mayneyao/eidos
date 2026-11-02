import type { GraftTransferProgress } from "../../shared/graft-sdk-contracts"

export interface GraftSyncProgress {
  phase:
    | "preparing"
    | "uploading"
    | "downloading"
    | "verifying"
    | "applying"
    | "completed"
    | "failed"
    | "cancelled"
  requestId?: number
  transfer?: GraftTransferProgress
}

/** Keep operation byte budgets separate from the SDK's request budgets. */
export function graftSyncProgressOptions(
  report?: (progress: GraftTransferProgress) => void
) {
  let latest: GraftTransferProgress = {
    direction: "upload",
    transferredBytes: 0,
    totalIsFinal: false,
  }
  let phase: GraftSyncProgress["phase"] | undefined
  return {
    onProgress: report
      ? (progress: GraftTransferProgress) => {
          latest = progress
          report(phase ? { ...progress, syncPhase: phase } : progress)
        }
      : undefined,
    onSyncProgress: report
      ? (event: GraftSyncProgress) => {
          const phaseChanged = phase !== event.phase
          phase = event.phase
          if (phaseChanged) {
            latest = {
              direction:
                phase === "downloading" || phase === "verifying"
                  ? "download"
                  : "upload",
              transferredBytes: 0,
              totalIsFinal: false,
            }
          }
          // Body counters reset on each request and must never replace cumulative
          // operation counters or become an overall percentage.
          if (phaseChanged || !event.transfer)
            report({ ...latest, syncPhase: phase })
        }
      : undefined,
  }
}
