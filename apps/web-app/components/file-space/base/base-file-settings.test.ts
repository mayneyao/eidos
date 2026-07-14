import { describe, expect, it } from "vitest"

import { baseAssetDirectory } from "./base-file-settings"

describe("Base file settings", () => {
  it("keeps the default asset folder at the Space root", () => {
    expect(baseAssetDirectory("projects/tasks.base", "space-assets")).toBe(
      "assets"
    )
  })

  it("can keep imported files beside a nested Base", () => {
    expect(
      baseAssetDirectory("projects/tasks.base", "base-folder-assets")
    ).toBe("projects/assets")
    expect(baseAssetDirectory("tasks.base", "base-folder-assets")).toBe(
      "assets"
    )
  })
})
