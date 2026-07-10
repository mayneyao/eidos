// @vitest-environment node

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { SpaceRegistry } from "./space-registry"

class TestSpaceRegistry extends SpaceRegistry {
  constructor(configRoot: string) {
    super()
    this.eidosDir = configRoot
    this.spacesConfigPath = path.join(configRoot, "spaces.json")
    this.globalConfigPath = path.join(configRoot, "config.json")
  }
}

describe("SpaceRegistry storage modes", () => {
  let root: string
  let configRoot: string
  let registry: TestSpaceRegistry

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "eidos-space-registry-"))
    configRoot = path.join(root, "config")
    registry = new TestSpaceRegistry(configRoot)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("registers an ordinary folder as a file Space", async () => {
    const spacePath = path.join(root, "notes")
    await mkdir(spacePath)

    const space = registry.registerSpace(spacePath)

    expect(space.mode).toBe("file")
    expect(registry.validateSpace(space.id)).toBe(true)
  })

  it.each([
    ["Obsidian-style settings", ".obsidian"],
    ["file-level version metadata", ".graft"],
  ])("keeps a folder with %s in file mode", async (_label, markerPath) => {
    const spacePath = path.join(root, "notes")
    await mkdir(path.join(spacePath, markerPath), { recursive: true })

    const space = registry.registerSpace(spacePath)

    expect(space.mode).toBe("file")
    expect(registry.validateSpace(space.id)).toBe(true)
  })

  it("recognizes a legacy database version repository", async () => {
    const spacePath = path.join(root, "legacy-versioned")
    await mkdir(path.join(spacePath, ".eidos", ".graft"), { recursive: true })

    const space = registry.registerSpace(spacePath)

    expect(space.mode).toBe("legacy")
    expect(space.versioning).toEqual({ enabled: true })
    expect(registry.validateSpace(space.id)).toBe(true)
  })

  it("creates routable IDs for non-ASCII and long folder names", async () => {
    const chinesePath = path.join(root, "我的笔记")
    const secondChinesePath = path.join(root, "工作空间")
    const accentedPath = path.join(root, "Café")
    const longPath = path.join(root, "a".repeat(100))
    await Promise.all(
      [chinesePath, secondChinesePath, accentedPath, longPath].map((folder) =>
        mkdir(folder)
      )
    )

    const chinese = registry.registerSpace(chinesePath)
    const secondChinese = registry.registerSpace(secondChinesePath)
    const accented = registry.registerSpace(accentedPath)
    const long = registry.registerSpace(longPath)

    expect(chinese).toMatchObject({ id: "space", name: "我的笔记" })
    expect(secondChinese.id).toBe("space-1")
    expect(accented.id).toBe("cafe")
    expect(long.id).toHaveLength(48)
    expect(
      [chinese, secondChinese, accented, long].every((space) =>
        /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(space.id)
      )
    ).toBe(true)
  })

  it("rejects files as Space roots", async () => {
    const filePath = path.join(root, "notes.md")
    await writeFile(filePath, "not a folder")

    expect(() => registry.registerSpace(filePath)).toThrow(
      "Space path is not a directory"
    )
    expect(registry.getAllSpaces()).toEqual([])
  })

  it("recognizes an existing database-backed Space as legacy", async () => {
    const spacePath = path.join(root, "legacy")
    await mkdir(path.join(spacePath, ".eidos"), { recursive: true })
    await writeFile(path.join(spacePath, ".eidos", "db.sqlite3"), "")

    const space = registry.registerSpace(spacePath)

    expect(space.mode).toBe("legacy")
    expect(registry.validateSpace(space.id)).toBe(true)
  })

  it("treats old registry entries without a mode as legacy", async () => {
    const spacePath = path.join(root, "old-space")
    await mkdir(spacePath)
    await mkdir(configRoot, { recursive: true })
    await writeFile(
      path.join(configRoot, "spaces.json"),
      JSON.stringify({
        spaces: [{ id: "old-space", name: "Old", path: spacePath }],
      })
    )

    expect(registry.getSpace("old-space")).toMatchObject({ mode: "legacy" })
  })

  it("finds the first valid Space when an earlier folder is unavailable", async () => {
    const missingPath = path.join(root, "missing")
    const availablePath = path.join(root, "available")
    await Promise.all([mkdir(missingPath), mkdir(availablePath)])
    const missing = registry.registerSpace(missingPath)
    const available = registry.registerSpace(availablePath)
    await rm(missingPath, { recursive: true })

    expect(registry.getFirstSpace()?.id).toBe(missing.id)
    expect(registry.getFirstValidSpace()?.id).toBe(available.id)
  })

  it("selects the next valid Space after removing the current one", async () => {
    const currentPath = path.join(root, "current")
    const missingPath = path.join(root, "missing")
    const availablePath = path.join(root, "available")
    await Promise.all([
      mkdir(currentPath),
      mkdir(missingPath),
      mkdir(availablePath),
    ])
    const current = registry.registerSpace(currentPath)
    registry.registerSpace(missingPath)
    const available = registry.registerSpace(availablePath)
    registry.setLastOpenedSpace(current.id)
    await rm(missingPath, { recursive: true })

    expect(registry.removeSpace(current.id)).toBe(true)
    expect(registry.getLastOpenedSpace()?.id).toBe(available.id)
  })

  it("does not select an unavailable Space after removing the current one", async () => {
    const currentPath = path.join(root, "current")
    const missingPath = path.join(root, "missing")
    await Promise.all([mkdir(currentPath), mkdir(missingPath)])
    const current = registry.registerSpace(currentPath)
    registry.registerSpace(missingPath)
    registry.setLastOpenedSpace(current.id)
    await rm(missingPath, { recursive: true })

    expect(registry.removeSpace(current.id)).toBe(true)
    expect(registry.getLastOpenedSpace()).toBeNull()
  })
})
