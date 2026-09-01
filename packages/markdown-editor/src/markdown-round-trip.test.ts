import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
} from "@lexical/markdown"
import { createEditor } from "lexical"

import { MARKDOWN_EDITOR_NODES } from "./editor-nodes"
import { EIDOS_MARKDOWN_TRANSFORMERS } from "./markdown-transformers"

function roundTrip(markdown: string): string {
  const editor = createEditor({ nodes: [...MARKDOWN_EDITOR_NODES] })
  editor.update(
    () => {
      $convertFromMarkdownString(markdown, [...EIDOS_MARKDOWN_TRANSFORMERS])
    },
    { discrete: true }
  )
  return editor
    .getEditorState()
    .read(() => $convertToMarkdownString([...EIDOS_MARKDOWN_TRANSFORMERS]))
}

describe("Lexical Markdown round-trip", () => {
  it("reaches a stable canonical representation for supported Markdown", () => {
    const input = `# Portable document

Paragraph with **bold**, _italic_, ~~strike~~, and \`code\`.

- [x] Build the editor
- [ ] Verify the demo

> Markdown remains canonical.

---

\`\`\`ts
const editor = "lexical"
\`\`\`
`
    const first = roundTrip(input)
    const second = roundTrip(first)

    expect(second).toBe(first)
    expect(first).toContain("# Portable document")
    expect(first).toContain("- [x] Build the editor")
    expect(first).toContain('const editor = "lexical"')
  })

  it("preserves GFM tables, alignment, and inline formatting", () => {
    const input = `| Surface | Status | Price |
| :--- | :---: | ---: |
| Eidos | **Ready** | \`$9\` |
| Local | [Open](https://eidos.space) | $0 |
`
    const first = roundTrip(input)
    const second = roundTrip(first)

    expect(second).toBe(first)
    expect(first).toContain("| :--- | :---: | ---: |")
    expect(first).toContain("| Eidos | **Ready** | `$9` |")
    expect(first).toContain("[Open](https://eidos.space)")
  })
})
