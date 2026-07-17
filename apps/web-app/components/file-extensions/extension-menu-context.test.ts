import { describe, expect, it } from "vitest"
import type { SpaceFileEntry } from "@eidos.space/file-space"

import { matchesFileExtensionMenuWhen } from "./extension-menu-context"

const markdownFile: SpaceFileEntry = {
  name: "tasks.md",
  path: "notes/tasks.md",
  parentPath: "notes",
  kind: "file",
  size: 10,
  mtimeMs: 1,
}

describe("matchesFileExtensionMenuWhen", () => {
  it("matches the documented resource extension expression", () => {
    expect(
      matchesFileExtensionMenuWhen("resourceExtname == .md", markdownFile)
    ).toBe(true)
    expect(
      matchesFileExtensionMenuWhen("resourceExtname == .eidos", markdownFile)
    ).toBe(false)
  })

  it("supports conjunctions without evaluating arbitrary JavaScript", () => {
    expect(
      matchesFileExtensionMenuWhen(
        "resourceExtname == '.md' && resourceIsDirectory == false",
        markdownFile
      )
    ).toBe(true)
    expect(
      matchesFileExtensionMenuWhen("globalThis.process.exit()", markdownFile)
    ).toBe(false)
  })
})
