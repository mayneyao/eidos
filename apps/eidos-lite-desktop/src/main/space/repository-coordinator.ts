import { AsyncLocalStorage } from "node:async_hooks"

type RepositoryTaskPriority = "foreground" | "background"

interface RepositoryTask<T> {
  key?: string
  priority: RepositoryTaskPriority
  preemptible: boolean
  controller: AbortController
  operation(signal: AbortSignal): Promise<T>
  promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

interface ForegroundTaskOptions {
  key?: string
  replace?: boolean
  preemptible?: boolean
}

interface BackgroundTaskOptions {
  preemptible?: boolean
}

/**
 * Owns scheduling and cancellation for one Space's repository session.
 *
 * Foreground work runs before queued background work. A foreground request may
 * preempt a cancellable background refresh, while background requests never
 * cancel each other. Keyed background work is coalesced and keyed foreground
 * reads can explicitly replace an older request.
 */
export class SpaceRepositoryCoordinator {
  private readonly context = new AsyncLocalStorage<AbortSignal>()
  private readonly foregroundQueue: RepositoryTask<unknown>[] = []
  private readonly backgroundQueue: RepositoryTask<unknown>[] = []
  private readonly keyedTasks = new Map<string, RepositoryTask<unknown>>()
  private readonly idleWaiters = new Set<() => void>()
  private running: RepositoryTask<unknown> | null = null
  private closing = false

  runForeground<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    options: ForegroundTaskOptions = {}
  ): Promise<T> {
    if (this.closing)
      return Promise.reject(repositoryAbortError("Space is closed"))
    const currentSignal = this.context.getStore()
    if (currentSignal) return operation(currentSignal)
    if (options.replace && options.key) this.cancel(options.key)
    const task = this.createTask("foreground", operation, {
      key: options.key,
      preemptible: options.preemptible ?? false,
    })
    this.foregroundQueue.push(task as RepositoryTask<unknown>)
    if (this.running?.priority === "background" && this.running.preemptible) {
      this.running.controller.abort()
    }
    this.pump()
    return task.promise
  }

  runBackground<T>(
    key: string,
    operation: (signal: AbortSignal) => Promise<T>,
    options: BackgroundTaskOptions = {}
  ): Promise<T> {
    if (this.closing)
      return Promise.reject(repositoryAbortError("Space is closed"))
    const currentSignal = this.context.getStore()
    if (currentSignal) return operation(currentSignal)
    const existing = this.keyedTasks.get(key)
    if (existing) return existing.promise as Promise<T>
    const task = this.createTask("background", operation, {
      key,
      preemptible: options.preemptible ?? false,
    })
    this.backgroundQueue.push(task as RepositoryTask<unknown>)
    this.pump()
    return task.promise
  }

  cancel(key: string): void {
    const task = this.keyedTasks.get(key)
    if (!task) return
    if (this.running === task) {
      // A running task may take time to observe cancellation (for example while a
      // utility process is still opening). Release the key immediately so newer
      // work does not coalesce onto a task that has already been cancelled.
      if (this.keyedTasks.get(key) === task) this.keyedTasks.delete(key)
      task.controller.abort()
      return
    }
    this.removeQueuedTask(task)
    this.keyedTasks.delete(key)
    task.controller.abort()
    task.reject(repositoryAbortError())
    this.resolveIdleIfNeeded()
  }

  async close(): Promise<void> {
    if (this.closing) return this.whenIdle()
    this.closing = true
    for (const task of [
      ...this.foregroundQueue.splice(0),
      ...this.backgroundQueue.splice(0),
    ]) {
      if (task.key && this.keyedTasks.get(task.key) === task) {
        this.keyedTasks.delete(task.key)
      }
      task.controller.abort()
      task.reject(repositoryAbortError("Space is closed"))
    }
    if (this.running?.preemptible) this.running.controller.abort()
    this.resolveIdleIfNeeded()
    await this.whenIdle()
  }

  whenIdle(): Promise<void> {
    if (!this.running && this.queuedCount() === 0) return Promise.resolve()
    return new Promise((resolve) => this.idleWaiters.add(resolve))
  }

  private createTask<T>(
    priority: RepositoryTaskPriority,
    operation: (signal: AbortSignal) => Promise<T>,
    options: { key?: string; preemptible: boolean }
  ): RepositoryTask<T> {
    let resolve: (value: T) => void = () => undefined
    let reject: (error: unknown) => void = () => undefined
    const promise = new Promise<T>((complete, fail) => {
      resolve = complete
      reject = fail
    })
    const task: RepositoryTask<T> = {
      ...options,
      priority,
      controller: new AbortController(),
      operation,
      promise,
      resolve,
      reject,
    }
    if (task.key) this.keyedTasks.set(task.key, task as RepositoryTask<unknown>)
    return task
  }

  private pump(): void {
    if (this.running) return
    const task = this.foregroundQueue.shift() ?? this.backgroundQueue.shift()
    if (!task) {
      this.resolveIdleIfNeeded()
      return
    }
    if (this.closing) {
      if (task.key && this.keyedTasks.get(task.key) === task) {
        this.keyedTasks.delete(task.key)
      }
      task.reject(repositoryAbortError("Space is closed"))
      this.pump()
      return
    }
    this.running = task
    void Promise.resolve()
      .then(() =>
        this.context.run(task.controller.signal, () =>
          task.operation(task.controller.signal)
        )
      )
      .then(
        (value) => {
          this.finishTask(task)
          task.resolve(value)
        },
        (error) => {
          this.finishTask(task)
          task.reject(error)
        }
      )
  }

  private finishTask(task: RepositoryTask<unknown>): void {
    if (task.key && this.keyedTasks.get(task.key) === task) {
      this.keyedTasks.delete(task.key)
    }
    if (this.running === task) this.running = null
    this.pump()
  }

  private removeQueuedTask(task: RepositoryTask<unknown>): void {
    const queue =
      task.priority === "foreground"
        ? this.foregroundQueue
        : this.backgroundQueue
    const index = queue.indexOf(task)
    if (index >= 0) queue.splice(index, 1)
  }

  private queuedCount(): number {
    return this.foregroundQueue.length + this.backgroundQueue.length
  }

  private resolveIdleIfNeeded(): void {
    if (this.running || this.queuedCount() > 0) return
    for (const resolve of this.idleWaiters) resolve()
    this.idleWaiters.clear()
  }
}

function repositoryAbortError(
  message = "The repository operation was cancelled"
) {
  const error = new Error(message)
  error.name = "AbortError"
  return error
}
