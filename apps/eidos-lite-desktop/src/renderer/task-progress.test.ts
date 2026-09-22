import { afterEach, expect, it, vi } from "vitest"
import { createTaskProgress } from "./task-progress"

afterEach(() => vi.useRealTimers())

it("publishes the latest burst value at most once per interval without starving", () => {
  vi.useFakeTimers()
  const publish = vi.fn()
  const progress = createTaskProgress(publish)
  for (let i = 1; i <= 40; i++) {
    progress.update(i)
    vi.advanceTimersByTime(2)
  }
  expect(publish).not.toHaveBeenCalled()
  vi.advanceTimersByTime(20)
  expect(publish.mock.calls).toEqual([[40]])
  progress.update(41)
  vi.advanceTimersByTime(100)
  expect(publish.mock.calls).toEqual([[40], [41]])
})

it("flushes immediately at completion and cannot overwrite a terminal state later", () => {
  vi.useFakeTimers()
  const publish = vi.fn()
  const progress = createTaskProgress(publish)
  progress.update(40)
  progress.flush()
  expect(publish.mock.calls).toEqual([[40]])
  vi.runAllTimers()
  expect(publish).toHaveBeenCalledOnce()
  progress.update(1)
  progress.cancel()
  vi.runAllTimers()
  expect(publish).toHaveBeenCalledOnce()
})
