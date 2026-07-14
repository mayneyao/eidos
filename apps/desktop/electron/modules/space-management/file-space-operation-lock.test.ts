// @vitest-environment node

import { describe, expect, it } from "vitest"

import {
  withFileSpaceOperationLock,
  withFileSpaceReadLock,
} from "./file-space-operation-lock"

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

  it("runs read-only operations for the same Space concurrently", async () => {
    const releaseReads = deferred()
    const started: string[] = []
    const first = withFileSpaceReadLock("space-read-test-1", async () => {
      started.push("first")
      await releaseReads.promise
    })
    const second = withFileSpaceReadLock("space-read-test-1", async () => {
      started.push("second")
      await releaseReads.promise
    })

    await Promise.resolve()
    expect(started).toEqual(["first", "second"])
    releaseReads.resolve()
    await Promise.all([first, second])
  })

  it("keeps writes exclusive from active and later reads", async () => {
    const releaseFirstRead = deferred()
    const releaseWrite = deferred()
    const order: string[] = []
    const firstRead = withFileSpaceReadLock("space-read-test-2", async () => {
      order.push("read:first:start")
      await releaseFirstRead.promise
      order.push("read:first:end")
    })
    const write = withFileSpaceOperationLock("space-read-test-2", async () => {
      order.push("write:start")
      await releaseWrite.promise
      order.push("write:end")
    })
    const laterRead = withFileSpaceReadLock("space-read-test-2", async () => {
      order.push("read:later")
    })

    await Promise.resolve()
    expect(order).toEqual(["read:first:start"])
    releaseFirstRead.resolve()
    await firstRead
    expect(order).toEqual(["read:first:start", "read:first:end", "write:start"])
    releaseWrite.resolve()
    await Promise.all([write, laterRead])
    expect(order).toEqual([
      "read:first:start",
      "read:first:end",
      "write:start",
      "write:end",
      "read:later",
    ])
  })
})
