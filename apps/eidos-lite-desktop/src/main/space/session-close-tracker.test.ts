import { SessionCloseTracker } from "./session-close-tracker"

function deferred() {
  let resolve: () => void = () => {}
  const promise = new Promise<void>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

describe("SessionCloseTracker", () => {
  it("deduplicates close and lets application shutdown await closed windows", async () => {
    const closing = deferred()
    let closeCalls = 0
    const session = {
      close: async () => {
        closeCalls += 1
        await closing.promise
      },
    }
    const tracker = new SessionCloseTracker<typeof session>()

    const first = tracker.close(session)
    const second = tracker.close(session)
    let shutdownFinished = false
    const shutdown = tracker.waitForAll().then(() => {
      shutdownFinished = true
    })

    expect(first).toBe(second)
    expect(closeCalls).toBe(1)
    await Promise.resolve()
    expect(shutdownFinished).toBe(false)

    closing.resolve()
    await Promise.all([first, shutdown])
    expect(shutdownFinished).toBe(true)
  })
})
