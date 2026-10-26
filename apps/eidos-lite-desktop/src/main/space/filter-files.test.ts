import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { expect, it } from "vitest"
import { filterSpaceFiles } from "./filter-files"
import { flattenSpaceTree } from "./space-paths"

it("finds matches in unexpanded folders and removes unrelated and genuinely empty folders", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "eidos-type-filter-"))
  try {
    for (const directory of [
      "empty",
      "unrelated",
      "notes/deep",
      ".eidos",
      ".graft",
    ])
      await fs.mkdir(path.join(root, directory), { recursive: true })
    for (const file of [
      "unrelated/photo.png",
      "notes/deep/note.MD",
      ".eidos/private.md",
      ".graft/private.md",
    ])
      await fs.writeFile(path.join(root, file), "fixture")
    const filtered = await filterSpaceFiles(root, [".md"], null)
    expect(
      flattenSpaceTree(filtered).map((entry) => entry.relativePath)
    ).toEqual(["notes", "notes/deep", "notes/deep/note.MD"])
    expect(filtered[0]!.childrenLoaded).toBe(true)
    const scoped = await filterSpaceFiles(root, [".md"], "notes")
    const byNameAndPath = await filterSpaceFiles(
      root,
      {
        type: "group",
        id: "root",
        conjunction: "and",
        children: [
          {
            type: "rule",
            id: "name",
            field: "name",
            operator: "contains",
            value: "NOTE",
          },
          {
            type: "rule",
            id: "path",
            field: "path",
            operator: "starts-with",
            value: "notes/deep/",
          },
        ],
      },
      "notes"
    )
    expect(
      flattenSpaceTree(byNameAndPath).map((entry) => entry.relativePath)
    ).toEqual(["notes/deep", "notes/deep/note.MD"])
    expect(flattenSpaceTree(scoped).map((entry) => entry.relativePath)).toEqual(
      ["notes/deep", "notes/deep/note.MD"]
    )
    expect(await filterSpaceFiles(root, [".eidos"], null)).toEqual([])
    expect(
      flattenSpaceTree(await filterSpaceFiles(root, [".md", ".png"], null)).map(
        (entry) => entry.relativePath
      )
    ).toEqual([
      "notes",
      "notes/deep",
      "notes/deep/note.MD",
      "unrelated",
      "unrelated/photo.png",
    ])
    await expect(
      filterSpaceFiles(root, [".md"], "../outside")
    ).rejects.toThrow()
    await fs.symlink(path.join(root, "notes"), path.join(root, "linked"))
    expect(
      flattenSpaceTree(await filterSpaceFiles(root, [".md"], null)).map(
        (entry) => entry.relativePath
      )
    ).not.toContain("linked/deep/note.MD")
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
