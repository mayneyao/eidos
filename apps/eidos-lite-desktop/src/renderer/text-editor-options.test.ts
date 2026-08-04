import { describe, expect, it } from "vitest"

import { shouldDisableTextEditorLineNumbers } from "./text-editor-options"

describe("shouldDisableTextEditorLineNumbers", () => {
  it.each(["README.md", "notes/guide.markdown", "docs/CHANGELOG.MD"])(
    "hides line numbers for Markdown files: %s",
    (relativePath) => {
      expect(shouldDisableTextEditorLineNumbers(relativePath)).toBe(true)
    }
  )

  it.each(["src/app.ts", "scripts/build.js", "docs/page.mdx", "notes.txt"])(
    "keeps line numbers for other text files: %s",
    (relativePath) => {
      expect(shouldDisableTextEditorLineNumbers(relativePath)).toBe(false)
    }
  )
})
