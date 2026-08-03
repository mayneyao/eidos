import { SpaceRepositoryCoordinator } from "./repository-coordinator"

function deferred<T = void>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

describe("SpaceRepositoryCoordinator", () => {
  it("prioritizes foreground work without letting background tasks cancel each other", async () => {
    const coordinator = new SpaceRepositoryCoordinator()
    const firstStarted = deferred()
    const finishFirst = deferred()
    const calls: string[] = []
    const first = coordinator.runBackground("ignore", async () => {
      calls.push("ignore-start")
      firstStarted.resolve()
      await finishFirst.promise
      calls.push("ignore-end")
    })
    await firstStarted.promise
    const status = coordinator.runBackground("status", async () => {
      calls.push("status")
    })
    const history = coordinator.runForeground(async () => {
      calls.push("history")
    })

    finishFirst.resolve()
    await Promise.all([first, status, history])
    expect(calls).toEqual(["ignore-start", "ignore-end", "history", "status"])
    await coordinator.close()
  })

  it("preempts a cancellable background status for foreground work", async () => {
    const coordinator = new SpaceRepositoryCoordinator()
    const statusStarted = deferred()
    const calls: string[] = []
    const status = coordinator.runBackground(
      "status",
      (signal) =>
        new Promise<void>((_resolve, reject) => {
          calls.push("status")
          statusStarted.resolve()
          signal.addEventListener(
            "abort",
            () => {
              const error = new Error("cancelled")
              error.name = "AbortError"
              reject(error)
            },
            { once: true }
          )
        }),
      { preemptible: true }
    )
    await statusStarted.promise
    const history = coordinator.runForeground(async () => {
      calls.push("history")
    })

    await expect(status).rejects.toMatchObject({ name: "AbortError" })
    await expect(history).resolves.toBeUndefined()
    expect(calls).toEqual(["status", "history"])
    await coordinator.close()
  })

  it("coalesces keyed background work", async () => {
    const coordinator = new SpaceRepositoryCoordinator()
    const finish = deferred<number>()
    const operation = vi.fn(() => finish.promise)
    const first = coordinator.runBackground("status", operation)
    const second = coordinator.runBackground("status", operation)

    expect(second).toBe(first)
    finish.resolve(42)
    await expect(first).resolves.toBe(42)
    expect(operation).toHaveBeenCalledOnce()
    await coordinator.close()
  })

  it("does not coalesce new work onto a cancelled task that is slow to stop", async () => {
    const coordinator = new SpaceRepositoryCoordinator()
    const firstStarted = deferred()
    const finishFirst = deferred()
    const secondStarted = deferred()
    const first = coordinator.runBackground(
      "status",
      async (signal) => {
        firstStarted.resolve()
        await finishFirst.promise
        if (signal.aborted) {
          const error = new Error("cancelled")
          error.name = "AbortError"
          throw error
        }
        return "stale"
      },
      { preemptible: true }
    )
    await firstStarted.promise

    coordinator.cancel("status")
    const second = coordinator.runBackground("status", async () => {
      secondStarted.resolve()
      return "fresh"
    })

    expect(second).not.toBe(first)
    finishFirst.resolve()
    await expect(first).rejects.toMatchObject({ name: "AbortError" })
    await secondStarted.promise
    await expect(second).resolves.toBe("fresh")
    await coordinator.close()
  })

  it("releases a completed key before a consumer schedules its follow-up", async () => {
    const coordinator = new SpaceRepositoryCoordinator()
    let calls = 0

    const result = await coordinator
      .runBackground("status", async () => ++calls)
      .then(() => coordinator.runBackground("status", async () => ++calls))

    expect(result).toBe(2)
    expect(calls).toBe(2)
    await coordinator.close()
  })

  it("replaces only the previous keyed foreground read", async () => {
    const coordinator = new SpaceRepositoryCoordinator()
    const firstStarted = deferred()
    const first = coordinator.runForeground(
      (signal) =>
        new Promise<void>((_resolve, reject) => {
          firstStarted.resolve()
          signal.addEventListener(
            "abort",
            () => {
              const error = new Error("cancelled")
              error.name = "AbortError"
              reject(error)
            },
            { once: true }
          )
        }),
      { key: "version-read", replace: true, preemptible: true }
    )
    await firstStarted.promise
    const second = coordinator.runForeground(async () => "latest", {
      key: "version-read",
      replace: true,
      preemptible: true,
    })

    await expect(first).rejects.toMatchObject({ name: "AbortError" })
    await expect(second).resolves.toBe("latest")
    await coordinator.close()
  })

  it("runs nested repository work inline without deadlocking", async () => {
    const coordinator = new SpaceRepositoryCoordinator()
    const result = await coordinator.runForeground(async () =>
      coordinator.runBackground("ignore", async () => "nested")
    )

    expect(result).toBe("nested")
    await coordinator.close()
  })
})
