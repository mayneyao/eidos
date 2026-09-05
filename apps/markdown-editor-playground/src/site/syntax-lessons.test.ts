import { describe, expect, it } from "vitest"
import { syntaxExamples } from "./syntax-catalog"
import { syntaxLessons } from "./syntax-lessons"

describe("syntax teaching content", () => {
  it("has English and Chinese explanations for every live fixture", () => {
    expect(Object.keys(syntaxLessons).sort()).toEqual(
      syntaxExamples.map((entry) => entry.id).sort()
    )
    for (const lesson of Object.values(syntaxLessons)) {
      expect(lesson.en.length).toBeGreaterThan(40)
      expect(lesson.zh).toMatch(/[\u4e00-\u9fff]/u)
    }
  })
})
