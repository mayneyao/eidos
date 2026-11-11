import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import type { SpaceSnapshot, SpaceTreeEntry } from "../../shared/contracts"
import * as paths from "./space-paths"
import { SpaceSession } from "./space-session"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((complete) => {
    resolve = complete
  })
  return { promise, resolve }
}

// No repository/network is needed for offline file moves.
const graft = {
  backend: "sdk",
  expectedVersion: () => "test",
  hasOpenSession: () => false,
  close: async () => undefined,
}
async function fixture(count: number) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-bulk-move-"))
  const root = path.join(directory, "Space")
  await fs.mkdir(path.join(root, "source"), { recursive: true })
  await fs.mkdir(path.join(root, "target"))
  await fs.mkdir(path.join(root, "unrelated"))
  const names = Array.from({ length: count }, (_, index) => `${index}.txt`)
  for (const name of names)
    await fs.writeFile(path.join(root, "source", name), name)
  const session = await SpaceSession.create(
    root,
    path.join(directory, "state"),
    { graft: graft as never }
  )
  await session.snapshot()
  await session.loadDirectory("source")
  await session.loadDirectory("target")
  await session.loadDirectory("unrelated")
  // Native watcher delivery varies by OS. Explicitly deliver the event sequence
  // in these tests; the real watcher has its own integration coverage.
  const internals = session as unknown as {
    watcher: { close(): void }
    handleStableWatcherChange(paths: readonly string[]): Promise<void>
    invalidateDirectoryCaches(paths: readonly string[]): string[]
    loadDirectoryEntries(path: string, ignores: boolean): Promise<void>
    directoryEntriesCache: Map<string, SpaceTreeEntry[]>
  }
  internals.watcher.close()
  return {
    directory,
    root,
    session,
    names,
    internals,
    close: async () => {
      await session.close()
      await fs.rm(directory, { recursive: true, force: true })
    },
  }
}

it("rejects a stale directory read after a move and coalesces concurrent reads", async () => {
  const f = await fixture(2)
  const captured = deferred<void>()
  const release = deferred<void>()
  const list = paths.listSpaceDirectory
  const spy = vi
    .spyOn(paths, "listSpaceDirectory")
    .mockImplementationOnce(async (...args) => {
      const old = await list(...args)
      captured.resolve()
      await release.promise
      return old
    })
  try {
    f.internals.invalidateDirectoryCaches(["source/0.txt"])
    const oldRead = f.session.loadDirectory("source")
    const joined = f.session.loadDirectory("source")
    await captured.promise
    const result = await f.session.movePaths(
      ["source/0.txt", "source/1.txt"],
      "target"
    )
    release.resolve()
    await Promise.all([oldRead, joined])
    expect(f.internals.directoryEntriesCache.get("source")).toEqual([])
    expect(
      paths
        .flattenSpaceTree((await f.session.snapshot()).entries)
        .map((entry) => entry.relativePath)
    ).not.toContain("source/0.txt")
    expect(result.moves).toHaveLength(2)
    expect(spy.mock.calls.filter(([, key]) => key === "source")).toHaveLength(2)
  } finally {
    release.resolve()
    spy.mockRestore()
    await f.close()
  }
})

it("keeps external changes and emits one final tree for many watcher events and a partial failure", async () => {
  const f = await fixture(3)
  const rename = fs.rename.bind(fs)
  const paused = deferred<void>()
  const release = deferred<void>()
  const spy = vi.spyOn(fs, "rename").mockImplementationOnce(async (...args) => {
    await rename(...args)
    paused.resolve()
    await release.promise
  })
  const snapshots: SpaceSnapshot[] = []
  f.session.onChanged((snapshot) => snapshots.push(snapshot))
  try {
    await fs.writeFile(path.join(f.root, "target/1.txt"), "existing")
    const moving = f.session.movePaths(
      f.names.map((name) => `source/${name}`),
      "target"
    )
    await paused.promise
    let loadFinished = false
    const load = f.session.loadDirectory("source").then(() => {
      loadFinished = true
    })
    await fs.writeFile(path.join(f.root, "unrelated/external.txt"), "external")
    for (let index = 0; index < 20; index++)
      await f.internals.handleStableWatcherChange([
        "source/0.txt",
        "target/0.txt",
        "unrelated/external.txt",
      ])
    expect(snapshots).toHaveLength(0)
    expect(loadFinished).toBe(false)
    release.resolve()
    const result = await moving
    expect(snapshots).toHaveLength(1)
    expect(result.moves).toEqual([
      { source: "source/0.txt", relativePath: "target/0.txt" },
    ])
    expect(result.failure?.relativePath).toBe("source/1.txt")
    expect(result.unattemptedPaths).toEqual(["source/2.txt"])
    expect(await fs.readdir(path.join(f.root, "source"))).toEqual([
      "1.txt",
      "2.txt",
    ])
    expect(await fs.readdir(path.join(f.root, "target"))).toEqual([
      "0.txt",
      "1.txt",
    ])
    expect(await fs.readFile(path.join(f.root, "target/1.txt"), "utf8")).toBe(
      "existing"
    )
    expect(
      paths
        .flattenSpaceTree(result.snapshot.entries)
        .map((entry) => entry.relativePath)
    ).toEqual(
      expect.arrayContaining([
        "source/1.txt",
        "source/2.txt",
        "target/0.txt",
        "unrelated/external.txt",
      ])
    )
    await load
  } finally {
    release.resolve()
    spy.mockRestore()
    await f.close()
  }
})

it.each([5, 100])(
  "moves %i files with one broadcast and only the two affected directory reads",
  async (count) => {
    const f = await fixture(count)
    const spy = vi.spyOn(paths, "listSpaceDirectory")
    const snapshots: SpaceSnapshot[] = []
    f.session.onChanged((snapshot) => snapshots.push(snapshot))
    try {
      const start = performance.now()
      const result = await f.session.movePaths(
        f.names.map((name) => `source/${name}`),
        "target"
      )
      const elapsedMs = performance.now() - start
      expect(result.failure).toBeUndefined()
      expect(result.moves).toHaveLength(count)
      expect(snapshots).toHaveLength(1)
      expect(spy.mock.calls.map(([, key]) => key).sort()).toEqual([
        "source",
        "target",
      ])
      expect(await fs.readdir(path.join(f.root, "source"))).toEqual([])
      expect((await fs.readdir(path.join(f.root, "target"))).sort()).toEqual(
        [...f.names].sort()
      )
      console.log(
        JSON.stringify({
          count,
          elapsedMs,
          snapshots: snapshots.length,
          directoryReads: spy.mock.calls.length,
        })
      )
    } finally {
      spy.mockRestore()
      await f.close()
    }
  }
)

it("reports a directory read failure without hiding failed items or reviving successful moves", async () => {
  const f = await fixture(2)
  const list = paths.listSpaceDirectory
  const spy = vi
    .spyOn(paths, "listSpaceDirectory")
    .mockImplementation(async (...args) => {
      if (args[1] === "source")
        throw new Error("Directory temporarily unavailable")
      return list(...args)
    })
  try {
    await fs.writeFile(path.join(f.root, "target/1.txt"), "existing")
    const result = await f.session.movePaths(
      ["source/0.txt", "source/1.txt"],
      "target"
    )
    expect(result.moves).toHaveLength(1)
    expect(result.refreshError).toContain("temporarily unavailable")
    const visible = paths
      .flattenSpaceTree(result.snapshot.entries)
      .map((entry) => entry.relativePath)
    expect(visible).toContain("target/0.txt")
    expect(visible).toContain("source/1.txt")
    expect(visible).not.toContain("source/0.txt")
  } finally {
    spy.mockRestore()
    await f.close()
  }
})

it("reconciles an external write arriving after the final directory read started", async () => {
  const f = await fixture(1)
  const list = paths.listSpaceDirectory
  const captured = deferred<void>()
  const release = deferred<void>()
  let held = false
  const spy = vi
    .spyOn(paths, "listSpaceDirectory")
    .mockImplementation(async (...args) => {
      const entries = await list(...args)
      if (args[1] === "source" && !held) {
        held = true
        captured.resolve()
        await release.promise
      }
      return entries
    })
  try {
    const moving = f.session.movePaths(["source/0.txt"], "target")
    await captured.promise
    await fs.writeFile(path.join(f.root, "source/external.txt"), "external")
    await f.internals.handleStableWatcherChange(["source/external.txt"])
    release.resolve()
    const result = await moving
    expect(
      paths
        .flattenSpaceTree(result.snapshot.entries)
        .map((entry) => entry.relativePath)
    ).toContain("source/external.txt")
    expect(result.snapshot.externalChangePaths).toContain("source/external.txt")
  } finally {
    release.resolve()
    spy.mockRestore()
    await f.close()
  }
})

it("keeps cross-volume rename errors explicit and retries a transient file lock serially", async () => {
  const f = await fixture(2)
  const rename = fs.rename.bind(fs)
  const spy = vi
    .spyOn(fs, "rename")
    .mockRejectedValueOnce(Object.assign(new Error("Busy"), { code: "EBUSY" }))
    .mockImplementationOnce(rename)
    .mockRejectedValueOnce(
      Object.assign(new Error("Cross-device link"), { code: "EXDEV" })
    )
  try {
    const result = await f.session.movePaths(
      ["source/0.txt", "source/1.txt"],
      "target"
    )
    expect(spy).toHaveBeenCalledTimes(3)
    expect(result.moves).toHaveLength(1)
    expect(result.failure).toMatchObject({
      relativePath: "source/1.txt",
      message: "Cross-device link",
    })
    expect(await fs.readdir(path.join(f.root, "source"))).toEqual(["1.txt"])
    expect(await fs.readdir(path.join(f.root, "target"))).toEqual(["0.txt"])
  } finally {
    spy.mockRestore()
    await f.close()
  }
})
