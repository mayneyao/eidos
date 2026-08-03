export interface CheckpointSyncSchedulerOptions {
  run(): Promise<void>
  onError(error: unknown): void
  schedule?: (task: () => void) => void
}

/**
 * Starts Hosted Sync only after the durable local checkpoint has been returned
 * to the renderer. The API intentionally returns void so callers cannot put
 * account, queue-store, fetch, or push work back onto Save version's awaited
 * critical path.
 */
export function scheduleCheckpointSyncAfterLocalSave({
  run,
  onError,
  schedule = setImmediate,
}: CheckpointSyncSchedulerOptions): void {
  schedule(() => {
    void run().catch(onError)
  })
}
