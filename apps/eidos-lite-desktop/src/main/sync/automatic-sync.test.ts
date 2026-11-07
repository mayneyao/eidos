import type { EidosSyncRunResponse } from "../../shared/contracts"
import { AutomaticSync, AUTOMATIC_SYNC_INTERVAL_MS } from "./automatic-sync"
import { classifySyncFailure } from "./sync-failure"

function success(
  state: "synced" | "conflict" = "synced"
): EidosSyncRunResponse {
  return {
    ok: true,
    result: { state, message: "Review divergent versions" },
  } as EidosSyncRunResponse
}

function fixture() {
  let now = 0
  let focused = true
  let available = true
  let current = true
  const execute = vi.fn(async (_signal: AbortSignal) => success())
  const emit = vi.fn()
  const sync = new AutomaticSync({ now: () => now, focused: () => focused })
  sync.configure("interval")
  const binding = {
    spaceId: "test-space",
    revision: "remote-a",
    available: () => available,
    current: () => current,
    execute,
    emit,
  }
  sync.attach(binding)
  return {
    sync,
    execute,
    emit,
    binding,
    advance: (ms: number) => {
      now += ms
    },
    focus: (value: boolean) => {
      focused = value
      sync.activity()
    },
    available: (value: boolean) => {
      available = value
    },
    current: (value: boolean) => {
      current = value
    },
  }
}

describe("Automatic Sync scheduling", () => {
  it.each(["interval", "on-change"] as const)(
    "checks unchanged Spaces every ten minutes in %s mode",
    async (mode) => {
      const f = fixture()
      f.sync.configure(mode)
      f.advance(AUTOMATIC_SYNC_INTERVAL_MS - 1)
      await f.sync.tick()
      expect(f.execute).not.toHaveBeenCalled()
      f.advance(1)
      await f.sync.tick()
      expect(f.execute).toHaveBeenCalledOnce()
      f.advance(AUTOMATIC_SYNC_INTERVAL_MS)
      await f.sync.tick()
      expect(f.execute).toHaveBeenCalledTimes(2)
    }
  )

  it("uses app activity: other apps can remain busy while Lite is in the background", async () => {
    const f = fixture()
    f.sync.configure("on-change")
    f.focus(false)
    f.sync.changed("test-space")
    f.advance(5_000)
    await f.sync.tick()
    expect(f.execute).toHaveBeenCalledOnce()
  })

  it("coalesces changes and waits thirty seconds after foreground input", async () => {
    const f = fixture()
    f.sync.configure("on-change")
    for (let i = 0; i < 4; i++) f.sync.changed("test-space")
    f.advance(5_000)
    await f.sync.tick()
    expect(f.execute).not.toHaveBeenCalled()
    f.sync.activity()
    f.advance(29_999)
    await f.sync.tick()
    expect(f.execute).not.toHaveBeenCalled()
    f.advance(1)
    await f.sync.tick()
    expect(f.execute).toHaveBeenCalledOnce()
  })

  it("aborts an active transfer on focus/input and waits for idle before retrying", async () => {
    const f = fixture()
    let signal: AbortSignal | undefined
    f.execute.mockImplementationOnce(
      (received) =>
        new Promise((_resolve, reject) => {
          signal = received
          received.addEventListener("abort", () => reject(received.reason), {
            once: true,
          })
        })
    )
    f.advance(AUTOMATIC_SYNC_INTERVAL_MS)
    const run = f.sync.tick()
    expect(f.sync.status("test-space")?.state).toBe("running")
    f.focus(true)
    expect(signal?.aborted).toBe(true)
    await run
    await f.sync.tick()
    expect(f.execute).toHaveBeenCalledOnce()
    f.advance(30_000)
    await f.sync.tick()
    expect(f.execute).toHaveBeenCalledTimes(2)
  })

  it("waits passively for drafts/foreground queue and does not claim it synced", async () => {
    const f = fixture()
    f.available(false)
    f.advance(AUTOMATIC_SYNC_INTERVAL_MS)
    await f.sync.tick()
    expect(f.execute).not.toHaveBeenCalled()
    expect(f.sync.status("test-space")?.state).toBe("pending")
    f.available(true)
    await f.sync.tick()
    expect(f.execute).toHaveBeenCalledOnce()
  })

  it("gives manual Sync priority and starts a new ten-minute period afterward", async () => {
    const f = fixture()
    const events: string[] = []
    f.execute.mockImplementationOnce(
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            events.push("cancelled")
            reject(signal.reason)
          })
        })
    )
    f.advance(AUTOMATIC_SYNC_INTERVAL_MS)
    const run = f.sync.tick()
    await f.sync.manual("test-space", async () => {
      events.push("manual")
      await f.sync.tick()
    })
    await run
    expect(events).toEqual(["cancelled", "manual"])
    expect(f.execute).toHaveBeenCalledOnce()
    await f.sync.tick()
    expect(f.execute).toHaveBeenCalledOnce()
  })

  it.each(["off", "detach", "suspend", "close"])(
    "cancels running work on %s",
    async (action) => {
      const f = fixture()
      let aborted = false
      f.execute.mockImplementationOnce(
        (signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              aborted = true
              reject(signal.reason)
            })
          })
      )
      f.advance(AUTOMATIC_SYNC_INTERVAL_MS)
      const run = f.sync.tick()
      if (action === "off") f.sync.configure("off")
      if (action === "detach") f.sync.detach("test-space")
      if (action === "suspend") f.sync.suspend()
      if (action === "close") await f.sync.close()
      await run
      expect(aborted).toBe(true)
      f.advance(AUTOMATIC_SYNC_INTERVAL_MS)
      await f.sync.tick()
      expect(f.execute).toHaveBeenCalledOnce()
    }
  )

  it("rechecks app idle after wake without a catch-up burst", async () => {
    const f = fixture()
    f.sync.suspend()
    f.advance(AUTOMATIC_SYNC_INTERVAL_MS * 20)
    f.sync.resume()
    await f.sync.tick()
    expect(f.execute).not.toHaveBeenCalled()
    f.advance(30_000)
    await f.sync.tick()
    expect(f.execute).toHaveBeenCalledOnce()
  })

  it("keeps bounded retry delays through a long outage and does not let saves bypass Retry-After", async () => {
    const f = fixture()
    f.sync.configure("on-change")
    f.execute.mockResolvedValue({
      ok: false,
      runId: "offline",
      telemetry: {} as never,
      failure: {
        ...classifySyncFailure(new Error("fetch failed")),
        retryable: true,
        retryAfterMs: 120_000,
      },
    })
    f.advance(AUTOMATIC_SYNC_INTERVAL_MS)
    await f.sync.tick()
    f.sync.changed("test-space")
    f.advance(119_999)
    await f.sync.tick()
    expect(f.execute).toHaveBeenCalledOnce()
    for (let i = 0; i < 8; i++) {
      f.advance(15 * 60_000)
      await f.sync.tick()
    }
    expect(f.execute).toHaveBeenCalledTimes(9)
    expect(f.sync.status("test-space")?.state).toBe("retry-wait")
    expect(f.sync.status("test-space")?.nextAttemptAtMs).toBeDefined()
  })

  it("pauses divergent history and permanent failures until manual recovery", async () => {
    const f = fixture()
    f.execute.mockResolvedValueOnce(success("conflict"))
    f.advance(AUTOMATIC_SYNC_INTERVAL_MS)
    await f.sync.tick()
    expect(f.sync.status("test-space")).toMatchObject({
      state: "paused",
      lastFailure: { action: "review-local", retryable: false },
    })
    f.advance(AUTOMATIC_SYNC_INTERVAL_MS)
    f.sync.changed("test-space")
    await f.sync.tick()
    expect(f.execute).toHaveBeenCalledOnce()
    await f.sync.manual("test-space", async () => undefined)
    f.advance(AUTOMATIC_SYNC_INTERVAL_MS)
    await f.sync.tick()
    expect(f.execute).toHaveBeenCalledTimes(2)
  })

  it("honors a server cooldown longer than the local fifteen-minute backoff cap", async () => {
    const f = fixture()
    f.sync.configure("on-change")
    f.execute.mockResolvedValueOnce({
      ok: false,
      runId: "cooldown",
      telemetry: {} as never,
      failure: {
        ...classifySyncFailure(new Error("rate limited")),
        retryable: true,
        retryAfterMs: 60 * 60_000,
      },
    })
    f.advance(AUTOMATIC_SYNC_INTERVAL_MS)
    await f.sync.tick()
    f.advance(59 * 60_000)
    f.sync.changed("test-space")
    await f.sync.tick()
    expect(f.execute).toHaveBeenCalledOnce()
    f.advance(60_000)
    await f.sync.tick()
    expect(f.execute).toHaveBeenCalledTimes(2)
  })

  it("drops an old Space and ignores its late result after a binding replacement", async () => {
    const f = fixture()
    let complete!: (response: EidosSyncRunResponse) => void
    f.execute.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve
        })
    )
    f.advance(AUTOMATIC_SYNC_INTERVAL_MS)
    const run = f.sync.tick()
    f.sync.attach({ ...f.binding, revision: "remote-b" })
    const emitCount = f.emit.mock.calls.length
    complete(success("conflict"))
    await run
    expect(f.emit).toHaveBeenCalledTimes(emitCount)
    expect(f.sync.status("test-space")?.state).toBe("idle")
  })
})
