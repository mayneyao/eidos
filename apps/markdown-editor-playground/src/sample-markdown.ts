export const PLAYGROUND_MARKDOWN = `---
title: A calm place to think
profile: EFM-1.0
---

# A calm place to think

This editor keeps documents as **portable Markdown** while Lexical provides the editing surface. This playground covers _emphasis_, ~~strikethrough~~, ==highlight==, \`inline code\`, and [portable links](https://eidos.space).

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

## EFM extensions

Euler's identity is $e^{i\\pi} + 1 = 0$.[^euler]

$$
\\int_0^1 x^2\\,dx = \\frac{1}{3}
$$

![Eidos File icon](https://editor.eidos.space/eidos-file-icon-192.png "Eidos File")

[^euler]: Mathematics, footnotes, images, and frontmatter render visually while Markdown remains portable.

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

Click into a block and use the + control, or type / on an empty line, to insert equations, images, footnotes, document properties, and standard Markdown blocks without leaving the editor.
`
