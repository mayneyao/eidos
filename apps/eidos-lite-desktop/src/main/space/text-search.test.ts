import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { searchSpaceText, TEXT_SEARCH_LIMITS } from "./text-search"
import type { TextSearchOptions } from "../../shared/text-search"

let root: string
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "lite-search-"))
})
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})
const search = (
  query: string,
  limits = TEXT_SEARCH_LIMITS,
  signal = new AbortController().signal
) => searchSpaceText(root, "test", query, signal, () => undefined, limits)

it("propagates matching modes and exact regex highlights through a real file scan", async () => {
  await fs.writeFile(
    path.join(root, "note.md"),
    "work12 Work7 workspace 中文 中文字符"
  )
  const run = (query: string, options: TextSearchOptions) =>
    searchSpaceText(
      root,
      "modes",
      query,
      new AbortController().signal,
      () => undefined,
      TEXT_SEARCH_LIMITS,
      options
    )
  const result = await run("work\\d+", { regex: true, caseSensitive: true })
  expect(result.hits).toHaveLength(1)
  expect(result.hits[0]).toMatchObject({
    matchedText: "work12",
    highlightRanges: [{ start: 0, end: 6 }],
    options: { regex: true, caseSensitive: true },
  })
  expect((await run("中文", { wholeWord: true })).hits).toHaveLength(1)
  await expect(run("[", { regex: true })).rejects.toThrow()
})

it("finds Chinese and literal punctuation with distinct paths and UTF-16 source offsets", async () => {
  await fs.mkdir(path.join(root, "sub"))
  await fs.writeFile(path.join(root, "note.md"), "# note\n中文 [a]+ 中文\n")
  await fs.writeFile(
    path.join(root, "sub/note.md"),
    Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from("中文 [A]+", "utf16le"),
    ])
  )
  const result = await search("中文")
  expect(result.hits).toHaveLength(3)
  expect(result.hits.map((hit) => hit.relativePath)).toContain("sub/note.md")
  expect(
    result.hits.find((hit) => hit.relativePath === "note.md")
  ).toMatchObject({ line: 2, column: 1, start: 7, end: 9 })
  expect((await search("[a]+")).hits).toHaveLength(2)
  expect(result).toMatchObject({
    done: true,
    scanned: 2,
    skipped: 0,
    errors: 0,
    stopped: null,
  })
})

it("does not traverse implementation directories, symlinks, binaries or oversized files", async () => {
  for (const name of [".graft", ".git", "node_modules", "dist"]) {
    await fs.mkdir(path.join(root, name))
    await fs.writeFile(path.join(root, name, "secret.md"), "needle")
  }
  await fs.writeFile(
    path.join(root, "binary.txt"),
    Buffer.from([0, 110, 101, 101, 100, 108, 101])
  )
  await fs.writeFile(path.join(root, "large.txt"), "needle".repeat(10))
  await fs.writeFile(path.join(root, "ok.md"), "needle")
  await fs.symlink(path.join(root, "ok.md"), path.join(root, "link.md"))
  await fs.symlink(path.join(root, ".git"), path.join(root, "linked-folder"))
  const result = await search("needle", {
    ...TEXT_SEARCH_LIMITS,
    fileBytes: 20,
  })
  expect(result.hits.map((hit) => hit.relativePath)).toEqual(["ok.md"])
  expect(result.skipped).toBe(8)
})

it("cancels and exposes partial scans at entry and match limits", async () => {
  await fs.writeFile(path.join(root, "note.md"), "match match match")
  const controller = new AbortController()
  controller.abort()
  expect(
    await search("match", TEXT_SEARCH_LIMITS, controller.signal)
  ).toMatchObject({ stopped: "cancelled", scanned: 0 })
  expect(
    await search("match", { ...TEXT_SEARCH_LIMITS, hits: 2 })
  ).toMatchObject({
    stopped: "limit",
    hits: [expect.anything(), expect.anything()],
  })
  expect(
    await search("match", { ...TEXT_SEARCH_LIMITS, entries: 0 })
  ).toMatchObject({ stopped: "limit", scanned: 0 })
})

it("reads external changes again instead of returning cached content", async () => {
  await fs.writeFile(path.join(root, "note.md"), "before")
  expect((await search("before")).hits).toHaveLength(1)
  await fs.writeFile(path.join(root, "note.md"), "after")
  expect((await search("before")).hits).toHaveLength(0)
  expect((await search("after")).hits).toHaveLength(1)
  await fs.rename(path.join(root, "note.md"), path.join(root, "moved.md"))
  expect((await search("after")).hits[0]?.relativePath).toBe("moved.md")
})
