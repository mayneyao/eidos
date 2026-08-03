import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { StableCheckpointScheduler } from "./stable-checkpoint-scheduler"

describe("StableCheckpointScheduler", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("coalesces a burst until the quiet period", async () => {
    const run = vi.fn(async () => undefined)
    const scheduler = new StableCheckpointScheduler({
      quietMs: 100,
      maxWaitMs: 1_000,
      run,
      onError: vi.fn(),
    })

    scheduler.notifyStableChange()
    await vi.advanceTimersByTimeAsync(75)
    scheduler.notifyStableChange()
    await vi.advanceTimersByTimeAsync(99)
    expect(run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(1)
    await scheduler.close(false)
  })

  it("bounds continuous changes by the maximum wait", async () => {
    const run = vi.fn(async () => undefined)
    const scheduler = new StableCheckpointScheduler({
      quietMs: 100,
      maxWaitMs: 250,
      run,
      onError: vi.fn(),
    })

    scheduler.notifyStableChange()
    await vi.advanceTimersByTimeAsync(90)
    scheduler.notifyStableChange()
    await vi.advanceTimersByTimeAsync(90)
    scheduler.notifyStableChange()
    await vi.advanceTimersByTimeAsync(70)
    expect(run).toHaveBeenCalledTimes(1)
    await scheduler.close(false)
  })

  it("schedules changes arriving during a checkpoint for another run", async () => {
    let finishFirst: () => void = () => undefined
    const first = new Promise<void>((resolve) => {
      finishFirst = resolve
    })
    const run = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => first)
      .mockResolvedValue(undefined)
    const scheduler = new StableCheckpointScheduler({
      quietMs: 100,
      maxWaitMs: 1_000,
      run,
      onError: vi.fn(),
    })

    scheduler.notifyStableChange()
    await vi.advanceTimersByTimeAsync(100)
    expect(run).toHaveBeenCalledTimes(1)
    scheduler.notifyStableChange()
    finishFirst()
    await first
    await vi.advanceTimersByTimeAsync(100)
    expect(run).toHaveBeenCalledTimes(2)
    await scheduler.close(false)
  })

  it("flushes one pending checkpoint while closing", async () => {
    const run = vi.fn(async () => undefined)
    const scheduler = new StableCheckpointScheduler({
      quietMs: 100,
      maxWaitMs: 1_000,
      run,
      onError: vi.fn(),
    })

    scheduler.notifyStableChange()
    await scheduler.close(true)
    scheduler.notifyStableChange()
    await vi.runAllTimersAsync()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("discards a pending automatic checkpoint when the feature is disabled", async () => {
    const run = vi.fn(async () => undefined)
    const scheduler = new StableCheckpointScheduler({
      quietMs: 100,
      maxWaitMs: 1_000,
      run,
      onError: vi.fn(),
    })

    scheduler.notifyStableChange()
    scheduler.cancelPending()
    await vi.runAllTimersAsync()
    expect(run).not.toHaveBeenCalled()
    await scheduler.close(false)
  })
})
