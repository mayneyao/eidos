// @vitest-environment node

import { describe, expect, it } from "vitest"

import { withFileSpaceOperationLock } from "./file-space-operation-lock"

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

describe("withFileSpaceOperationLock", () => {
  it("serializes operations for the same Space after failures", async () => {
    const startedFirst = deferred()
    const releaseFirst = deferred()
    const order: string[] = []
    const first = withFileSpaceOperationLock("space-a-test-1", async () => {
      order.push("first:start")
      startedFirst.resolve()
      await releaseFirst.promise
      order.push("first:end")
      throw new Error("expected failure")
    })
    const second = withFileSpaceOperationLock("space-a-test-1", async () => {
      order.push("second")
    })

    await startedFirst.promise
    expect(order).toEqual(["first:start"])
    releaseFirst.resolve()
    await expect(first).rejects.toThrow("expected failure")
    await second
    expect(order).toEqual(["first:start", "first:end", "second"])
  })

  it("does not block a different Space", async () => {
    const releaseFirst = deferred()
    const first = withFileSpaceOperationLock(
      "space-a-test-2",
      () => releaseFirst.promise
    )
    let secondFinished = false
    await withFileSpaceOperationLock("space-b-test-2", async () => {
      secondFinished = true
    })

    expect(secondFinished).toBe(true)
    releaseFirst.resolve()
    await first
  })
})
