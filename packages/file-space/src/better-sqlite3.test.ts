// @vitest-environment node

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { BetterSqlite3FileSpaceIndexStorage } from "./better-sqlite3"
import { FileSpaceIndex } from "./file-index"
import { SpaceFiles } from "./space-files"

describe("persistent FileSpaceIndex", () => {
  let root: string
  let databasePath: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "eidos-persistent-index-"))
    databasePath = path.join(root, ".eidos", "indexes", "markdown.sqlite3")
    await mkdir(path.join(root, "notes"), { recursive: true })
    await writeFile(path.join(root, "notes", "Plan.md"), "# Plan\nalpha")
    await writeFile(path.join(root, "Today.md"), "See [[notes/Plan]].")
    await writeFile(path.join(root, "Readme.txt"), "introduction")
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  function createIndex(files = new SpaceFiles(root)) {
    return new FileSpaceIndex(files, {
      storage: new BetterSqlite3FileSpaceIndexStorage(databasePath),
    })
  }

  it("reuses unchanged file content after reopening", async () => {
    const first = createIndex()
    await expect(first.getStatus()).resolves.toMatchObject({
      fileCount: 3,
      contentFileCount: 3,
      persistent: true,
    })
    first.close()

    const files = new SpaceFiles(root)
    const readSpy = vi.spyOn(files, "readText")
    const reopened = createIndex(files)
    await expect(reopened.search("alpha")).resolves.toMatchObject([
      { path: "notes/Plan.md", match: "content" },
    ])
    await expect(reopened.getBacklinks("notes/Plan.md")).resolves.toMatchObject(
      [{ sourcePath: "Today.md", count: 1 }]
    )
    expect(readSpy).not.toHaveBeenCalled()
    reopened.close()
  })

  it("reads only changed content and persists watcher updates", async () => {
    const first = createIndex()
    await first.getStatus()
    first.close()

    await writeFile(
      path.join(root, "notes", "Plan.md"),
      "# Updated plan\na changed phrase with a different size"
    )
    const files = new SpaceFiles(root)
    const readSpy = vi.spyOn(files, "readText")
    const reopened = createIndex(files)
    await expect(reopened.search("changed phrase")).resolves.toHaveLength(1)
    expect(readSpy).toHaveBeenCalledTimes(1)

    await writeFile(
      path.join(root, "Today.md"),
      "A watcher-only persistent phrase"
    )
    reopened.updateTextFile(await files.readText("Today.md"))
    reopened.close()

    const thirdFiles = new SpaceFiles(root)
    const thirdReadSpy = vi.spyOn(thirdFiles, "readText")
    const third = createIndex(thirdFiles)
    await expect(third.search("watcher-only persistent")).resolves.toHaveLength(
      1
    )
    expect(thirdReadSpy).not.toHaveBeenCalled()
    third.close()
  })

  it("clears the cache for an explicit rebuild", async () => {
    const files = new SpaceFiles(root)
    const index = createIndex(files)
    await index.getStatus()
    const readSpy = vi.spyOn(files, "readText")

    await expect(index.rebuild()).resolves.toMatchObject({
      fileCount: 3,
      persistent: true,
    })
    expect(readSpy).toHaveBeenCalledTimes(3)
    index.close()
  })

  it("recovers a corrupt disposable database", async () => {
    await mkdir(path.dirname(databasePath), { recursive: true })
    await writeFile(databasePath, "not a sqlite database")

    const index = createIndex()
    await expect(index.getStatus()).resolves.toMatchObject({
      fileCount: 3,
      persistent: true,
    })
    await expect(index.search("alpha")).resolves.toHaveLength(1)
    index.close()
  })
})
