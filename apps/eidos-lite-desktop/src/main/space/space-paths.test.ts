import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import {
  canonicalizeSpaceRoot,
  flattenSpaceTree,
  joinSpaceRelativePath,
  listSpaceDirectory,
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

  it("prunes ignored directories before walking their descendants", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-space-ignore-")
    )
    await fs.mkdir(path.join(root, "node_modules", "pkg"), { recursive: true })
    await fs.mkdir(path.join(root, "notes"))
    await fs.mkdir(path.join(root, "docs"))
    await fs.writeFile(path.join(root, "node_modules", "pkg", "index.js"), "x")
    await fs.writeFile(path.join(root, "notes", "visible.txt"), "visible")
    await fs.writeFile(path.join(root, "docs", "guide.txt"), "guide")
    const inspected: string[] = []
    let batches = 0

    try {
      const entries = flattenSpaceTree(
        await listSpaceTree(root, {
          ignoredPaths: async (relativePaths) => {
            batches += 1
            inspected.push(...relativePaths)
            return new Set(
              relativePaths.filter(
                (relativePath) => relativePath === "node_modules"
              )
            )
          },
        })
      )

      expect(entries.map((entry) => entry.relativePath)).toEqual([
        "docs",
        "docs/guide.txt",
        "notes",
        "notes/visible.txt",
      ])
      expect(inspected).toContain("node_modules")
      expect(
        inspected.some((relativePath) =>
          relativePath.startsWith("node_modules/")
        )
      ).toBe(false)
      expect(batches).toBe(2)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it("lists only direct children and batches ignore inspection", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "eidos-lite-space-directory-")
    )
    try {
      await fs.mkdir(path.join(root, "large"))
      await Promise.all(
        Array.from({ length: 1_001 }, (_, index) =>
          fs.writeFile(
            path.join(
              root,
              "large",
              `item-${String(index).padStart(4, "0")}.txt`
            ),
            "x"
          )
        )
      )
      let batches = 0
      const rootEntries = await listSpaceDirectory(root, null)
      const large = rootEntries.find((entry) => entry.name === "large")
      expect(large).toMatchObject({
        kind: "directory",
        children: [],
        childrenLoaded: false,
      })

      const children = await listSpaceDirectory(root, "large", {
        ignoredPaths: async () => {
          batches += 1
          return new Set()
        },
      })
      expect(children).toHaveLength(1_001)
      expect(batches).toBe(2)
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
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

  it("uses one canonical identity for a Space and its symlink alias", async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-space-id-"))
    const root = path.join(parent, "Space")
    const alias = path.join(parent, "Space Alias")
    await fs.mkdir(root)
    try {
      await fs.symlink(root, alias)
      const [canonical, canonicalAlias] = await Promise.all([
        canonicalizeSpaceRoot(root),
        canonicalizeSpaceRoot(alias),
      ])
      expect(canonicalAlias.id).toBe(canonical.id)
      expect(canonicalAlias.identity).toBe(canonical.identity)
      expect(canonicalAlias.root).toBe(canonical.root)
    } finally {
      await fs.rm(parent, { recursive: true, force: true })
    }
  })
})
