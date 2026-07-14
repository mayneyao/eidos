import type { BaseRuntime } from "@eidos.space/base"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const openBaseFileMock = vi.hoisted(() => vi.fn())

vi.mock("@eidos.space/base/better-sqlite3", () => ({
  openBaseFile: openBaseFileMock,
}))

import {
  BaseQueryRuntimeCache,
  type BaseQueryFileFingerprint,
} from "./base-query-runtime-cache"

function fingerprint(version: number): BaseQueryFileFingerprint {
  return {
    device: 1,
    inode: version,
    size: version,
    modifiedAt: version,
    changedAt: version,
  }
}

function runtime() {
  return {
    close: vi.fn(),
  } as unknown as BaseRuntime
}

describe("BaseQueryRuntimeCache", () => {
  beforeEach(() => {
    openBaseFileMock.mockReset()
  })

  it("opens cached query runtimes in read-only mode", () => {
    const opened = runtime()
    openBaseFileMock.mockReturnValue(opened)
    const cache = new BaseQueryRuntimeCache(2, undefined, () => fingerprint(1))

    expect(cache.get("/space/tasks.base")).toBe(opened)
    expect(openBaseFileMock).toHaveBeenCalledWith(
      path.resolve("/space/tasks.base"),
      { readonly: true }
    )
  })

  it("reuses an unchanged Base runtime", () => {
    const opened = runtime()
    const open = vi.fn(() => opened)
    const cache = new BaseQueryRuntimeCache(2, open, () => fingerprint(1))

    expect(cache.get("/space/tasks.base")).toBe(opened)
    expect(cache.get("/space/tasks.base")).toBe(opened)
    expect(open).toHaveBeenCalledOnce()
    expect(opened.close).not.toHaveBeenCalled()
  })

  it("reopens a Base when its file fingerprint changes", () => {
    const first = runtime()
    const second = runtime()
    const open = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
    let version = 1
    const cache = new BaseQueryRuntimeCache(2, open, () => fingerprint(version))

    expect(cache.get("/space/tasks.base")).toBe(first)
    version = 2
    expect(cache.get("/space/tasks.base")).toBe(second)
    expect(first.close).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledTimes(2)
  })

  it("stores the fingerprint produced while opening a Base", () => {
    const opened = runtime()
    const open = vi.fn(() => opened)
    let version = 1
    const readFingerprint = vi.fn(() => fingerprint(version))
    open.mockImplementation(() => {
      version = 2
      return opened
    })
    const cache = new BaseQueryRuntimeCache(2, open, readFingerprint)

    expect(cache.get("/space/tasks.base")).toBe(opened)
    expect(cache.get("/space/tasks.base")).toBe(opened)
    expect(open).toHaveBeenCalledOnce()
    expect(readFingerprint).toHaveBeenCalledTimes(3)
  })

  it("evicts the least recently used runtime and closes all resources", () => {
    const runtimes = [runtime(), runtime(), runtime()]
    const open = vi.fn(() => runtimes[open.mock.calls.length - 1])
    const cache = new BaseQueryRuntimeCache(2, open, (filePath) =>
      fingerprint(filePath.length)
    )

    cache.get("/space/a.base")
    cache.get("/space/bb.base")
    cache.get("/space/a.base")
    cache.get("/space/ccc.base")

    expect(runtimes[1].close).toHaveBeenCalledOnce()
    expect(runtimes[0].close).not.toHaveBeenCalled()
    cache.close()
    expect(runtimes[0].close).toHaveBeenCalledOnce()
    expect(runtimes[2].close).toHaveBeenCalledOnce()
  })
})
