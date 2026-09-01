export const PORTABLE_MARKDOWN_SAMPLE = `# A calm place to think

Eidos keeps documents as **portable Markdown** while Lexical provides the editing surface.

## What this demo proves

- The Markdown string remains canonical
- Formatting shortcuts update the source panel
- External values can be loaded back into Lexical
- [Links stay portable](https://eidos.space)

> The editor is a view over Markdown, not a second document format.

### Release checklist

- [x] Create the independent package
- [x] Use Lexical 0.49.0
- [ ] Verify the host integrations

| Surface | Role | State |
| :--- | :--- | ---: |
| Markdown | Canonical value | Ready |
| Lexical | Editing view | 0.49.0 |

\`inline code\` and fenced code blocks are supported:

\`\`\`ts
const document = {
  canonical: "markdown",
  editor: "lexical",
}
\`\`\`
`

export const GUARDED_MARKDOWN_SAMPLE = `---
title: Source-preservation check
status: draft
---

# Syntax guard

This sample deliberately contains structures that the first WYSIWYG transformer set does not preserve.

![Local diagram](./diagram.png)
`
