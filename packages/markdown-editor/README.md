# `@eidos.space/markdown-editor`

A standalone, Lexical-based Markdown document editor for file-based Eidos
Spaces. It deliberately has no dependency on Monaco, the Eidos database, AI
features, or application routes.

## Usage

```tsx
import {
  MarkdownEditor,
  MarkdownViewer,
} from "@eidos.space/markdown-editor"
import "@eidos.space/markdown-editor/styles.css"

<MarkdownEditor
  value={markdown}
  onChange={(nextMarkdown, change) => {
    save(nextMarkdown)
    console.log(change.sourcePreserved)
  }}
  ariaLabel="Project notes"
/>

<MarkdownViewer markdown={markdown} ariaLabel="Project notes preview" />
```

The editor is built on Lexical 0.47 and its mdast pipeline. It supports
CommonMark, GFM tables and task lists, YAML frontmatter, local images, and
Space-style `[[wiki links]]` / `![[image embeds]]`. Its editing surface includes
Markdown-aware Enter/Backspace and list indentation, Markdown and image
paste/drop, automatic URL and email links, a floating text/link toolbar, and
gutter, keyboard, and marquee block selection, including individual list items.
A host can resolve Space assets and links without coupling the package to Eidos
routes:

```tsx
<MarkdownEditor
  value={markdown}
  onChange={setMarkdown}
  rendering={{
    resolveImageSrc: (path) => spaceAssetUrl(path),
    resolveWikiLink: (target) => spaceFileUrl(target),
    onLinkActivate: (link, event) => {
      event.preventDefault()
      openInApp(link)
    },
  }}
/>
```

## Source fidelity

Lexical stores document semantics, not the spelling of Markdown tokens. The
package therefore keeps an internal source snapshot and provides two explicit
guarantees:

1. Opening and saving an unchanged document returns the exact original source,
   including line endings, frontmatter, whitespace, and equivalent Markdown
   spellings.
2. After a semantic edit, `onChange` and `getMarkdown()` return stable,
   canonical Markdown and report `sourcePreserved: false`.

This prevents silent source normalization on open/save while being honest
about the limit of rich-text editing: arbitrary source spelling cannot remain
byte-identical after semantic edits.

Syntax that cannot yet round-trip without loss—currently raw HTML/MDX,
footnotes, math, Obsidian comments, highlights, callouts, and block IDs—is
shown in a source-preserving read-only fallback by default. The host can
replace that view with `renderUnsupportedMarkdown`; visual editing can only be
forced with the explicit `allowUnsupportedMarkdownEditing` opt-in.

For diagnostics outside React, use `inspectMarkdownCompatibility(markdown)` or
`markdownToSourceSnapshot(markdown)`. These APIs return plain data and do not
expose Lexical editor state.

## Imperative API

Attach a `MarkdownEditorHandle` ref when a host needs save/focus commands:

```tsx
editorRef.current?.focus()
const result = editorRef.current?.getMarkdown()
editorRef.current?.setMarkdown(nextSource)
```

The package intentionally does not export its Lexical nodes or editor instance.
That keeps the Markdown dialect and Lexical version private and lets Eidos run
it alongside older editors during migration.

## Theming

The default stylesheet is quiet and content-first. Override the following
variables on `.eidos-markdown-editor` to integrate it with another theme:

```css
.eidos-markdown-editor {
  --eidos-md-font: ui-sans-serif, sans-serif;
  --eidos-md-mono: ui-monospace, monospace;
  --eidos-md-foreground: var(--foreground);
  --eidos-md-muted: var(--muted-foreground);
  --eidos-md-border: var(--border);
  --eidos-md-surface: var(--card);
  --eidos-md-selection: var(--accent);
  --eidos-md-link: var(--primary);
  --eidos-md-focus: var(--ring);
}
```
