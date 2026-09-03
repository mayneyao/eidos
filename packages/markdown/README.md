# @eidos.space/markdown

The shared Lexical-based WYSIWYG Markdown editor used by Eidos hosts.

The package's target interaction and fidelity contract is defined in
[SPEC.md](./SPEC.md). The specification is the source of truth for supported
editor operations; this README summarizes the current package surface.
The complete host integration surface is documented in
[API.md](./API.md).

Markdown remains the canonical persisted representation. This package owns the
Lexical editor, Markdown import/export, editor UI, and compatibility checks. It
does not own source editing, persistence, file-system access, or Eidos File
mutations.

## Source architecture

The package separates reusable definitions, editor behavior, and syntax
composition:

```text
src/
├── editor/       # MarkdownEditor assembly and Lexical theme
├── highlighting/ # Pure code-tokenization contract and implementation
├── markdown/     # EFM analysis, import/export, URI policy, and transformers
├── nodes/        # Lexical node definitions and the node registry
├── plugin-system/# Public plugin contract, compiler, and built-in profile
├── plugins/      # Reusable editor-wide Lexical behavior components
├── shortcuts/    # Stable shortcut registry, matching, labels, and host overrides
├── ui/           # Internal views/context shared by decorator nodes
├── index.ts      # Stable public package exports
├── styles.css    # Shared editor presentation
└── types.ts      # Public host-facing types
```

The directory boundary is intentional:

- `nodes/` owns node payloads, serialization, DOM/decorator presentation, and
  node-local commands. It does not register editor-wide pointer, history,
  insertion, formatting, or synchronization behavior.
- `plugins/` owns those editor-wide behaviors. A plugin may use nodes and the
  Markdown layer, but it does not define canonical syntax or persisted data.
- `plugin-system/` owns immutable syntax descriptors and compiles them into one
  node, transformer, behavior, insertion, shortcut, and capability registry.
  It does not use process-global mutable registration.
- `markdown/` owns the Markdown-to-editor projection and serialization rules.
  It has no host UI or editor-wide event lifecycle.
- `shortcuts/` is the single source of truth for package-owned key bindings.
  Plugins and nodes consume stable shortcut IDs instead of matching raw keys,
  and hosts may override or disable bindings through `shortcuts`.
- `editor/markdown-editor.tsx` is the composition root. It wires the registry,
  built-in Lexical plugins, Eidos plugins, and host callbacks together without
  reimplementing them.
- Tests stay beside the implementation layer they verify. Consumers import
  from the package root or its documented `plugin-api` and `plugins` subpaths;
  source directory paths are internal and may change.

`MarkdownEditor` defaults to `eidosMarkdownPlugins`. Hosts may pass a stable
`plugins` array to build a smaller profile or add syntax. Public contracts are
available from `@eidos.space/markdown/plugin-api`; built-in descriptors are
available from `@eidos.space/markdown/plugins`. Changing the compiled plugin
signature creates a fresh editor session because Lexical's node registry is
immutable after composer creation.

The Markdown contract is Eidos Flavored Markdown 1.0: CommonMark 0.31.2, the
named GFM extensions, YAML frontmatter, footnotes, and the constrained EFM
mathematics profile. Lexical-native constructs remain directly editable.
Frontmatter, inline and display mathematics, images, reference links, and
footnotes are imported as source-preserving semantic nodes with visual
WYSIWYG rendering. Footnotes are numbered by first reference and presented
after the document body. Atomic block nodes expose a block-local editor for
their underlying syntax; saving reparses and refreshes only that node, without
switching or converting the whole document. Malformed frontmatter and
unterminated display mathematics remain editable as inert, source-preserving
blocks while the rest of the document stays WYSIWYG.

Pointer dragging that starts on content remains a native text range and can
continue across block boundaries. A separate block marquee starts throughout
the left/right empty canvas between the editor stage edge and the content
boundary, or in the trailing padding below the last block; space outside the
editor stage does nothing. Available zones use a crosshair cursor and never
appear at the same time as a text range. Both selection modes auto-scroll long
documents near the viewport edges, and marquee selection retains blocks that
have scrolled out of view.
Equation composers float above following content so opening one does not shift
the document.

Collapsed selections expose a quiet, top-aligned gutter group immediately
beside the current block: `+` first, then a six-dot handle for reordering
top-level blocks. Pointer dragging shows the insertion boundary and auto-scrolls
long documents; the focused handle also moves one position with `Alt+ArrowUp` or
`Alt+ArrowDown`.
Each move is one undoable editor transaction, and frontmatter remains pinned to
the document start. Footnote definitions are a pinned document-tail region: they
do not expose `+` or a drag handle, and body blocks cannot be moved after them.
Inside a list item, the same keys reorder that item among its siblings in place;
an owned nested list moves with it, the nesting level does not change, and the
caret remains in the moved item. `Mod+Enter` toggles the checklist item containing
the caret without converting ordinary list items. Choosing a command from `+` always creates a new block below;
it never changes the active block's type. The same searchable block catalog opens
when `/` is typed on an empty paragraph, where the empty trigger paragraph may
become the chosen block. In rich text, `/` at a command boundary opens a compact
inline catalog at the caret. Its built-in commands are Inline equation and
Footnote; both restore the saved caret before inserting, and Footnote maintains
its definition at the document end. Inline image creation is intentionally not
offered. Canceling the inline flow leaves Markdown unchanged. Catalogs are
vertical lists that filter while
typing and support Arrow Up/Down, Enter, and Escape. The block catalog creates
headings, quotes, lists, checklists, code, tables, dividers, block equations,
images, footnotes, safe HTML, and document frontmatter without entering a
whole-document source mode. Equation and image commands immediately create empty semantic blocks
with descriptive placeholders, then open floating block-local composers that
update those same blocks. Canceling leaves the empty placeholder available for
later input instead of injecting sample content. Footnote, HTML, and frontmatter
creation use focused composers; frontmatter is inserted at the document start
and can only be created once, while footnote definitions are maintained at the
end of the document.

The editor defaults to the EFM `document` input profile. Pass
`inputProfile="fragment"` when editing a fragment; an initial `---` is then
ordinary Markdown. It normalizes accepted line endings to LF and never emits a
UTF-8 BOM. EFM diagnostics are available through `analyzeEfmMarkdown` and the
`onEfmDiagnostics` callback. Component diagnostics are deferred and coalesced
so typing does not synchronously run a second whole-document analysis.

Keyboard behavior is defined by stable IDs in the exported
`DEFAULT_MARKDOWN_SHORTCUTS` registry. Matching uses exact modifiers, ignores
IME composition, supplies platform-appropriate labels plus
`aria-keyshortcuts`, and permits the same chord only in disjoint scopes. Pass
`shortcuts={{ "list-item.move-down": false }}` to disable a command, or replace
the value with one or more bindings to customize it. Hosts should use the
exported `markdownShortcutConflicts` helper when composing overrides.

Safe Raw HTML is rendered through an attribute-stripping allowlist. Active or
disallowed HTML is rendered as readable source and never receives execution
authority.
Active links are limited to `http:`, `https:`, `mailto:`, and same-document
fragments. Relative links stay inactive unless the host declares `baseUri`;
images are limited to `http:` and `https:` and use the same base resolution.
`javascript:`, `vbscript:`, `data:`, and `file:` remain inactive. This is the
package's EFM resource policy.

Clipboard image storage is host-owned. Pass `onPasteImage` to persist each
clipboard `File` and return a stable `markdownUrl`; the editor captures the
original selection, waits for the callback, and inserts all successful images
as one undoable paste. Pass `resolveImageUrl` when custom canonical URLs need a
current browser URL after import or remount:

```tsx
<MarkdownEditor
  documentKey={documentId}
  markdown={markdown}
  onMarkdownChange={setMarkdown}
  onPasteImage={async ({ file, signal }) => ({
    markdownUrl: await attachments.write(file, { signal }),
    alt: file.name,
  })}
  resolveImageUrl={({ markdownUrl, signal }) =>
    attachments.resolve(markdownUrl, { signal })
  }
/>
```

Only the stable URL is serialized. A returned `displayUrl` or resolved `blob:`
URL is presentation-only. The package still rejects canonical `data:`, `file:`,
`javascript:`, and `vbscript:` destinations; host-resolved presentation URLs
are limited to `blob:`, `http:`, and `https:`.

Pending image persistence is aborted when the editor becomes read-only or
unmounts. The playground's OPFS adapter also removes old files that are no
longer referenced by the controlled Markdown, while retaining a grace period
for Undo and in-flight state changes.

The editor additionally enables a named presentation extension for
`==highlight==`. It imports the delimited text as Lexical's `highlight` format,
offers Highlight in the selection toolbar, and serializes it back with the same
delimiter. This extension is not part of EFM 1.0. Wikilinks, callouts,
directives, MDX, and the other EFM exclusions remain ordinary Markdown text.

Formatting controls are shown as a contextual toolbar when text is selected;
the editor does not reserve permanent document space for a toolbar.

Fenced code is highlighted with a dependency-free semantic tokenizer and the
CSS Custom Highlight API. Highlighting does not add token elements to Lexical's
DOM or alter the canonical Markdown, and unsupported browsers keep a plain,
fully editable code block. Consumers that need another grammar can pass a
`codeHighlightTokenizer`; pass `false` to disable syntax highlighting.

Use `layout="document"` (the default) for a standalone Markdown file with
reading margins. Use `layout="embedded"` for a Content field whose host already
owns the content width. Both layouts inherit the host's editorial font so the
WYSIWYG canvas keeps the same typography as the corresponding Markdown preview.
