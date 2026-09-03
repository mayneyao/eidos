import { preserveMarkdownSourceEdits } from "./source-fidelity"

describe("preserveMarkdownSourceEdits", () => {
  it("keeps unrelated block whitespace while applying a local edit", () => {
    const source = `# Title

Paragraph one.


- item

[ref]: https://eidos.space
`
    const canonicalBefore = `# Title

Paragraph one.

- item

[ref]: https://eidos.space`
    const canonicalAfter = canonicalBefore.replace("# Title", "# Changed")

    expect(
      preserveMarkdownSourceEdits(source, canonicalBefore, canonicalAfter)
    ).toBe(source.replace("# Title", "# Changed"))
  })

  it("normalizes only an edited setext heading", () => {
    const source = `Title
=====

Paragraph with preserved spacing.


<!-- keep -->
`
    const canonicalBefore = `# Title

Paragraph with preserved spacing.

<!-- keep -->`
    const canonicalAfter = canonicalBefore.replace("# Title", "# Changed")

    expect(preserveMarkdownSourceEdits(source, canonicalBefore, canonicalAfter))
      .toBe(`# Changed

Paragraph with preserved spacing.


<!-- keep -->
`)
  })

  it("returns canonical output when there is no source divergence", () => {
    expect(preserveMarkdownSourceEdits("Before", "Before", "After")).toBe(
      "After"
    )
  })

  it("updates the matching occurrence when blocks have identical text", () => {
    const canonicalBefore = "Same.\n\nSame.\n\nSame."
    const canonicalAfter = "Same.\n\nChanged.\n\nSame."
    const source = "Same.\n\n\nSame.\n\nSame.\n"

    expect(
      preserveMarkdownSourceEdits(source, canonicalBefore, canonicalAfter)
    ).toBe("Same.\n\n\nChanged.\n\nSame.\n")
  })

  it("inserts a block without collapsing nearby source whitespace", () => {
    const canonicalBefore = "# Title\n\nBody."
    const canonicalAfter = "# Title\n\nInserted.\n\nBody."
    const source = "# Title\n\n\nBody.\n"

    expect(
      preserveMarkdownSourceEdits(source, canonicalBefore, canonicalAfter)
    ).toBe("# Title\n\n\nInserted.\n\nBody.\n")
  })

  it("inserts a blank line before a hard-wrapped paragraph without reflowing it", () => {
    const source = `# Title

This paragraph is manually
wrapped across source lines.

Tail.
`
    const canonicalBefore = `# Title

This paragraph is manually wrapped across source lines.

Tail.`
    const canonicalAfter = `# Title


This paragraph is manually wrapped across source lines.

Tail.`

    expect(preserveMarkdownSourceEdits(source, canonicalBefore, canonicalAfter))
      .toBe(`# Title


This paragraph is manually
wrapped across source lines.

Tail.
`)
  })
})
