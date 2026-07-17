import { describe, expect, it } from "vitest"

import { eidosFileAssetDirectory } from "./eidos-file-settings"

describe("Eidos File settings", () => {
  it("keeps the default asset folder at the Space root", () => {
    expect(
      eidosFileAssetDirectory("projects/tasks.eidos", "space-assets")
    ).toBe("assets")
  })

  it("can keep imported files beside a nested Eidos File", () => {
    expect(
      eidosFileAssetDirectory(
        "projects/tasks.eidos",
        "eidos-file-folder-assets"
      )
    ).toBe("projects/assets")
    expect(
      eidosFileAssetDirectory("tasks.eidos", "eidos-file-folder-assets")
    ).toBe("assets")
  })
})
