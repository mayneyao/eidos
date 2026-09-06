import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it } from "vitest"
import type { SpacePathSearchHit } from "../../shared/contracts"
import {
  applyMarkdownLinkMove,
  prepareMarkdownLinkMove,
  rewriteMovedMarkdownLinks,
} from "./markdown-link-maintenance"

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0))
    await fs.rm(root, { recursive: true, force: true })
})
const files = (...paths: string[]): SpacePathSearchHit[] =>
  paths.map((relativePath) => ({
    relativePath,
    name: path.posix.basename(relativePath),
    kind: "file",
    score: 0,
  }))

it("keeps quoted YAML wiki properties valid when the new filename contains a quote", async () => {
  const source = "---\nauthor: '[[Note|Author]]'\n---\n"
  expect(
    await rewriteMovedMarkdownLinks(
      source,
      "index.md",
      "Note.md",
      "Sam's.md",
      files("index.md", "Note.md")
    )
  ).toBe("---\nauthor: '[[/Sam%27s|Author]]'\n---\n")
})

it("disambiguates a short wiki link when moving its owner changes local resolution", async () => {
  expect(
    await rewriteMovedMarkdownLinks(
      "[[Note|label]]",
      "a/index.md",
      "a/index.md",
      "b/index.md",
      files("a/index.md", "a/Note.md", "b/Note.md")
    )
  ).toBe("[[/a/Note|label]]")
})

it("does not rewrite unresolved links or unrelated note formatting", async () => {
  const source = "*odd spelling*\n\n[[Missing]] [missing](missing.md)\n"
  expect(
    await rewriteMovedMarkdownLinks(
      source,
      "index.md",
      "Note.md",
      "Renamed.md",
      files("index.md", "Note.md")
    )
  ).toBe(source)
})

it("updates incoming paths without reserializing labels, aliases, anchors or code", async () => {
  const source =
    '[[Note#Heading|Alias]]\r\n[x](Note.md#^block "Title")\r\n`[[Note]]`\r\n'
  expect(
    await rewriteMovedMarkdownLinks(
      source,
      "index.md",
      "Note.md",
      "Renamed.md",
      files("index.md", "Note.md")
    )
  ).toBe(
    '[[/Renamed#Heading|Alias]]\r\n[x](Renamed.md#^block "Title")\r\n`[[Note]]`\r\n'
  )
})

it("rebases outgoing relative links when a folder moves and keeps bound short wiki names", async () => {
  const source = "[image](../image.png) [[Sibling]] [s](Sibling.md)"
  expect(
    await rewriteMovedMarkdownLinks(
      source,
      "notes/a.md",
      "notes",
      "archive/notes",
      files("notes/a.md", "notes/Sibling.md", "image.png")
    )
  ).toBe("[image](../../image.png) [[Sibling]] [s](Sibling.md)")
})

it("updates references to attachments and definitions, not external URLs", async () => {
  const source =
    '![[image.png|200]]\n\n![image][ref]\n\n[ref]: image.png "Title"\n\n[x](https://host/image.png)'
  expect(
    await rewriteMovedMarkdownLinks(
      source,
      "index.md",
      "image.png",
      "new image.png",
      files("index.md", "image.png")
    )
  ).toBe(
    '![[image.png|200]]\n\n![image][ref]\n\n[ref]: new%20image.png "Title"\n\n[x](https://host/image.png)'
  )
})

it("preserves newer disk content when applying a prepared update", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "markdown-link-move-"))
  roots.push(root)
  await fs.writeFile(path.join(root, "index.md"), "[[Note]]")
  await fs.writeFile(path.join(root, "Note.md"), "Note")
  const plan = await prepareMarkdownLinkMove(root, "Note.md", "Renamed.md")
  expect(plan.edits).toHaveLength(1)
  await fs.rename(path.join(root, "Note.md"), path.join(root, "Renamed.md"))
  await fs.writeFile(path.join(root, "index.md"), "Newer content")
  expect(await applyMarkdownLinkMove(root, plan)).toEqual({
    updatedPaths: [],
    skippedPaths: ["index.md"],
  })
  expect(await fs.readFile(path.join(root, "index.md"), "utf8")).toBe(
    "Newer content"
  )
})

it("updates UTF-16 notes while preserving encoding and CRLF", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "markdown-link-move-"))
  roots.push(root)
  await fs.writeFile(
    path.join(root, "index.md"),
    Buffer.from("\uFEFF[[Note]]\r\n", "utf16le")
  )
  await fs.writeFile(path.join(root, "Note.md"), "Note")
  const plan = await prepareMarkdownLinkMove(root, "Note.md", "Renamed.md")
  await fs.rename(path.join(root, "Note.md"), path.join(root, "Renamed.md"))
  expect(await applyMarkdownLinkMove(root, plan)).toEqual({
    updatedPaths: ["index.md"],
    skippedPaths: [],
  })
  expect(
    (await fs.readFile(path.join(root, "index.md"))).toString("utf16le")
  ).toBe("\uFEFF[[/Renamed]]\r\n")
})
