import type {
  EidosSyncOperation,
  EidosSyncPhase,
  EidosSyncPhaseTiming,
  EidosSyncProgress,
  EidosSyncTelemetry,
} from "../../shared/contracts"
import type { GraftTransferProgress } from "../../shared/graft-sdk-contracts"

interface ActivePhase {
  phase: EidosSyncPhase
  detail: string
  startedAtMs: number
  transfer?: EidosSyncProgress["transfer"]
  transferStartedAtMs?: number
  transferStartedBytes?: number
}

// Transfer samples arrive per network chunk. Emitting each one crosses the IPC
// boundary and re-renders the panel, so coalesce them to a human-visible rate
// while always preserving phase changes and the final byte count.
const TRANSFER_EMIT_INTERVAL_MS = 100

export class SyncRunTracker {
  private readonly startedAtMs: number
  private readonly phases: EidosSyncPhaseTiming[] = []
  private active: ActivePhase | null = null
  private lastTransferEmitMs: number | null = null

  constructor(
    readonly runId: string,
    private readonly emit: (progress: EidosSyncProgress) => void,
    private readonly now: () => number = Date.now,
    private readonly operation: EidosSyncOperation = "sync"
  ) {
    this.startedAtMs = this.now()
  }

  transition(phase: EidosSyncPhase, detail: string): void {
    const now = this.now()
    if (this.active?.phase === phase && this.active.detail === detail) {
      this.emitProgress("active", now)
      return
    }
    this.completeActive(now)
    this.active = { phase, detail, startedAtMs: now }
    this.lastTransferEmitMs = null
    this.emitProgress("active", now)
  }

  transfer(progress: GraftTransferProgress): void {
    if (!this.active) return
    const now = this.now()
    const transferredBytes = Math.max(0, progress.transferredBytes)
    const totalBytes =
      progress.totalBytes === undefined
        ? null
        : Math.max(transferredBytes, progress.totalBytes)
    const directionChanged =
      this.active.transfer?.direction !== undefined &&
      this.active.transfer.direction !== progress.direction
    const transferStartedAtMs = directionChanged
      ? now
      : (this.active.transferStartedAtMs ?? now)
    const transferStartedBytes = directionChanged
      ? transferredBytes
      : (this.active.transferStartedBytes ?? transferredBytes)
    const sampledBytes = Math.max(0, transferredBytes - transferStartedBytes)
    const sampledMs = Math.max(0, now - transferStartedAtMs)
    const bytesPerSecond =
      sampledMs > 0 ? (sampledBytes * 1_000) / sampledMs : 0
    const remainingBytes =
      totalBytes === null ? null : Math.max(0, totalBytes - transferredBytes)
    this.active.transferStartedAtMs = transferStartedAtMs
    this.active.transferStartedBytes = transferStartedBytes
    this.active.transfer = {
      direction: progress.direction,
      transferredBytes,
      totalBytes,
      bytesPerSecond,
      estimatedRemainingMs:
        remainingBytes === null || bytesPerSecond <= 0
          ? null
          : Math.round((remainingBytes / bytesPerSecond) * 1_000),
    }
    const finalSample = totalBytes !== null && transferredBytes >= totalBytes
    const due =
      this.lastTransferEmitMs === null ||
      directionChanged ||
      finalSample ||
      now - this.lastTransferEmitMs >= TRANSFER_EMIT_INTERVAL_MS
    if (!due) return
    this.lastTransferEmitMs = now
    this.emitProgress("active", now)
  }

  complete(detail = "Sync complete"): EidosSyncTelemetry {
    const completedAtMs = this.now()
    this.completeActive(completedAtMs)
    const last = this.phases.at(-1)
    this.emit({
      runId: this.runId,
      operation: this.operation,
      state: "completed",
      phase: last?.phase ?? "analyze",
      detail,
      startedAtMs: this.startedAtMs,
      phaseStartedAtMs: completedAtMs - Math.max(0, last?.durationMs ?? 0),
      elapsedMs: Math.max(0, completedAtMs - this.startedAtMs),
    })
    return {
      startedAtMs: this.startedAtMs,
      completedAtMs,
      durationMs: Math.max(0, completedAtMs - this.startedAtMs),
      phases: [...this.phases],
    }
  }

  fail(detail: string): EidosSyncTelemetry {
    const failedAtMs = this.now()
    const active = this.active
    this.completeActive(failedAtMs)
    const last = this.phases.at(-1)
    this.emit({
      runId: this.runId,
      operation: this.operation,
      state: "failed",
      phase: active?.phase ?? last?.phase ?? "authorization",
      detail,
      startedAtMs: this.startedAtMs,
      phaseStartedAtMs:
        active?.startedAtMs ?? failedAtMs - Math.max(0, last?.durationMs ?? 0),
      elapsedMs: Math.max(0, failedAtMs - this.startedAtMs),
    })
    return {
      startedAtMs: this.startedAtMs,
      completedAtMs: failedAtMs,
      durationMs: Math.max(0, failedAtMs - this.startedAtMs),
      phases: [...this.phases],
    }
  }

  private completeActive(completedAtMs: number): void {
    if (!this.active) return
    this.phases.push({
      phase: this.active.phase,
      detail: this.active.detail,
      durationMs: Math.max(0, completedAtMs - this.active.startedAtMs),
    })
    this.active = null
  }

  private emitProgress(state: EidosSyncProgress["state"], now: number): void {
    if (!this.active) return
    this.emit({
      runId: this.runId,
      operation: this.operation,
      state,
      phase: this.active.phase,
      detail: this.active.detail,
      startedAtMs: this.startedAtMs,
      phaseStartedAtMs: this.active.startedAtMs,
      elapsedMs: Math.max(0, now - this.startedAtMs),
      ...(this.active.transfer ? { transfer: this.active.transfer } : {}),
    })
  }
}
