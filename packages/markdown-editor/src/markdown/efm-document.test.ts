import { analyzeEfmMarkdown, normalizeEfmSource } from "./efm-document"

describe("EFM document analysis", () => {
  it("normalizes a leading BOM and all accepted line endings", () => {
    expect(normalizeEfmSource("\ufeffone\r\ntwo\rthree\n")).toBe(
      "one\ntwo\nthree\n"
    )
  })

  it("recognizes document frontmatter but not fragment frontmatter", () => {
    const source = `---
title: Portable Markdown
---

# Body
`
    const document = analyzeEfmMarkdown(source)
    const fragment = analyzeEfmMarkdown(source, { inputProfile: "fragment" })

    expect(document.segments[0]).toMatchObject({
      sourceKind: "frontmatter",
    })
    expect(
      fragment.segments.some((segment) => segment.sourceKind === "frontmatter")
    ).toBe(false)
  })

  it("classifies EFM extensions for semantic import", () => {
    const analysis = analyzeEfmMarkdown(`Text with $x + y$ and a note[^n].

[^n]: Footnote body.

![Alt](./asset.png)

[home]: https://eidos.space

$$
x^2
$$

\`\`\`math
y^2
\`\`\`

<div onclick="run()">Raw HTML</div>
`)

    expect(analysis.segments.map((segment) => segment.sourceKind)).toEqual([
      "math",
      "footnote",
      "image",
      "reference",
      "math",
      "math",
      "raw-html",
    ])
    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "efm-resource-unresolved",
      "efm-unsafe-raw-html",
    ])
  })

  it("distinguishes inline math from currency and code", () => {
    const analysis = analyzeEfmMarkdown(`Currency $5 and $10 remains text.

Escaped \\$x$ remains text.

Code \`$x$\` remains code.

Formula $x$ is math.
`)

    expect(analysis.segments.map((segment) => segment.sourceKind)).toEqual([
      undefined,
      undefined,
      undefined,
      "math",
    ])
  })

  it("does not recognize display math inside fenced code", () => {
    const analysis = analyzeEfmMarkdown(`\`\`\`text
$$
not math
\`\`\`
`)

    expect(analysis.segments).toEqual([
      { source: "```text\n$$\nnot math\n```" },
    ])
    expect(analysis.diagnostics).toEqual([])
  })

  it("reports required frontmatter, footnote, math, HTML, and URI diagnostics", () => {
    const analysis = analyzeEfmMarkdown(`---
title: one
title: two
---

Missing[^missing].

<script>alert(1)</script>

[unsafe](javascript:alert)

$$
x + y
`)

    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "efm-frontmatter-duplicate-key",
      "efm-footnote-undefined",
      "efm-unsafe-raw-html",
      "efm-uri-denied",
      "efm-math-unterminated",
    ])
    expect(
      analysis.diagnostics.every((diagnostic) => diagnostic.start.line > 0)
    ).toBe(true)
    expect(
      analysis.diagnostics.every((diagnostic) => diagnostic.start.column > 0)
    ).toBe(true)
  })

  it("reports unresolved relative resources only without a declared base URI", () => {
    const source = "[Guide](./guide.md)"
    expect(
      analyzeEfmMarkdown(source).diagnostics.map(
        (diagnostic) => diagnostic.code
      )
    ).toEqual(["efm-resource-unresolved"])
    expect(
      analyzeEfmMarkdown(source, {
        baseUri: "https://eidos.space/docs/",
      }).diagnostics
    ).toEqual([])
  })

  it("normalizes footnote labels and diagnoses later definitions", () => {
    const analysis = analyzeEfmMarkdown(`Reference[^A B].

[^a   b]: First definition.

[^A B]: Duplicate definition.
`)

    expect(analysis.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "efm-footnote-duplicate",
    ])
    expect(analysis.diagnostics[0].start.line).toBe(5)
  })

  it("treats unmatched opening frontmatter as ordinary Markdown", () => {
    const analysis = analyzeEfmMarkdown(`---
title: no closing delimiter
`)

    expect(
      analysis.segments.some((segment) => segment.sourceKind === "frontmatter")
    ).toBe(false)
    expect(analysis.diagnostics).toEqual([])
  })
})
