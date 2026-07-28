import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  canonicalizeSpaceRoot,
  flattenSpaceTree,
  joinSpaceRelativePath,
  listSpaceTree,
  normalizeMutableRelativePath,
  normalizeRelativePath,
  normalizeSpaceEntryName,
  resolveSpaceDirectory,
  resolveSpacePath,
} from "./space-paths"

describe("Space paths", () => {
  it("opens a normal folder, hides implementation state, and keeps user files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-space-"))
    await fs.mkdir(path.join(root, ".graft"))
    await fs.mkdir(path.join(root, "assets"))
    await fs.writeFile(path.join(root, ".DS_Store"), "noise")
    await fs.writeFile(path.join(root, ".env"), "user-owned")
    await fs.writeFile(path.join(root, "tasks.eidos"), "fixture")
    await fs.writeFile(path.join(root, "assets", "avatar.txt"), "asset")

    const canonical = await canonicalizeSpaceRoot(root)
    const entries = flattenSpaceTree(await listSpaceTree(canonical.root))

    expect(canonical.id).toHaveLength(24)
    expect(entries.map((entry) => entry.relativePath)).toEqual([
      "assets",
      "assets/avatar.txt",
      ".env",
      "tasks.eidos",
    ])
    expect(entries.find((entry) => entry.name === "tasks.eidos")?.kind).toBe(
      "eidos"
    )
  })

  it("rejects absolute and traversal paths", () => {
    expect(() => normalizeRelativePath("../outside")).toThrow("escapes")
    expect(() => normalizeRelativePath("/outside")).toThrow("relative")
    expect(() =>
      resolveSpacePath("/tmp/space", "folder/../../outside")
    ).toThrow("escapes")
  })

  it("builds portable child paths and protects implementation state", () => {
    expect(joinSpaceRelativePath(null, "Roadmap.eidos")).toBe("Roadmap.eidos")
    expect(joinSpaceRelativePath("projects", "Roadmap.eidos")).toBe(
      "projects/Roadmap.eidos"
    )
    expect(() => normalizeMutableRelativePath(".graft/config.toml")).toThrow(
      "protected"
    )
    expect(() => normalizeSpaceEntryName("bad/name")).toThrow("unsupported")
    expect(() => normalizeSpaceEntryName(".graft")).toThrow("protected")
  })

  it("rejects target directories reached through escaping symlinks", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-space-root-"))
    const outside = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-space-outside-")
    )
    try {
      await fs.symlink(outside, path.join(root, "outside"))
      await expect(resolveSpaceDirectory(root, "outside")).rejects.toThrow(
        "symlink"
      )
    } finally {
      await Promise.all([
        fs.rm(root, { recursive: true, force: true }),
        fs.rm(outside, { recursive: true, force: true }),
      ])
    }
  })
})
