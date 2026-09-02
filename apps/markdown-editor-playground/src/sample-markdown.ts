export const PLAYGROUND_MARKDOWN = `# A calm place to think

This editor keeps documents as **portable Markdown** while Lexical provides the editing surface. This playground covers _emphasis_, ~~strikethrough~~, \`inline code\`, and [portable links](https://eidos.space).

## Document structure

> The editor is a view over Markdown, not a second document format.

### Nested notes

- Files remain the source of truth
  - Markdown stays readable outside Eidos
  - Lexical only owns the editing experience
- External updates can be loaded back into the editor

1. Parse the canonical Markdown value
2. Edit the document visually
3. Serialize changes back to Markdown

- [x] Create the independent package
- [x] Add the focused playground
- [ ] Keep expanding compatibility coverage

---

## Compatibility matrix

| Surface | Role | State |
| :--- | :--- | ---: |
| Markdown | Canonical value | Ready |
| Lexical | Editing view | 0.49.0 |
| Playground | Browser verification | Active |

## Code block

\`\`\`ts
type MarkdownDocument = {
  canonical: "markdown",
  editor: "lexical",
}

const document: MarkdownDocument = {
  canonical: "markdown",
  editor: "lexical",
}
\`\`\`

## Final note

Soft line breaks are reflowed into readable paragraphs without changing the canonical document.
`
