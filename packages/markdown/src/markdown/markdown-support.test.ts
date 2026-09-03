import {
  findUnsupportedMarkdownFeatures,
  markdownIsWysiwygSafe,
} from "./markdown-support"

describe("Markdown WYSIWYG support", () => {
  it("accepts the supported portable Markdown subset", () => {
    expect(
      markdownIsWysiwygSafe(`# A document

Paragraph with **bold**, _italic_, ~~strike~~, and [a link](https://eidos.space).

- [x] Ship it
- [ ] Verify it

\`\`\`ts
const ready = true
\`\`\`
`)
    ).toBe(true)
  })

  it("accepts valid EFM syntax through source-preserving nodes", () => {
    const features = findUnsupportedMarkdownFeatures(`---
title: Demo
---

| Name | Value |
| --- | --- |
| Eidos | Local |

![Preview](./preview.png)
`)

    expect(features).toEqual([])
  })

  it("reports malformed EFM for block-local source fallback", () => {
    const features = findUnsupportedMarkdownFeatures(`---
title: First
title: Duplicate
---

$$
x + y
`)

    expect(features.map((feature) => feature.kind)).toEqual([
      "frontmatter",
      "math",
    ])
    expect(features.map((feature) => feature.line)).toEqual([3, 6])
  })

  it("accepts GFM tables", () => {
    expect(
      markdownIsWysiwygSafe(`| Name | Value |
| :--- | ---: |
| Eidos | **Local** |
`)
    ).toBe(true)
  })
})
