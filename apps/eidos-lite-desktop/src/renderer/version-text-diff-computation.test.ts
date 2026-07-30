import { computeVersionTextDiff } from "./version-text-diff-computation"

describe("version text diff computation", () => {
  it("computes a bounded file diff outside the React render path", () => {
    const diff = computeVersionTextDiff({
      before: "# Notes\n\nOld sentence.\n",
      after: "# Notes\n\nNew sentence.\n",
      path: "notes/readme.md",
    })

    expect(diff.name).toBe("notes/readme.md")
    expect(diff.hunks).toHaveLength(1)
    expect(diff.deletionLines.join("")).toContain("Old sentence.")
    expect(diff.additionLines.join("")).toContain("New sentence.")
    expect(diff.isPartial).toBe(false)
  })
})
