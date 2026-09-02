import { findUnsupportedMarkdownFeatures } from "@eidos.space/markdown-editor"

import { PLAYGROUND_MARKDOWN } from "./sample-markdown"

describe("Markdown editor playground fixture", () => {
  it("stays inside the WYSIWYG contract", () => {
    expect(findUnsupportedMarkdownFeatures(PLAYGROUND_MARKDOWN)).toEqual([])
  })
})
