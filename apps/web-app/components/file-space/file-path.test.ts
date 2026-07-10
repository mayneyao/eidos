// @vitest-environment node

import {
  ancestorSpacePaths,
  canMoveSpaceEntryTo,
  filePathFromSpaceUrl,
  headingFromSpaceLink,
  headingFromSpaceUrl,
  isSameOrDescendant,
  moveSpaceFileUrl,
  resolveSpaceLink,
  toSpaceAssetUrl,
  toSpaceFileUrl,
  uniqueSpaceEntryName,
  validateSpaceEntryName,
} from "./file-path"

describe("file Space paths", () => {
  it("round-trips file paths through tab URLs", () => {
    const path = "项目/first note.md"
    expect(filePathFromSpaceUrl(toSpaceFileUrl(path))).toBe(path)
    const headingUrl = toSpaceFileUrl(path, "下一步 & Review")
    expect(filePathFromSpaceUrl(headingUrl)).toBe(path)
    expect(headingFromSpaceUrl(headingUrl)).toBe("下一步 & Review")
    expect(headingFromSpaceUrl(toSpaceFileUrl(path))).toBeNull()
  })

  it("encodes Space asset paths without losing directory boundaries", () => {
    expect(toSpaceAssetUrl("Media/hello world#1.png")).toBe(
      "/~/Media/hello%20world%231.png"
    )
    expect(toSpaceAssetUrl("Media/hello world#1.png", 3)).toBe(
      "/~/Media/hello%20world%231.png?v=3"
    )
  })

  it("resolves relative Markdown links without escaping the Space", () => {
    expect(resolveSpaceLink("notes/daily/today.md", "../ideas.md#next")).toBe(
      "notes/ideas.md"
    )
    expect(resolveSpaceLink("root.md", "../outside.md")).toBeNull()
    expect(resolveSpaceLink("root.md", "https://example.com/a.md")).toBeNull()
    expect(resolveSpaceLink("root.md", "#section")).toBe("root.md")
    expect(headingFromSpaceLink("../ideas.md#下一步%20计划")).toBe(
      "下一步 计划"
    )
    expect(headingFromSpaceLink("../ideas.md")).toBeUndefined()
  })

  it("matches files and directory descendants", () => {
    expect(isSameOrDescendant("notes/a.md", "notes")).toBe(true)
    expect(isSameOrDescendant("notes-archive/a.md", "notes")).toBe(false)
    expect(isSameOrDescendant("notes/a.md", "")).toBe(true)
  })

  it("lists ancestor directories from shallowest to deepest", () => {
    expect(ancestorSpacePaths("notes/daily/2026/today.md")).toEqual([
      "notes",
      "notes/daily",
      "notes/daily/2026",
    ])
    expect(ancestorSpacePaths("root.md")).toEqual([])
  })

  it("moves file URLs while preserving Markdown heading targets", () => {
    expect(
      moveSpaceFileUrl(
        toSpaceFileUrl("notes/project.md", "Next step"),
        "notes",
        "archive"
      )
    ).toBe(toSpaceFileUrl("archive/project.md", "Next step"))
    expect(moveSpaceFileUrl("/settings", "notes", "archive")).toBeNull()
  })

  it("allows moves across folders but not no-ops or recursive moves", () => {
    expect(canMoveSpaceEntryTo("note.md", "", false, "archive")).toBe(true)
    expect(canMoveSpaceEntryTo("note.md", "", false, "")).toBe(false)
    expect(canMoveSpaceEntryTo("notes", "", true, "notes/archive")).toBe(false)
    expect(canMoveSpaceEntryTo("notes", "", true, "projects")).toBe(true)
  })

  it("rejects invalid entry names", () => {
    expect(validateSpaceEntryName("note.md")).toBeNull()
    expect(validateSpaceEntryName("../note.md")).not.toBeNull()
    expect(validateSpaceEntryName("folder/note.md")).not.toBeNull()
    expect(validateSpaceEntryName("question?.md")).not.toBeNull()
    expect(validateSpaceEntryName("note.md.")).not.toBeNull()
    expect(validateSpaceEntryName("CON.txt")).not.toBeNull()
  })

  it("creates case-insensitively unique entry names", () => {
    expect(
      uniqueSpaceEntryName(["Untitled.md", "untitled 2.MD"], "Untitled", ".md")
    ).toBe("Untitled 3.md")
    expect(uniqueSpaceEntryName(["Projects"], "New folder")).toBe("New folder")
  })
})
