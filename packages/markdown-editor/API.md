# Markdown Editor Component API

This document describes the public React API of
`@eidos.space/markdown-editor`. It applies to package version `0.1.0`.

For the interaction contract and supported syntax matrix, see
[SPEC.md](./SPEC.md). Markdown is always the canonical document value; Lexical
state, DOM nodes, selections, menus, and block-local drafts are transient.

## Installation and imports

The component requires React 18 or 19. Import the shared stylesheet once in the
host entry point:

```tsx
import { MarkdownEditor } from "@eidos.space/markdown-editor"
import "@eidos.space/markdown-editor/styles.css"
```

The package is controlled: the host owns the Markdown string and accepts every
change through `onMarkdownChange`.

```tsx
import { useState } from "react"
import { MarkdownEditor } from "@eidos.space/markdown-editor"
import "@eidos.space/markdown-editor/styles.css"

export function NoteEditor({
  id,
  initialMarkdown,
}: {
  id: string
  initialMarkdown: string
}) {
  const [markdown, setMarkdown] = useState(initialMarkdown)

  return (
    <MarkdownEditor
      documentKey={id}
      markdown={markdown}
      onMarkdownChange={setMarkdown}
      ariaLabel="Note content"
    />
  )
}
```

## `MarkdownEditor`

```ts
function MarkdownEditor(props: MarkdownEditorProps): JSX.Element
```

The component creates and owns its Lexical composer. Hosts should not persist
or inspect Lexical editor state. Use `markdown` for persistence and the public
callbacks for host integration.

There is intentionally no imperative editor ref or whole-document source-mode
API. Change document content through the controlled Markdown value; use the
component callbacks for save, navigation, diagnostics, and binary resources.

### Props

| Prop                     | Type                                                        | Required | Default                  | Behavior                                                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------- | -------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `documentKey`            | `string`                                                    | Yes      | —                        | Stable identity for the open document. Changing it creates a fresh editor session, resets selection and history, and imports `markdown` again.                                          |
| `markdown`               | `string`                                                    | Yes      | —                        | Canonical controlled Markdown value. Host updates with a different value are imported into the current session.                                                                         |
| `onMarkdownChange`       | `(markdown: string) => void`                                | Yes      | —                        | Receives canonical Markdown after editor content changes. Selection-only and presentation-only changes do not call it.                                                                  |
| `onSaveRequest`          | `(markdown: string) => void \| Promise<void>`               | No       | —                        | Called with the latest serialized Markdown for the `document.save` shortcut, `Mod+S` by default. The editor does not persist the result itself.                                         |
| `onOpenExternalUrl`      | `(url: string) => void \| Promise<void>`                    | No       | —                        | Receives a resolved, allowed external destination. Editable content requires `Mod+Click`; read-only content uses a normal click. Same-document fragments retain native navigation.      |
| `onPasteImage`           | `MarkdownEditorPasteImageHandler`                           | No       | —                        | Gives clipboard image files to the host for persistence. Successful results are inserted at the saved paste selection. See [Clipboard image integration](#clipboard-image-integration). |
| `resolveImageUrl`        | `MarkdownEditorImageUrlResolver`                            | No       | —                        | Resolves a canonical image destination, such as `opfs:`, to a current browser presentation URL. May be synchronous or asynchronous.                                                     |
| `onError`                | `(error: Error) => void`                                    | No       | `console.error`          | Receives Lexical, persistence, image resolution, save, external navigation, and code tokenizer failures surfaced by the component.                                                      |
| `onEfmDiagnostics`       | `(diagnostics: readonly EfmDiagnostic[]) => void`           | No       | —                        | Receives the complete EFM diagnostic list, including an empty list, after analysis of the current `markdown` prop.                                                                      |
| `onUnsupportedMarkdown`  | `(features: readonly MarkdownUnsupportedFeature[]) => void` | No       | —                        | Receives a non-empty compatibility summary when malformed source needs a source-preserving fallback block. It is not called with an empty list.                                         |
| `labels`                 | `Partial<MarkdownEditorLabels>`                             | No       | English labels           | Overrides accessible names, menu text, composer text, and editor-owned microcopy.                                                                                                       |
| `placeholder`            | `string`                                                    | No       | `"Write with Markdown…"` | Placeholder displayed when the editor has no visible content. It is never serialized.                                                                                                   |
| `ariaLabel`              | `string`                                                    | No       | `"Markdown editor"`      | Accessible label applied to the editable document surface. Hosts should provide a document-specific value.                                                                              |
| `className`              | `string`                                                    | No       | —                        | Appended to the root `.eme-editor` element.                                                                                                                                             |
| `theme`                  | `"light" \| "dark"`                                         | No       | `"light"`                | Selects the package theme through the root `data-theme` attribute.                                                                                                                      |
| `layout`                 | `"document" \| "embedded"`                                  | No       | `"document"`             | `document` provides standalone reading margins; `embedded` fills the content width owned by the host.                                                                                   |
| `inputProfile`           | `"document" \| "fragment"`                                  | No       | `"document"`             | Enables offset-zero YAML frontmatter for a full document. In `fragment`, an initial `---` is ordinary Markdown.                                                                         |
| `baseUri`                | `string`                                                    | No       | —                        | Base URL used to resolve relative links and images. Without it, relative resources remain inactive and generate diagnostics.                                                            |
| `readOnly`               | `boolean`                                                   | No       | `false`                  | Disables mutations and editing controls while preserving text and block selection for copying.                                                                                          |
| `autoFocus`              | `boolean`                                                   | No       | `false`                  | Focuses the editable surface when the editor session mounts.                                                                                                                            |
| `showToolbar`            | `boolean`                                                   | No       | `true`                   | Controls the package-owned floating formatting toolbar and insertion UI, including the gutter `+` and searchable slash catalogs. Native Markdown shortcuts remain registered.           |
| `codeHighlightTokenizer` | `CodeHighlightTokenizer \| false`                           | No       | Built-in tokenizer       | Replaces the fenced-code tokenizer. `false` disables syntax highlighting without changing code content.                                                                                 |
| `shortcuts`              | `MarkdownShortcutOverrides`                                 | No       | Default registry         | Replaces or disables package-owned shortcut bindings by stable shortcut ID.                                                                                                             |

### Controlled document lifecycle

`markdown` and `onMarkdownChange` are the only persistence boundary:

1. The component imports `markdown` when a session opens.
2. A content edit is serialized and sent to `onMarkdownChange`.
3. The host stores that value and passes it back as `markdown`.
4. A genuinely different host value is imported into the open session.

Change `documentKey` whenever the logical document changes, even if two
documents currently contain identical Markdown. The new key resets history,
selection, open overlays, local drafts, and the initial editor configuration.

`inputProfile` and `baseUri` are document-level settings. Keep them stable for
one `documentKey`; when either setting changes semantically, use a new
`documentKey` so every node is re-imported under the new rules.

Do not debounce by withholding the controlled `markdown` prop indefinitely.
Debounce storage or network writes instead, while keeping the React state
passed to the editor current.

## Host callbacks

### Saving

`onSaveRequest` is an intent callback, not an automatic persistence system.
The default `Mod+S` shortcut serializes the current editor state and calls the
callback. Both synchronous and asynchronous implementations are accepted;
rejections are forwarded to `onError`.

```tsx
<MarkdownEditor
  documentKey={note.id}
  markdown={markdown}
  onMarkdownChange={setMarkdown}
  onSaveRequest={(currentMarkdown) => notes.save(note.id, currentMarkdown)}
/>
```

### External navigation

The package validates and resolves destinations before calling
`onOpenExternalUrl`:

- links allow `http:`, `https:`, `mailto:`, and same-document fragments;
- relative links require `baseUri`;
- `javascript:`, `vbscript:`, `data:`, and `file:` remain inactive;
- fragment links are handled by the browser and are not sent to the callback.

The host still owns the final navigation action:

```tsx
<MarkdownEditor
  documentKey={id}
  markdown={markdown}
  onMarkdownChange={setMarkdown}
  onOpenExternalUrl={(url) => {
    window.open(url, "_blank", "noopener,noreferrer")
  }}
/>
```

### Errors

Use `onError` for operational failures. It does not replace EFM diagnostics:

- `onError` reports failures from editor code or host callback promises;
- `onEfmDiagnostics` reports source-level syntax, resource, and safety issues;
- `onUnsupportedMarkdown` is a smaller compatibility summary for malformed
  constructs that require source-preserving local editing.

```tsx
<MarkdownEditor
  documentKey={id}
  markdown={markdown}
  onMarkdownChange={setMarkdown}
  onError={(error) => reportEditorFailure(error)}
  onEfmDiagnostics={(diagnostics) => setDiagnostics(diagnostics)}
/>
```

## Clipboard image integration

The editor owns clipboard detection, paste selection, image-node insertion,
Markdown serialization, and undo. The host owns binary storage and resource
authorization.

### Types

```ts
interface MarkdownEditorPasteImageRequest {
  documentKey: string
  file: File
  index: number
  total: number
  signal: AbortSignal
}

interface MarkdownEditorPastedImage {
  markdownUrl: string
  displayUrl?: string
  alt?: string
  title?: string
}

type MarkdownEditorPasteImageHandler = (
  request: MarkdownEditorPasteImageRequest
) =>
  | MarkdownEditorPastedImage
  | null
  | Promise<MarkdownEditorPastedImage | null>

interface MarkdownEditorResolveImageUrlRequest {
  documentKey: string
  markdownUrl: string
  signal: AbortSignal
}

type MarkdownEditorImageUrlResolver = (
  request: MarkdownEditorResolveImageUrlRequest
) => string | null | Promise<string | null>
```

### Paste sequence

When `onPasteImage` is defined and a clipboard event contains images:

1. The editor captures the current text or block selection and prevents native
   browser image insertion.
2. It calls `onPasteImage` once per image. `index` and `total` describe the
   original clipboard order.
3. The host stores each `File` and returns its stable Markdown resource.
4. The editor restores the captured selection and inserts every successful
   result in clipboard order.
5. The complete paste is one undoable history entry.

Returning `null` intentionally inserts nothing for that file. Rejections and
invalid results call `onError`; no broken image node is inserted. Paste inside
a block-local input or textarea remains ordinary literal input and does not call
the attachment callback.

`signal` is aborted if the editor unmounts before persistence completes. Hosts
should stop work when practical and must not update UI state after abort.

### Canonical URL versus display URL

`markdownUrl` is the durable value written into Markdown:

```text
![Diagram](<opfs://notes/images/5cf0f59d.png>)
```

`displayUrl` is optional and exists only for the current page. A host may return
a newly created `blob:` URL for immediate display. It is never serialized.

Use `resolveImageUrl` to reopen host-owned resources after import or remount.
It receives the canonical `markdownUrl` and returns the current presentation
URL. Returning `null` leaves the accessible alt-text fallback visible.

Canonical `data:`, `file:`, `javascript:`, and `vbscript:` destinations are
rejected before insertion and are never delegated to the resolver. A host
resolver may return only `blob:`, `http:`, or `https:` presentation URLs.

```tsx
<MarkdownEditor
  documentKey={documentId}
  markdown={markdown}
  onMarkdownChange={setMarkdown}
  onPasteImage={async ({ file, signal }) => {
    const markdownUrl = await attachments.write(file, { signal })
    return {
      markdownUrl,
      alt: file.name,
    }
  }}
  resolveImageUrl={({ markdownUrl, signal }) =>
    attachments.resolveToObjectUrl(markdownUrl, { signal })
  }
/>
```

The playground contains a complete OPFS adapter with object-URL caching and
cleanup in
[`apps/markdown-editor-playground/src/opfs-image-store.ts`](../../apps/markdown-editor-playground/src/opfs-image-store.ts).

## Diagnostics

```ts
interface EfmSourcePosition {
  line: number
  column: number
}

interface EfmDiagnostic {
  code: string
  severity: "info" | "warning" | "error"
  message: string
  start: EfmSourcePosition
  end?: EfmSourcePosition
}
```

Positions are one-based source positions in normalized LF Markdown. Diagnostics
do not authorize destructive normalization: the editor keeps affected source
available in a semantic or source-preserving local block.

`MarkdownUnsupportedFeature` is a compatibility summary:

```ts
type MarkdownUnsupportedFeatureKind =
  | "frontmatter"
  | "image"
  | "html"
  | "footnote"
  | "definition"
  | "math"
  | "directive"

interface MarkdownUnsupportedFeature {
  kind: MarkdownUnsupportedFeatureKind
  label: string
  line: number
}
```

## Input profiles and resource resolution

### `document`

The default profile recognizes one YAML 1.2 mapping between offset-zero `---`
delimiters. Frontmatter is presented as a document metadata block and remains
pinned at the beginning of the canonical source.

### `fragment`

Use this for a Markdown field embedded in another record. Offset-zero `---` is
parsed as ordinary Markdown, and frontmatter insertion is unavailable.

### `baseUri`

`baseUri` uses normal URL resolution for relative links and images. Images are
activated only when the resolved URL uses `http:` or `https:`. Host-owned
schemes such as `opfs:` remain canonical but need `resolveImageUrl` for visual
presentation.

## Localization

`labels` accepts any subset of the following interface. Missing values use the
English defaults:

```ts
interface MarkdownEditorLabels {
  paragraph: string
  heading1: string
  heading2: string
  heading3: string
  quote: string
  codeBlock: string
  bulletList: string
  numberedList: string
  checkList: string
  bold: string
  italic: string
  strikethrough: string
  highlight: string
  inlineCode: string
  undo: string
  redo: string
  editBlock: string
  saveBlock: string
  cancelBlockEdit: string
  insertBlock: string
  insertInline: string
  addBlockBelow: string
  dragBlock: string
  insert: string
  basicBlocks: string
  extendedBlocks: string
  mathBlock: string
  inlineMath: string
  frontmatter: string
  image: string
  footnote: string
  rawHtml: string
  table: string
  divider: string
  frontmatterAlreadyExists: string
  backToInsertMenu: string
  imageUrl: string
  imageAlt: string
  emptyMathBlock: string
  emptyImageBlock: string
  frontmatterYaml: string
  footnoteText: string
  htmlSource: string
  formulaSource: string
  filterBlocks: string
  filterInline: string
  noMatchingBlocks: string
  noMatchingInlineCommands: string
  insertMenuHint: string
  inlineMenuHint: string
}
```

Label overrides update visible text and accessible names. Keyboard shortcut
labels come from the resolved shortcut registry rather than this interface.

## Keyboard shortcut API

`shortcuts` is an object keyed by stable shortcut IDs. Set an ID to `false` to
disable it, or supply one or more replacement bindings:

```tsx
<MarkdownEditor
  documentKey={id}
  markdown={markdown}
  onMarkdownChange={setMarkdown}
  shortcuts={{
    "document.save": false,
    "list-item.move-down": [{ alt: true, shift: true, key: "ArrowDown" }],
  }}
/>
```

```ts
interface MarkdownShortcutBinding {
  key: string
  alt?: boolean
  primary?: boolean
  shift?: boolean
}

type MarkdownShortcutOverrides = Partial<
  Record<MarkdownShortcutId, readonly MarkdownShortcutBinding[] | false>
>
```

`primary` means Command on macOS and Control on other platforms. Matching uses
exact modifiers and ignores composing IME keyboard events.

| Shortcut ID            | Default binding        | Scope        |
| ---------------------- | ---------------------- | ------------ |
| `document.save`        | `Mod+S`                | document     |
| `history.undo`         | `Mod+Z`                | editor       |
| `history.redo`         | `Mod+Shift+Z`, `Mod+Y` | editor       |
| `format.bold`          | `Mod+B`                | selection    |
| `format.italic`        | `Mod+I`                | selection    |
| `insert.open-menu`     | `/`                    | editor       |
| `selection.clear`      | `Escape`               | selection    |
| `overlay.dismiss`      | `Escape`               | overlay      |
| `menu.previous`        | `ArrowUp`              | menu         |
| `menu.next`            | `ArrowDown`            | menu         |
| `menu.choose`          | `Enter`                | menu         |
| `block.move-up`        | `Alt+ArrowUp`          | block handle |
| `block.move-down`      | `Alt+ArrowDown`        | block handle |
| `list-item.move-up`    | `Alt+ArrowUp`          | list item    |
| `list-item.move-down`  | `Alt+ArrowDown`        | list item    |
| `block-editor.commit`  | `Mod+Enter`            | composer     |
| `composer.confirm`     | `Enter`                | composer     |
| `inline-atom.activate` | `Enter`, `Space`       | editor       |

The package also exports registry helpers for hosts that render their own hints
or compose overrides:

```ts
resolveMarkdownShortcuts(overrides?): ResolvedMarkdownShortcuts
matchesMarkdownShortcut(event, id, shortcuts?): boolean
markdownShortcutLabel(id, platform, shortcuts?): string | undefined
markdownShortcutAriaKeys(ids, shortcuts?): string | undefined
markdownShortcutConflicts(shortcuts?): [MarkdownShortcutId, MarkdownShortcutId][]
```

Use `markdownShortcutConflicts` before mounting host-provided overrides when the
host needs to reject same-scope collisions.

## Code highlighting API

The built-in highlighter uses the CSS Custom Highlight API and never inserts
token spans into Lexical content. Unsupported browsers retain an ordinary,
fully editable code block.

```ts
type CodeHighlightKind =
  | "comment"
  | "keyword"
  | "operator"
  | "string"
  | "number"
  | "function"
  | "type"
  | "variable"
  | "property"
  | "tag"
  | "selector"
  | "inserted"
  | "deleted"

interface CodeHighlightToken {
  start: number
  end: number
  kind: CodeHighlightKind
}

type CodeHighlightTokenizer = (
  code: string,
  language: string
) => readonly CodeHighlightToken[] | Promise<readonly CodeHighlightToken[]>
```

Offsets are zero-based JavaScript string offsets and `end` is exclusive.
Invalid, empty, negative, or out-of-range tokens are ignored. Async tokenizer
results are discarded if the corresponding code block changed before they
completed. Rejections are sent to `onError`.

Pass a tokenizer to the component, or use `false` to keep plain code:

```tsx
<MarkdownEditor
  documentKey={id}
  markdown={markdown}
  onMarkdownChange={setMarkdown}
  codeHighlightTokenizer={tokenizeWithHostGrammar}
/>
```

`CodeHighlightPlugin`, `CODE_HIGHLIGHT_KINDS`, and
`tokenizeCodeLightweight` are exported for advanced consumers with their own
Lexical composer. `MarkdownEditor` already mounts this plugin automatically.

## Presentation and accessibility

- Import the package stylesheet once; hosts may override semantic CSS custom
  properties without forking editor structure.
- `layout="document"` owns readable page width and margins.
- `layout="embedded"` uses the width supplied by the parent surface.
- `readOnly` removes mutation controls but does not disable selection or copy.
- `ariaLabel` names the content-editable document; editor-owned buttons, menus,
  composers, and shortcuts derive accessible text from `labels` and the
  shortcut registry.
- Syntax highlighting, image display URLs, selection overlays, and formula
  rendering are presentation state and never modify canonical Markdown.

## Supporting public exports

Most hosts only need `MarkdownEditor` and its prop types. The package also
exports lower-level APIs for conformance tests and advanced Lexical hosts.

### Markdown analysis and conversion

```ts
interface EfmAnalysisOptions {
  inputProfile?: "document" | "fragment"
  baseUri?: string
}

interface EfmImportSegment {
  source: string
  sourceKind?: EfmSourceBlockKind
}

interface EfmDocumentAnalysis {
  diagnostics: EfmDiagnostic[]
  normalizedSource: string
  segments: EfmImportSegment[]
}

normalizeEfmSource(source: string): string
analyzeEfmMarkdown(markdown: string, options?: EfmAnalysisOptions): EfmDocumentAnalysis
findUnsupportedMarkdownFeatures(markdown: string, options?: EfmAnalysisOptions): MarkdownUnsupportedFeature[]
markdownIsWysiwygSafe(markdown: string, options?: EfmAnalysisOptions): boolean
```

The Lexical `$` conversion helpers must run inside a compatible Lexical read or
update context whose editor registers the package nodes:

```ts
$convertFromEfmMarkdownString(markdown, transformers?, options?, node?): EfmDocumentAnalysis
$convertToEfmMarkdownString(transformers?, node?): string
```

`EIDOS_MARKDOWN_TRANSFORMERS` is the package transformer set used by the
component.

### Public nodes

Advanced consumers may register or create the package's semantic and fallback
nodes:

```ts
EfmInlineNode
EfmBlockNode
EfmSourceBlockNode

$createEfmInlineNode(data)
$createEfmBlockNode(data)
$createEfmSourceBlockNode(source, sourceKind)

$isEfmInlineNode(node)
$isEfmBlockNode(node)
$isEfmSourceBlockNode(node)
```

Their payload types—`EfmInlineData`, `EfmBlockData`, `EfmInlineKind`,
`EfmBlockKind`, and `EfmSourceBlockKind`—are also exported. These APIs expose
Lexical integration details; they do not create another persistence format.
Serialize the containing editor back to Markdown.

## Complete component type

```ts
interface MarkdownEditorProps {
  documentKey: string
  markdown: string
  onMarkdownChange(markdown: string): void
  onSaveRequest?(markdown: string): void | Promise<void>
  onOpenExternalUrl?(url: string): void | Promise<void>
  onPasteImage?: MarkdownEditorPasteImageHandler
  resolveImageUrl?: MarkdownEditorImageUrlResolver
  onError?(error: Error): void
  onEfmDiagnostics?(diagnostics: readonly EfmDiagnostic[]): void
  onUnsupportedMarkdown?(features: readonly MarkdownUnsupportedFeature[]): void
  labels?: Partial<MarkdownEditorLabels>
  placeholder?: string
  ariaLabel?: string
  className?: string
  theme?: "light" | "dark"
  layout?: "document" | "embedded"
  inputProfile?: "document" | "fragment"
  baseUri?: string
  readOnly?: boolean
  autoFocus?: boolean
  showToolbar?: boolean
  codeHighlightTokenizer?: CodeHighlightTokenizer | false
  shortcuts?: MarkdownShortcutOverrides
}
```
