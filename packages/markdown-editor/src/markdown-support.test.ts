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

  it("reports syntax that would not survive the current transformers", () => {
    const features = findUnsupportedMarkdownFeatures(`---
title: Demo
---

| Name | Value |
| --- | --- |
| Eidos | Local |

![Preview](./preview.png)
`)

    expect(features.map((feature) => feature.kind)).toEqual([
      "frontmatter",
      "image",
    ])
    expect(features.map((feature) => feature.line)).toEqual([1, 9])
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
