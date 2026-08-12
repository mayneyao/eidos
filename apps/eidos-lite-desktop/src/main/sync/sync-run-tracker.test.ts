import { SyncRunTracker } from "./sync-run-tracker"

describe("SyncRunTracker", () => {
  it("projects ordered phases and authoritative elapsed time", () => {
    let now = 1_000
    const events: Array<{
      operation: string
      state: string
      phase: string
      elapsedMs: number
    }> = []
    const tracker = new SyncRunTracker(
      "run-1",
      (progress) =>
        events.push({
          operation: progress.operation,
          state: progress.state,
          phase: progress.phase,
          elapsedMs: progress.elapsedMs,
        }),
      () => now
    )

    tracker.transition("authorization", "Authorizing")
    now += 25
    tracker.transition("fetch", "Fetching")
    now += 75
    tracker.transition("analyze", "Analyzing")
    now += 10
    const telemetry = tracker.complete("Conflict detected")

    expect(telemetry).toEqual({
      startedAtMs: 1_000,
      completedAtMs: 1_110,
      durationMs: 110,
      phases: [
        {
          phase: "authorization",
          detail: "Authorizing",
          durationMs: 25,
        },
        { phase: "fetch", detail: "Fetching", durationMs: 75 },
        { phase: "analyze", detail: "Analyzing", durationMs: 10 },
      ],
    })
    expect(events).toEqual([
      {
        operation: "sync",
        state: "active",
        phase: "authorization",
        elapsedMs: 0,
      },
      {
        operation: "sync",
        state: "active",
        phase: "fetch",
        elapsedMs: 25,
      },
      {
        operation: "sync",
        state: "active",
        phase: "analyze",
        elapsedMs: 100,
      },
      {
        operation: "sync",
        state: "completed",
        phase: "analyze",
        elapsedMs: 110,
      },
    ])
  })

  it("reports the active phase when a run fails", () => {
    let now = 20
    const events: Array<{ state: string; phase: string; detail: string }> = []
    const tracker = new SyncRunTracker(
      "run-2",
      (progress) => events.push(progress),
      () => now
    )
    tracker.transition("pull", "Pulling")
    now = 45
    const telemetry = tracker.fail("Remote unavailable")

    expect(events.at(-1)).toMatchObject({
      state: "failed",
      phase: "pull",
      detail: "Remote unavailable",
    })
    expect(telemetry).toMatchObject({
      startedAtMs: 20,
      completedAtMs: 45,
      durationMs: 25,
      phases: [{ phase: "pull", durationMs: 25 }],
    })
  })

  it("identifies connection and clone progress independently from daily Sync", () => {
    const operations: string[] = []
    const connect = new SyncRunTracker(
      "connect-1",
      (progress) => operations.push(progress.operation),
      () => 10,
      "connect"
    )
    const clone = new SyncRunTracker(
      "clone-1",
      (progress) => operations.push(progress.operation),
      () => 10,
      "clone"
    )

    connect.transition("push", "Uploading")
    clone.transition("fetch", "Downloading")

    expect(operations).toEqual(["connect", "clone"])
  })

  it("projects transfer bytes, speed, and remaining time into active progress", () => {
    let now = 1_000
    const events: Array<{ transfer?: unknown }> = []
    const tracker = new SyncRunTracker(
      "transfer-1",
      (progress) => events.push(progress),
      () => now,
      "connect"
    )

    tracker.transition("push", "Uploading")
    tracker.transfer({
      direction: "upload",
      transferredBytes: 0,
      totalBytes: 1_000,
    })
    now += 500
    tracker.transfer({
      direction: "upload",
      transferredBytes: 250,
      totalBytes: 1_000,
    })

    expect(events.at(-1)?.transfer).toEqual({
      direction: "upload",
      transferredBytes: 250,
      totalBytes: 1_000,
      bytesPerSecond: 500,
      estimatedRemainingMs: 1_500,
    })

    now += 250
    tracker.transfer({
      direction: "download",
      transferredBytes: 50,
      totalBytes: 200,
    })
    now += 250
    tracker.transfer({
      direction: "download",
      transferredBytes: 100,
      totalBytes: 200,
    })

    expect(events.at(-1)?.transfer).toEqual({
      direction: "download",
      transferredBytes: 100,
      totalBytes: 200,
      bytesPerSecond: 200,
      estimatedRemainingMs: 500,
    })
  })
})
