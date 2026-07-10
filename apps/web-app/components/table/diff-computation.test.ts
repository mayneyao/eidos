import { computeFileDiff } from "./diff-computation"

describe("computeFileDiff", () => {
  it("returns structured-cloneable diff metadata for a worker response", () => {
    const diff = computeFileDiff({
      oldContent: "before\n",
      newContent: "after\n",
      filename: "note.md",
    })

    expect(diff.name).toBe("note.md")
    expect(diff.additionLines).toEqual(["after\n"])
    expect(diff.deletionLines).toEqual(["before\n"])
    expect(() => structuredClone(diff)).not.toThrow()
  })
})
