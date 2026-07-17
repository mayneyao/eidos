import type { EidosFileRuntime } from "@eidos.space/eidos-file"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const openEidosFileMock = vi.hoisted(() => vi.fn())

vi.mock("@eidos.space/eidos-file/better-sqlite3", () => ({
  openEidosFile: openEidosFileMock,
}))

import {
  EidosFileQueryRuntimeCache,
  type EidosFileQueryFileFingerprint,
} from "./eidos-file-query-runtime-cache"

function fingerprint(version: number): EidosFileQueryFileFingerprint {
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
  } as unknown as EidosFileRuntime
}

describe("EidosFileQueryRuntimeCache", () => {
  beforeEach(() => {
    openEidosFileMock.mockReset()
  })

  it("opens cached query runtimes in read-only mode", () => {
    const opened = runtime()
    openEidosFileMock.mockReturnValue(opened)
    const cache = new EidosFileQueryRuntimeCache(2, undefined, () =>
      fingerprint(1)
    )

    expect(cache.get("/space/tasks.eidos")).toBe(opened)
    expect(openEidosFileMock).toHaveBeenCalledWith(
      path.resolve("/space/tasks.eidos"),
      { readonly: true }
    )
  })

  it("reuses an unchanged Eidos File runtime", () => {
    const opened = runtime()
    const open = vi.fn(() => opened)
    const cache = new EidosFileQueryRuntimeCache(2, open, () => fingerprint(1))

    expect(cache.get("/space/tasks.eidos")).toBe(opened)
    expect(cache.get("/space/tasks.eidos")).toBe(opened)
    expect(open).toHaveBeenCalledOnce()
    expect(opened.close).not.toHaveBeenCalled()
  })

  it("reopens an Eidos File when its file fingerprint changes", () => {
    const first = runtime()
    const second = runtime()
    const open = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second)
    let version = 1
    const cache = new EidosFileQueryRuntimeCache(2, open, () =>
      fingerprint(version)
    )

    expect(cache.get("/space/tasks.eidos")).toBe(first)
    version = 2
    expect(cache.get("/space/tasks.eidos")).toBe(second)
    expect(first.close).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledTimes(2)
  })

  it("stores the fingerprint produced while opening an Eidos File", () => {
    const opened = runtime()
    const open = vi.fn(() => opened)
    let version = 1
    const readFingerprint = vi.fn(() => fingerprint(version))
    open.mockImplementation(() => {
      version = 2
      return opened
    })
    const cache = new EidosFileQueryRuntimeCache(2, open, readFingerprint)

    expect(cache.get("/space/tasks.eidos")).toBe(opened)
    expect(cache.get("/space/tasks.eidos")).toBe(opened)
    expect(open).toHaveBeenCalledOnce()
    expect(readFingerprint).toHaveBeenCalledTimes(3)
  })

  it("evicts the least recently used runtime and closes all resources", () => {
    const runtimes = [runtime(), runtime(), runtime()]
    const open = vi.fn(() => runtimes[open.mock.calls.length - 1])
    const cache = new EidosFileQueryRuntimeCache(2, open, (filePath) =>
      fingerprint(filePath.length)
    )

    cache.get("/space/a.eidos")
    cache.get("/space/bb.eidos")
    cache.get("/space/a.eidos")
    cache.get("/space/ccc.eidos")

    expect(runtimes[1].close).toHaveBeenCalledOnce()
    expect(runtimes[0].close).not.toHaveBeenCalled()
    cache.close()
    expect(runtimes[0].close).toHaveBeenCalledOnce()
    expect(runtimes[2].close).toHaveBeenCalledOnce()
  })
})
