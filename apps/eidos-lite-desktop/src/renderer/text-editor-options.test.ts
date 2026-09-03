import { describe, expect, it } from "vitest"

import {
  isMarkdownTextFile,
  shouldDisableTextEditorLineNumbers,
} from "./text-editor-options"

describe("isMarkdownTextFile", () => {
  it.each(["README.md", "notes/guide.markdown", "docs/CHANGELOG.MD"])(
    "recognizes Markdown files: %s",
    (relativePath) => {
      expect(isMarkdownTextFile(relativePath)).toBe(true)
    }
  )

  it.each(["docs/page.mdx", "notes.md.backup", "notes.txt"])(
    "rejects other file types: %s",
    (relativePath) => {
      expect(isMarkdownTextFile(relativePath)).toBe(false)
    }
  )
})

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
