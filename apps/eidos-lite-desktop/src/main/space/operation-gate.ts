import { randomUUID } from "node:crypto"

import type { SpaceOperationState } from "../../shared/contracts"
import type {
  SpaceOperationJournal,
  SpaceOperationJournalEntry,
} from "./operation-journal"
import { SpaceRepositoryCoordinator } from "./repository-coordinator"

interface MaterializationHooks {
  closeRuntimes(): Promise<void>
  validateWorktree(): Promise<void>
  reopenRuntimes(): Promise<void>
}

interface MaterializationOptions<T> {
  kind: string
  detail?: string
  beforeClose?(): Promise<void>
  materialize(): Promise<T>
  afterValidate?(result: T): Promise<void>
}

interface PendingDrain {
  promise: Promise<void>
  resolve(): void
}

function pendingDrain(): PendingDrain {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

export class SpaceOperationGate {
  private state: SpaceOperationState = {
    phase: "ready",
    recoverable: true,
  }
  private activeMutations = 0
  private acceptingMutations = true
  private closing = false
  private drain: PendingDrain | null = null
  private readonly listeners = new Set<(state: SpaceOperationState) => void>()

  constructor(
    private readonly journal: SpaceOperationJournal,
    private readonly hooks: MaterializationHooks,
    private readonly repository = new SpaceRepositoryCoordinator()
  ) {}

  current(): SpaceOperationState {
    return { ...this.state }
  }

  hasActiveMutations(): boolean {
    return this.activeMutations > 0
  }

  subscribe(listener: (state: SpaceOperationState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async recoverInterruptedOperation(): Promise<SpaceOperationJournalEntry | null> {
    const interrupted = await this.journal.read()
    if (!interrupted) return null
    this.acceptingMutations = false
    try {
      this.transition(
        "validating",
        `Recovering interrupted ${interrupted.kind}`
      )
      await this.hooks.closeRuntimes()
      await this.hooks.validateWorktree()
      this.transition(
        "reopening",
        `Reopening after interrupted ${interrupted.kind}`
      )
      await this.hooks.reopenRuntimes()
      await this.journal.clear()
      this.acceptingMutations = true
      this.transition("ready")
      return interrupted
    } catch (error) {
      this.transition("failed", this.errorMessage(error), false)
      throw error
    }
  }

  async withMutation<T>(operation: () => Promise<T>): Promise<T> {
    if (
      !this.acceptingMutations ||
      this.closing ||
      this.state.phase === "closed"
    ) {
      throw new Error(
        `Space is ${this.state.phase}; local mutations are paused`
      )
    }
    this.activeMutations += 1
    try {
      return await operation()
    } finally {
      this.activeMutations -= 1
      if (this.activeMutations === 0) {
        this.drain?.resolve()
        this.drain = null
      }
    }
  }

  withRepositoryOperation<T>(
    detail: string,
    operation: (signal: AbortSignal) => Promise<T>,
    options: {
      key?: string
      replace?: boolean
      preemptible?: boolean
    } = {}
  ): Promise<T> {
    if (this.closing || this.state.phase === "closed") {
      return Promise.reject(new Error("Space is closed"))
    }
    return this.repository.runForeground(async (signal) => {
      if (this.closing || this.state.phase === "closed") {
        throw new Error("Space is closed")
      }
      this.transition("syncing", detail)
      try {
        return await operation(signal)
      } finally {
        if (this.state.phase === "syncing") this.transition("ready")
      }
    }, options)
  }

  withQuiescedRepositoryOperation<T>(
    detail: string,
    operation: () => Promise<T>
  ): Promise<T> {
    return this.withRepositoryOperation(detail, async () => {
      this.acceptingMutations = false
      this.transition("quiescing", detail)
      await this.waitForMutationDrain()
      this.transition("syncing", detail)
      try {
        return await operation()
      } finally {
        this.acceptingMutations = !this.closing
      }
    })
  }

  withMaterialization<T>(options: MaterializationOptions<T>): Promise<T> {
    return this.withRepositoryOperation(
      options.detail ?? options.kind,
      async () => {
        const operationId = randomUUID()
        const startedAt = new Date().toISOString()
        const journal = async (
          phase: SpaceOperationJournalEntry["phase"],
          detail?: string
        ) =>
          this.journal.write({
            operationId,
            kind: options.kind,
            phase,
            startedAt,
            updatedAt: new Date().toISOString(),
            ...(detail ? { detail } : {}),
          })

        this.acceptingMutations = false
        this.transition("quiescing", options.detail ?? options.kind)
        try {
          await journal("quiescing", options.detail)
        } catch (error) {
          // No runtime has been closed and no worktree operation has started.
          // Without a durable journal it is unsafe to proceed, but ordinary
          // local editing can remain available.
          this.acceptingMutations = true
          this.transition("ready")
          throw error
        }
        await this.waitForMutationDrain()
        if (options.beforeClose) {
          try {
            await options.beforeClose()
          } catch (error) {
            try {
              await this.journal.clear()
              this.acceptingMutations = true
              this.transition("ready")
            } catch (recoveryError) {
              this.transition("failed", this.errorMessage(recoveryError), false)
              throw recoveryError
            }
            throw error
          }
        }
        let runtimesClosed = false
        try {
          await this.hooks.closeRuntimes()
          runtimesClosed = true
          this.transition("materializing", options.detail ?? options.kind)
          await journal("materializing", options.detail)
          const result = await options.materialize()
          this.transition("validating", options.detail ?? options.kind)
          await journal("validating", options.detail)
          await this.hooks.validateWorktree()
          await options.afterValidate?.(result)
          this.transition("reopening", options.detail ?? options.kind)
          await journal("reopening", options.detail)
          await this.hooks.reopenRuntimes()
          await this.journal.clear()
          this.acceptingMutations = true
          this.transition("ready")
          return result
        } catch (error) {
          if (!runtimesClosed) {
            this.acceptingMutations = false
            this.transition("failed", this.errorMessage(error), false)
            throw error
          }
          try {
            await this.hooks.validateWorktree()
            await this.hooks.reopenRuntimes()
            await this.journal.clear()
          } catch (recoveryError) {
            this.acceptingMutations = false
            this.transition("failed", this.errorMessage(recoveryError), false)
            throw recoveryError
          }
          this.acceptingMutations = true
          this.transition("ready")
          throw error
        }
      }
    )
  }

  async close(): Promise<void> {
    if (this.closing || this.state.phase === "closed") {
      await this.repository.whenIdle()
      return
    }
    this.closing = true
    this.acceptingMutations = false
    await this.waitForMutationDrain()
    await this.repository.close()
    this.transition("closed")
  }

  private waitForMutationDrain(): Promise<void> {
    if (this.activeMutations === 0) return Promise.resolve()
    this.drain ??= pendingDrain()
    return this.drain.promise
  }

  private transition(
    phase: SpaceOperationState["phase"],
    detail?: string,
    recoverable = true
  ): void {
    this.state = {
      phase,
      recoverable,
      ...(detail ? { detail } : {}),
    }
    for (const listener of this.listeners) listener(this.current())
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
