import { createFileTreeIconResolver } from "@pierre/trees"
import { describe, expect, it } from "vitest"

import {
  EIDOS_FILE_TREE_ICONS,
  EIDOS_FILE_TREE_SPRITE_SHEET,
} from "./file-tree-icons"

describe("Eidos File tree icon", () => {
  const { resolveIcon } = createFileTreeIconResolver(EIDOS_FILE_TREE_ICONS)

  it("uses the Eidos glyph for .eidos files at any path or extension case", () => {
    expect(
      resolveIcon("file-tree-icon-file", "projects/Roadmap.eidos")
    ).toMatchObject({
      name: "file-tree-icon-eidos",
      width: 15,
      height: 15,
      viewBox: "0 0 512 512",
    })
    expect(resolveIcon("file-tree-icon-file", "Archive.EIDOS")).toMatchObject({
      name: "file-tree-icon-eidos",
    })
    expect(EIDOS_FILE_TREE_SPRITE_SHEET).toContain('id="file-tree-icon-eidos"')
    expect(EIDOS_FILE_TREE_SPRITE_SHEET).toContain('fill="currentColor"')
    expect(EIDOS_FILE_TREE_SPRITE_SHEET).not.toContain("--lite-accent")
  })

  it("leaves ordinary SQLite and text files on the standard icon set", () => {
    expect(resolveIcon("file-tree-icon-file", "archive.sqlite").name).not.toBe(
      "file-tree-icon-eidos"
    )
    expect(resolveIcon("file-tree-icon-file", "README.md").name).not.toBe(
      "file-tree-icon-eidos"
    )
  })
})
