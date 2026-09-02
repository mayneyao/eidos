import {
  frontmatterSourceFromBody,
  validateFrontmatterSource,
} from "./frontmatter-validation"

describe("frontmatter validation", () => {
  it("accepts empty and mapping values", () => {
    expect(validateFrontmatterSource("---\n\n---")).toBeNull()
    expect(
      validateFrontmatterSource("---\ntitle: Eidos\ntags:\n  - markdown\n---")
    ).toBeNull()
    expect(validateFrontmatterSource("---\ntitle: Eidos\n---\n")).toBeNull()
  })

  it("rejects malformed, duplicate, scalar, and nested delimiter values", () => {
    expect(validateFrontmatterSource("---\ntitle: [\n---")).toBeTruthy()
    expect(
      validateFrontmatterSource("---\ntitle: one\ntitle: two\n---")
    ).toContain("duplicate")
    expect(validateFrontmatterSource("---\nscalar\n---")).toContain("mapping")
    expect(
      validateFrontmatterSource("---\ntitle: one\n---\nextra\n---")
    ).toContain("additional")
  })

  it("builds a canonical frontmatter envelope", () => {
    expect(frontmatterSourceFromBody("  title: Eidos  ")).toBe(
      "---\ntitle: Eidos\n---"
    )
  })
})
