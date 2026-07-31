import type {
  EidosSyncOperation,
  EidosSyncPhase,
  EidosSyncPhaseTiming,
  EidosSyncProgress,
  EidosSyncTelemetry,
} from "../../shared/contracts"

interface ActivePhase {
  phase: EidosSyncPhase
  detail: string
  startedAtMs: number
}

export class SyncRunTracker {
  private readonly startedAtMs: number
  private readonly phases: EidosSyncPhaseTiming[] = []
  private active: ActivePhase | null = null

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
    })
  }
}
