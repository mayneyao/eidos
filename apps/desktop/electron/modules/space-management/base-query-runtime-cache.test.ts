import type { BaseRuntime } from "@eidos.space/base"
import { describe, expect, it, vi } from "vitest"

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
