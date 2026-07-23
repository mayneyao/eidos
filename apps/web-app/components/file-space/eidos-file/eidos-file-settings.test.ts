import { describe, expect, it } from "vitest"

import { eidosFileAssetDirectory } from "./eidos-file-settings"

describe("Eidos File settings", () => {
  it("scopes every asset policy to the directory containing the Eidos File", () => {
    expect(
      eidosFileAssetDirectory("projects/tasks.eidos", "space-assets")
    ).toBe("projects/assets")
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
