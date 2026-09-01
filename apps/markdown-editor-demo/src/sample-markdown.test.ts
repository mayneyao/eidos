import { findUnsupportedMarkdownFeatures } from "@eidos.space/markdown-editor"

import {
  GUARDED_MARKDOWN_SAMPLE,
  PORTABLE_MARKDOWN_SAMPLE,
} from "./sample-markdown"

describe("Markdown editor demo fixtures", () => {
  it("keeps the portable fixture inside the WYSIWYG contract", () => {
    expect(findUnsupportedMarkdownFeatures(PORTABLE_MARKDOWN_SAMPLE)).toEqual(
      []
    )
  })

  it("demonstrates the source fallback guard", () => {
    expect(
      findUnsupportedMarkdownFeatures(GUARDED_MARKDOWN_SAMPLE).map(
        (feature) => feature.kind
      )
    ).toEqual(["frontmatter", "image"])
  })
})
