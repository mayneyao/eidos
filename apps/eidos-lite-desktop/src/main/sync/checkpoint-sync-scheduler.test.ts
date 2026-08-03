import { scheduleCheckpointSyncAfterLocalSave } from "./checkpoint-sync-scheduler"

function deferred<T = void>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (error: unknown) => void = () => undefined
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete
    reject = fail
  })
  return { promise, resolve, reject }
}

describe("checkpoint Sync scheduling", () => {
  it("cannot make local checkpoint acknowledgement await Hosted Sync", async () => {
    const sync = deferred()
    const scheduled: Array<() => void> = []
    const run = vi.fn(() => sync.promise)
    const onError = vi.fn()

    const result = scheduleCheckpointSyncAfterLocalSave({
      run,
      onError,
      schedule: (task) => scheduled.push(task),
    })

    expect(result).toBeUndefined()
    expect(run).not.toHaveBeenCalled()
    expect(scheduled).toHaveLength(1)

    scheduled[0]!()
    expect(run).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()

    sync.resolve()
    await sync.promise
  })

  it("contains background queue failures without rejecting the local save", async () => {
    const scheduled: Array<() => void> = []
    const failure = new Error("queue unavailable")
    const onError = vi.fn()

    scheduleCheckpointSyncAfterLocalSave({
      run: async () => {
        throw failure
      },
      onError,
      schedule: (task) => scheduled.push(task),
    })
    scheduled[0]!()
    await Promise.resolve()
    await Promise.resolve()

    expect(onError).toHaveBeenCalledWith(failure)
  })
})
