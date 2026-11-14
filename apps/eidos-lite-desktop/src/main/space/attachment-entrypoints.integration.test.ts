import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { GraftClient } from "../graft/graft-client"
import { GraftInProcessTransport } from "../graft/graft-in-process-transport"
import { SpaceSession } from "./space-session"
import { SpaceWatcher } from "./space-watcher"
import { flattenSpaceTree } from "./space-paths"

it("publishes imported files to the tree and file search before the OS watcher arrives", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-drop-search-"))
  const root = path.join(base, "Space")
  await fs.mkdir(path.join(root, "images"), { recursive: true })
  const source = path.join(base, "photo.png")
  await fs.writeFile(source, "synthetic image bytes")
  const start = vi
    .spyOn(SpaceWatcher.prototype, "start")
    .mockImplementation(() => {})
  const graft = new GraftClient({ sdkTransport: new GraftInProcessTransport() })
  let session: SpaceSession | undefined
  try {
    session = await SpaceSession.create(root, path.join(base, "state"), {
      graft,
    })
    expect(await session.searchPaths("photo.png")).toEqual([])
    const imported = await session.importFiles([source], "images")
    expect(
      flattenSpaceTree((await session.loadDirectory("images")).entries).map(
        (e) => e.relativePath
      )
    ).toContain("images/photo.png")
    expect(imported.relativePath).toBe("images/photo.png")
    expect(await fs.readFile(source, "utf8")).toBe("synthetic image bytes")
    expect(await fs.readFile(path.join(root, "images/photo.png"), "utf8")).toBe(
      "synthetic image bytes"
    )
    expect(await session.searchPaths("photo.png")).toEqual([
      expect.objectContaining({ relativePath: "images/photo.png" }),
    ])
    await expect(session.importFiles([source], "images")).rejects.toThrow(
      "already exists"
    )
    expect(await fs.readFile(path.join(root, "images/photo.png"), "utf8")).toBe(
      "synthetic image bytes"
    )
  } finally {
    await session?.close()
    if (!session) await graft.close()
    start.mockRestore()
    await fs.rm(base, { recursive: true, force: true })
  }
})

it("rejects same-name sources without publishing or overwriting either file", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-drop-collision-"))
  const root = path.join(base, "Space")
  await fs.mkdir(root)
  await fs.mkdir(path.join(base, "other"))
  const first = path.join(base, "report.pdf")
  const second = path.join(base, "other", "report.pdf")
  await fs.writeFile(first, "first")
  await fs.writeFile(second, "second")
  const graft = new GraftClient({ sdkTransport: new GraftInProcessTransport() })
  let session: SpaceSession | undefined
  try {
    session = await SpaceSession.create(root, path.join(base, "state"), {
      graft,
    })
    await expect(session.importFiles([first, second], null)).rejects.toThrow(
      /same name|already exists/u
    )
    expect(await fs.readdir(root)).toEqual([])
    expect(await fs.readFile(first, "utf8")).toBe("first")
    expect(await fs.readFile(second, "utf8")).toBe("second")
  } finally {
    await session?.close()
    if (!session) await graft.close()
    await fs.rm(base, { recursive: true, force: true })
  }
})

it("preserves a destination created after import preflight and removes staged files", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-drop-race-"))
  const root = path.join(base, "Space")
  await fs.mkdir(root)
  const source = path.join(base, "report.pdf")
  await fs.writeFile(source, "source")
  const graft = new GraftClient({ sdkTransport: new GraftInProcessTransport() })
  let session: SpaceSession | undefined
  const link = fs.link.bind(fs)
  const publish = vi
    .spyOn(fs, "link")
    .mockImplementationOnce(async (from, to) => {
      await fs.writeFile(to, "concurrent file", { flag: "wx" })
      await link(from, to)
    })
  try {
    session = await SpaceSession.create(root, path.join(base, "state"), {
      graft,
    })
    await expect(session.importFiles([source], null)).rejects.toThrow(/EEXIST/u)
    expect(await fs.readdir(root)).toEqual(["report.pdf"])
    expect(await fs.readFile(path.join(root, "report.pdf"), "utf8")).toBe(
      "concurrent file"
    )
    expect(await fs.readFile(source, "utf8")).toBe("source")
  } finally {
    publish.mockRestore()
    await session?.close()
    if (!session) await graft.close()
    await fs.rm(base, { recursive: true, force: true })
  }
})
