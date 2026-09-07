import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  normalizeSpacePathSearchLimit,
  scoreSpacePathCandidate,
  SpacePathIndex,
} from "./path-search"

let root: string

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-lite-path-search-"))
  await fs.mkdir(path.join(root, "notes"), { recursive: true })
  await fs.mkdir(path.join(root, "data"), { recursive: true })
  await fs.mkdir(path.join(root, ".graft"), { recursive: true })
  await fs.writeFile(path.join(root, "notes", "readme.md"), "hello")
  await fs.writeFile(path.join(root, "notes", "meeting-notes.md"), "notes")
  await fs.writeFile(path.join(root, "data", "crm.eidos"), "sqlite")
  await fs.writeFile(path.join(root, "data", "archive-2024.csv"), "a,b")
  await fs.writeFile(path.join(root, ".graft", "head"), "hidden")
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe("scoreSpacePathCandidate", () => {
  const candidate = (relativePath: string) => {
    const name = relativePath.split("/").at(-1) ?? relativePath
    return {
      relativePath,
      name,
      lowerPath: relativePath.toLowerCase(),
      lowerName: name.toLowerCase(),
    }
  }

  it("returns null when the query is not a subsequence", () => {
    expect(
      scoreSpacePathCandidate("xyz", candidate("notes/readme.md"))
    ).toBeNull()
    expect(
      scoreSpacePathCandidate("   ", candidate("notes/readme.md"))
    ).toBeNull()
  })

  it("prefers basename matches over directory matches", () => {
    const basename = scoreSpacePathCandidate(
      "readme",
      candidate("docs/readme.md")
    )
    const directory = scoreSpacePathCandidate(
      "readme",
      candidate("readme/todo.md")
    )
    expect(basename).not.toBeNull()
    expect(directory).not.toBeNull()
    expect(basename!).toBeGreaterThan(directory!)
  })

  it("rewards word-boundary and camelCase matches", () => {
    const boundary = scoreSpacePathCandidate(
      "mn",
      candidate("notes/meeting-notes.md")
    )
    const plain = scoreSpacePathCandidate("mn", candidate("notes/reminders.md"))
    expect(boundary).not.toBeNull()
    expect(plain).not.toBeNull()
    expect(boundary!).toBeGreaterThan(plain!)
  })
})

describe("normalizeSpacePathSearchLimit", () => {
  it("falls back to the default and clamps to the maximum", () => {
    expect(normalizeSpacePathSearchLimit(undefined)).toBe(50)
    expect(normalizeSpacePathSearchLimit(Number.NaN)).toBe(50)
    expect(normalizeSpacePathSearchLimit(0)).toBe(1)
    expect(normalizeSpacePathSearchLimit(500)).toBe(200)
  })
})

describe("SpacePathIndex", () => {
  it("finds release notes while excluding generated trees from initial and incremental indexing", async () => {
    const document = "apps/lite/RELEASE_NOTES.md"
    const dependency = "apps/lite/node_modules/dependency/RELEASE_NOTES.md"
    const generated = "target/debug/RELEASE_NOTES.md"
    for (const name of [document, dependency, generated]) {
      await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true })
      await fs.writeFile(path.join(root, name), "notes")
    }
    const index = new SpacePathIndex(root)
    await index.ensureScanned()
    expect(
      index.search("RELEASE_NOTES").map((hit) => hit.relativePath)
    ).toEqual([document])
    await index.applyChanges([dependency, generated, "apps"])
    expect(
      index.search("RELEASE_NOTES").map((hit) => hit.relativePath)
    ).toEqual([document])
  })

  it("can retry a failed initial scan instead of caching its rejection", async () => {
    const missing = path.join(root, "later")
    const index = new SpacePathIndex(missing)
    await expect(index.ensureScanned()).rejects.toThrow()
    await fs.mkdir(missing)
    await fs.writeFile(path.join(missing, "RELEASE_NOTES.md"), "notes")
    await index.ensureScanned()
    expect(index.search("RELEASE_NOTES")).toHaveLength(1)
  })
  it("searches aliases only on demand and refreshes changed or removed metadata", async () => {
    await fs.writeFile(
      path.join(root, "notes", "readme.md"),
      '---\naliases: ["Getting started", "上手指南"]\n---\nBody'
    )
    const index = new SpacePathIndex(root)
    await index.ensureScanned()
    expect(index.search("上手指南")).toEqual([])
    expect(await index.searchMarkdownNotes("上手指南")).toEqual([
      expect.objectContaining({
        relativePath: "notes/readme.md",
        matchedAlias: "上手指南",
      }),
    ])
    await fs.writeFile(
      path.join(root, "notes", "readme.md"),
      "---\naliases: Updated\n---\nBody"
    )
    await index.applyChanges(["notes/readme.md"])
    expect(await index.searchMarkdownNotes("上手指南")).toEqual([])
    expect(await index.searchMarkdownNotes("Updated")).toHaveLength(1)
    await fs.unlink(path.join(root, "notes", "readme.md"))
    await index.applyChanges(["notes/readme.md"])
    expect(await index.searchMarkdownNotes("Updated")).toEqual([])
  })

  it("skips symlink contents and oversized frontmatter while supporting UTF-16", async () => {
    await fs.writeFile(
      path.join(root, "notes", "readme.md"),
      Buffer.from("\uFEFF---\naliases: Encoded\n---\n", "utf16le")
    )
    await fs.symlink(
      path.join(root, "notes", "readme.md"),
      path.join(root, "linked.md")
    )
    await fs.writeFile(
      path.join(root, "huge.md"),
      `---\npadding: ${"a".repeat(65536)}\naliases: Invisible\n---\n`
    )
    const index = new SpacePathIndex(root)
    expect(
      (await index.searchMarkdownNotes("Encoded")).map(
        (entry) => entry.relativePath
      )
    ).toEqual(["notes/readme.md"])
    expect(await index.searchMarkdownNotes("Invisible")).toEqual([])
  })
  it("scans a space and finds files by fuzzy query", async () => {
    const index = new SpacePathIndex(root)
    await index.ensureScanned()
    expect(index.size).toBe(4)

    const hits = index.search("readme")
    expect(hits.map((hit) => hit.relativePath)).toContain("notes/readme.md")
    expect(hits[0]?.relativePath).toBe("notes/readme.md")
  })

  it("classifies eidos files and skips hidden implementation entries", async () => {
    const index = new SpacePathIndex(root)
    await index.ensureScanned()
    const eidos = index.search("crm")
    expect(eidos[0]?.kind).toBe("eidos")
    expect(index.search("head")).toEqual([])
  })

  it("applies additions and removals incrementally", async () => {
    const index = new SpacePathIndex(root)
    await index.ensureScanned()

    await fs.writeFile(path.join(root, "notes", "journal.md"), "new")
    await index.applyChanges(["notes/journal.md"])
    expect(index.search("journal")[0]?.relativePath).toBe("notes/journal.md")

    await fs.rm(path.join(root, "notes", "readme.md"))
    await index.applyChanges(["notes/readme.md"])
    expect(index.search("readme")).toEqual([])
  })

  it("removes descendants when a directory disappears and walks new directories", async () => {
    const index = new SpacePathIndex(root)
    await index.ensureScanned()

    await fs.rm(path.join(root, "notes"), { recursive: true })
    await index.applyChanges(["notes"])
    expect(index.search("meeting")).toEqual([])

    await fs.mkdir(path.join(root, "docs", "deep"), { recursive: true })
    await fs.writeFile(path.join(root, "docs", "deep", "spec.md"), "spec")
    await index.applyChanges(["docs"])
    expect(index.search("spec")[0]?.relativePath).toBe("docs/deep/spec.md")
  })

  it("ignores changes under hidden implementation directories", async () => {
    const index = new SpacePathIndex(root)
    await index.ensureScanned()
    await fs.writeFile(path.join(root, ".graft", "objects.pack"), "x")
    await index.applyChanges([".graft/objects.pack"])
    expect(index.search("objects")).toEqual([])
  })

  it("respects the result limit", async () => {
    const index = new SpacePathIndex(root)
    await index.ensureScanned()
    expect(index.search("a", 2)).toHaveLength(2)
  })
})
