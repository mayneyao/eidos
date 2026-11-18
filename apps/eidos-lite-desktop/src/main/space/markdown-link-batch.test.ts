import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { vi, it, expect } from "vitest"
import * as markdown from "@eidos.space/markdown/source"
import {
  captureMarkdownLinkSnapshot,
  listMarkdownLinkFiles,
  planMarkdownLinkMoves,
} from "./markdown-link-maintenance"
import { MarkdownLinkBatch } from "../../runtime/markdown-link-batch"
import {
  seedLinkBatchSpace,
  readLinkBatchRow,
  LINK_BODY,
} from "./markdown-link-batch.test-fixture"

it("parses a namespace snapshot once and maps only completed moves against it", async () => {
  const root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "eidos-link-snapshot-"))
  )
  const parse = vi.spyOn(markdown, "markdownFileLinkRanges")
  try {
    for (const directory of ["notes", "assets", "destination"])
      await fs.mkdir(path.join(root, directory))
    await fs.writeFile(path.join(root, "assets/c.png"), "asset")
    await fs.writeFile(path.join(root, "assets/plan.txt"), "plan")
    await fs.writeFile(
      path.join(root, "notes/a.md"),
      "![image](../assets/c.png)\r\n[plan](../assets/plan.txt)\r\n"
    )
    await fs.writeFile(path.join(root, "notes/b.markdown"), "[note](a.md)")
    const snapshot = await captureMarkdownLinkSnapshot(
      root,
      await listMarkdownLinkFiles(root)
    )
    expect(parse).toHaveBeenCalledTimes(2)
    const batch = await planMarkdownLinkMoves(snapshot, [
      { source: "notes/a.md", relativePath: "destination/a.md" },
      { source: "assets/c.png", relativePath: "destination/c.png" },
    ])
    expect(batch.edits).toEqual(
      expect.arrayContaining([
        {
          relativePath: "destination/a.md",
          content: "![image](c.png)\r\n[plan](../assets/plan.txt)\r\n",
          expectedRevision: expect.any(String),
        },
        {
          relativePath: "notes/b.markdown",
          content: "[note](../destination/a.md)",
          expectedRevision: expect.any(String),
        },
      ])
    )
    const prefix = await planMarkdownLinkMoves(snapshot, [
      { source: "assets/c.png", relativePath: "destination/c.png" },
    ])
    expect(
      prefix.edits.map((edit) => [edit.relativePath, edit.content])
    ).toEqual([
      [
        "notes/a.md",
        "![image](../destination/c.png)\r\n[plan](../assets/plan.txt)\r\n",
      ],
    ])
    expect(parse).toHaveBeenCalledTimes(2)
  } finally {
    parse.mockRestore()
    await fs.rm(root, { recursive: true, force: true })
  }
})

it("does not open private catalog or symlink Content owners in the maintenance worker", async () => {
  const directory = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "eidos-link-scope-"))
  )
  const root = path.join(directory, "Space")
  const seeded = (await seedLinkBatchSpace(root, { databases: 1, rows: 2 }))!
  try {
    await fs.mkdir(path.join(root, ".eidos"))
    await fs.writeFile(
      path.join(root, ".eidos/files.eidos"),
      "private catalog sentinel"
    )
    const outside = path.join(directory, "outside.eidos")
    await fs.copyFile(path.join(root, "data/db-0.eidos"), outside)
    const before = await fs.readFile(outside)
    await fs.symlink(outside, path.join(root, "alias.eidos"))
    const files = await listMarkdownLinkFiles(root)
    files.push(
      {
        relativePath: ".eidos/files.eidos",
        name: "files.eidos",
        kind: "eidos",
        score: 0,
      },
      {
        relativePath: "alias.eidos",
        name: "alias.eidos",
        kind: "eidos",
        score: 0,
      }
    )
    const batch = new MarkdownLinkBatch(root)
    const prepared = await batch.prepare(files)
    expect(prepared.stats.contentDocuments).toBe(2)
    expect(prepared.owners).not.toContain(".eidos/files.eidos")
    await fs.rename(
      path.join(root, "assets/c.png"),
      path.join(root, "destination/c.png")
    )
    const result = await batch.apply([
      { source: "assets/c.png", relativePath: "destination/c.png" },
    ])
    expect(result.skippedPaths).toContain("alias.eidos")
    const row = await readLinkBatchRow(
      root,
      "data/db-0.eidos",
      seeded.tableId,
      seeded.rowId
    )
    expect(row?.[seeded.content.tableColumnName]).toBe(
      LINK_BODY.replace("../assets/c.png", "../destination/c.png")
    )
    expect(await fs.readFile(outside)).toEqual(before)
    expect(
      await fs.readFile(path.join(root, ".eidos/files.eidos"), "utf8")
    ).toBe("private catalog sentinel")
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
