import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { expect, it, vi } from "vitest"
import { readSpaceFilterTree } from "./filter-files"
import { flattenSpaceTree } from "./space-paths"

it("uses each repository's scoped rules, nested negation and directory pruning while keeping raw scans available", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "recent-ignore-"))
  const put = async (name: string, content = "fixture") => {
    await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true })
    await fs.writeFile(path.join(root, name), content)
  }
  try {
    await Promise.all([
      fs.mkdir(path.join(root, "alpha")),
      fs.mkdir(path.join(root, "beta")),
    ])
    for (const repo of ["alpha", "beta"]) {
      execFileSync("git", ["init", "-q", path.join(root, repo)])
      execFileSync("git", [
        "-C",
        path.join(root, repo),
        "config",
        "core.ignorecase",
        "false",
      ])
    }
    await put(".gitignore", "*.tmp\nspace-cache/\n")
    await put("alpha/.gitignore", "node_modules/\n/dist/\n*.log\n!keep.log\n")
    await put("alpha/src/.gitignore", "!keep.tmp\n/notes.txt\n")
    await put("beta/.gitignore", "cache/\n!cache/keep.md\n*.bin\n!keep.bin\n")
    const hidden = [
      "alpha/node_modules/dep.ts",
      "alpha/dist/output.js",
      "alpha/drop.log",
      "alpha/src/drop.tmp",
      "alpha/src/notes.txt",
      "beta/cache/keep.md",
      "beta/drop.bin",
      "space-cache/inside.md",
    ]
    const visible = [
      "alpha/keep.log",
      "alpha/src/keep.tmp",
      "alpha/src/code.ts",
      "alpha/src/dist/keep.js",
      "beta/keep.bin",
      "beta/node_modules/visible.md",
    ]
    for (const name of [...hidden, ...visible]) await put(name)
    await put("beta/cache/.gitignore", "!keep.md\n")
    const readdir = vi.spyOn(fs, "readdir")
    const files = flattenSpaceTree(
      await readSpaceFilterTree(root, null, true)
    ).map((f) => f.relativePath)
    for (const name of hidden) expect(files).not.toContain(name)
    for (const name of visible) expect(files).toContain(name)
    expect(
      readdir.mock.calls.some(
        ([directory]) =>
          String(directory) === path.join(root, "alpha/node_modules")
      )
    ).toBe(false)
    expect(
      readdir.mock.calls.some(
        ([directory]) => String(directory) === path.join(root, "beta/cache")
      )
    ).toBe(false)
    readdir.mockRestore()
    const scoped = flattenSpaceTree(
      await readSpaceFilterTree(root, "alpha/src", true)
    ).map((f) => f.relativePath)
    expect(scoped).toContain("alpha/src/keep.tmp")
    expect(scoped).not.toContain("alpha/src/drop.tmp")
    expect(scoped).not.toContain("alpha/src/notes.txt")
    expect(await readSpaceFilterTree(root, "beta/cache", true)).toEqual([])
    const all = flattenSpaceTree(await readSpaceFilterTree(root, null)).map(
      (f) => f.relativePath
    )
    for (const name of hidden) expect(all).toContain(name)
    for (const repo of ["alpha", "beta"]) {
      const candidates = [...hidden, ...visible]
        .filter((name) => name.startsWith(repo + "/") && !name.endsWith(".tmp"))
        .map((name) => name.slice(repo.length + 1))
      const result = execFileSync(
        "git",
        [
          "-C",
          path.join(root, repo),
          "check-ignore",
          "--no-index",
          "-z",
          "--stdin",
        ],
        { input: candidates.join("\0") + "\0", encoding: "utf8" }
      )
      const ignored = result.split("\0").filter(Boolean)
      for (const relative of candidates)
        expect(files.includes(`${repo}/${relative}`)).toBe(
          !ignored.includes(relative)
        )
    }
  } finally {
    vi.restoreAllMocks()
    await fs.rm(root, { recursive: true, force: true })
  }
})

it("does not follow ignore-file symlinks, and rejects over-limit rules instead of silently skipping them", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "recent-ignore-limits-"))
  const outside = await fs.mkdtemp(
    path.join(os.tmpdir(), "recent-ignore-outside-")
  )
  try {
    await fs.writeFile(path.join(root, "keep.md"), "keep")
    await fs.writeFile(path.join(outside, "rules"), "*.md")
    await fs.symlink(path.join(outside, "rules"), path.join(root, ".gitignore"))
    expect(
      flattenSpaceTree(await readSpaceFilterTree(root, null, true)).map(
        (f) => f.relativePath
      )
    ).toContain("keep.md")
    await fs.unlink(path.join(root, ".gitignore"))
    await fs.writeFile(path.join(root, ".gitignore"), "x".repeat(65537))
    await expect(readSpaceFilterTree(root, null, true)).rejects.toThrow(
      ".gitignore is larger than 64 KB"
    )
  } finally {
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(outside, { recursive: true, force: true })
  }
})
