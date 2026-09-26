import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SpaceSession } from "./space-session"

let directory: string, root: string, session: SpaceSession
beforeEach(async () => {
  directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "plugin-files-"))
  )
  root = path.join(directory, "space")
  await fs.mkdir(root)
  session = Object.assign(Object.create(SpaceSession.prototype), {
    canonical: { root },
    gate: { withMutation: (run: () => Promise<unknown>) => run() },
    prioritizeLocalWork: vi.fn(),
    noteLocalChange: vi.fn(),
    freshSnapshotAndEmit: vi.fn(),
    closeAndEvictRuntimeSessions: vi.fn(),
    markdownWatchers: new Set(),
    closed: false,
  }) as SpaceSession
})
afterEach(async () => {
  vi.restoreAllMocks()
  await fs.rm(directory, { recursive: true, force: true })
})

describe("plugin file mutations", () => {
  it("writes regular text and binary files, including shorter replacements", async () => {
    await session.writeTextFile("test.txt", "long original")
    await session.writeTextFile("test.txt", "new")
    expect(await fs.readFile(path.join(root, "test.txt"), "utf8")).toBe("new")
    await session.writeBinaryFile("test.bin", Buffer.from([0, 255, 1]))
    expect(await fs.readFile(path.join(root, "test.bin"))).toEqual(
      Buffer.from([0, 255, 1])
    )
  })

  it("rejects leaf symlinks for text and binary writes, deletes and renames", async () => {
    const outside = path.join(directory, "outside.txt")
    await fs.writeFile(outside, "untouched")
    await fs.symlink(outside, path.join(root, "link.txt"))
    for (const run of [
      () => session.writeTextFile("link.txt", "bad"),
      () => session.writeBinaryFile("link.txt", Buffer.from("bad")),
      () => session.deleteFile("link.txt"),
      () => session.renameFile("link.txt", "moved.txt"),
    ])
      await expect(run()).rejects.toThrow()
    expect(await fs.readFile(outside, "utf8")).toBe("untouched")
  })

  it("rejects linked parents in both source and destination paths", async () => {
    await fs.mkdir(path.join(directory, "outside"))
    await fs.writeFile(path.join(directory, "outside/file.txt"), "untouched")
    await fs.symlink(
      path.join(directory, "outside"),
      path.join(root, "linked"),
      "dir"
    )
    await fs.writeFile(path.join(root, "source.txt"), "source")
    for (const run of [
      () => session.writeTextFile("linked/file.txt", "bad"),
      () => session.writeBinaryFile("linked/file.txt", Buffer.from("bad")),
      () => session.deleteFile("linked/file.txt"),
      () => session.renameFile("linked/file.txt", "moved.txt"),
      () => session.renameFile("source.txt", "linked/new.txt"),
    ])
      await expect(run()).rejects.toThrow()
    expect(
      await fs.readFile(path.join(directory, "outside/file.txt"), "utf8")
    ).toBe("untouched")
    expect(await fs.readFile(path.join(root, "source.txt"), "utf8")).toBe(
      "source"
    )
  })

  it("preserves occupied targets and moves files to vacant paths", async () => {
    await fs.writeFile(path.join(root, "source.txt"), "source")
    await fs.writeFile(path.join(root, "target.txt"), "valuable")
    await expect(
      session.renameFile("source.txt", "target.txt")
    ).rejects.toMatchObject({ code: "ALREADY_EXISTS" })
    expect(await fs.readFile(path.join(root, "target.txt"), "utf8")).toBe(
      "valuable"
    )
    expect(await fs.readFile(path.join(root, "source.txt"), "utf8")).toBe(
      "source"
    )
    await session.renameFile("source.txt", "moved.txt")
    expect(await fs.readFile(path.join(root, "moved.txt"), "utf8")).toBe(
      "source"
    )
    await expect(fs.stat(path.join(root, "source.txt"))).rejects.toMatchObject({
      code: "ENOENT",
    })
    await session.deleteFile("moved.txt")
    await session.deleteFile("moved.txt")
  })

  it("does not clobber a target created between validation and the move", async () => {
    await fs.writeFile(path.join(root, "source.txt"), "source")
    const link = fs.link.bind(fs)
    vi.spyOn(fs, "link").mockImplementationOnce(async (from, to) => {
      await fs.writeFile(to, "concurrent data")
      await link(from, to)
    })
    await expect(
      session.renameFile("source.txt", "target.txt")
    ).rejects.toMatchObject({ code: "ALREADY_EXISTS" })
    expect(await fs.readFile(path.join(root, "target.txt"), "utf8")).toBe(
      "concurrent data"
    )
    expect(await fs.readFile(path.join(root, "source.txt"), "utf8")).toBe(
      "source"
    )
  })

  it("does not truncate a leaf replaced with a symlink before open", async () => {
    const outside = path.join(directory, "outside.txt")
    await fs.writeFile(outside, "untouched")
    await fs.writeFile(path.join(root, "target.txt"), "original")
    const open = fs.open.bind(fs)
    vi.spyOn(fs, "open").mockImplementationOnce(async (file, flags, mode) => {
      await fs.unlink(file)
      await fs.symlink(outside, file)
      return open(file, flags, mode)
    })
    await expect(session.writeTextFile("target.txt", "bad")).rejects.toThrow()
    expect(await fs.readFile(outside, "utf8")).toBe("untouched")
  })
})
