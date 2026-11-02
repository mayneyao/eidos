import type { EidosSyncProgress } from "../shared/contracts"

const NATIVE_DETAILS = {
  preparing: "Preparing Sync data",
  uploading: "Sending data to server",
  downloading: "Receiving data from server",
  verifying: "Verifying uploaded data",
  applying: "Applying downloaded data",
} as const

/** Percentages describe a trusted transfer budget, never local work or verification. */
export function syncProgressPresentation(progress: EidosSyncProgress) {
  const transferring =
    progress.state === "active" &&
    (progress.nativePhase
      ? progress.nativePhase === "uploading" ||
        progress.nativePhase === "downloading" ||
        (progress.nativePhase === "verifying" &&
          progress.transfer?.direction === "download")
      : ["push", "fetch", "pull"].includes(progress.phase))
  const total = progress.transfer?.totalBytes
  const transferred = progress.transfer?.transferredBytes
  const percent =
    transferring &&
    total !== undefined &&
    total !== null &&
    Number.isFinite(total) &&
    total > 0 &&
    typeof transferred === "number" &&
    Number.isFinite(transferred) &&
    transferred >= 0 &&
    transferred <= total
      ? Math.max(0, Math.min(100, Math.floor((transferred / total) * 100)))
      : null
  const verifying =
    progress.nativePhase === "verifying" ||
    (!progress.nativePhase && progress.phase === "validate")
  const applying =
    progress.nativePhase === "applying" ||
    (!progress.nativePhase && progress.phase === "reopen")
  return {
    transferring,
    percent,
    detail:
      progress.state === "completed"
        ? "Sync complete"
        : progress.state === "failed"
          ? "Sync interrupted"
          : progress.nativePhase
            ? NATIVE_DETAILS[progress.nativePhase]
            : undefined,
    hint:
      progress.state !== "active"
        ? undefined
        : verifying
          ? progress.nativePhase === "verifying"
            ? "Checking the cloud copy before finishing."
            : "Checking synced files before finishing."
          : applying
            ? "Applying files and finishing local setup."
            : undefined,
  }
}
