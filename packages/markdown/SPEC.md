# Eidos Markdown Editor Behavioral Specification

Status: Working Draft
Version: 0.1
Revised: 2026-09-02

## 1. Purpose

This document is the package-level behavioral contract for
`@eidos.space/markdown`. It defines the editor experience that Eidos
hosts must expose and the observable invariants that the shared implementation
must preserve.

The product goal is:

> A WYSIWYG Markdown editor with Notion-like block interaction, Eidos Flavored
> Markdown as its only canonical representation, and no silent loss or rewrite
> of document meaning.

A user must not need a whole-document source mode to create, select, edit,
move, copy, or delete supported Markdown constructs. Complex syntax may expose
a source field, but only inside the block that owns that syntax and alongside
its rendered result.

This is an implementation contract, not a new Markdown dialect. Source syntax,
parsing precedence, serialization semantics, and secure rendering are owned by
[Eidos Flavored Markdown 1.0](../../docs/specs/eidos-flavored-markdown-1.0.md).
This document defines how the editor operates on that format.

## 2. Normative language and conformance

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY**
are normative when written in capitals.

This specification describes the target behavior of the shared package. Its
presence does not imply that the current implementation already conforms.
Conformance is demonstrated by automated behavioral and round-trip tests, not
by a particular React, Lexical, DOM, or CSS implementation.

An implementation conforms only when it satisfies all MUST requirements for
the syntax it claims to support. A partially implemented item MUST remain
source-preserving and locally operable; it MUST NOT disappear, become
unselectable, or force conversion of the entire document.

## 3. Product principles

### 3.1 Markdown is the only canonical value

- The canonical document value MUST be Markdown text.
- Lexical state, DOM structure, selection, open menus, drafts, and block IDs
  MUST remain transient editor state.
- A host MUST persist Markdown, not serialized Lexical state or a proprietary
  block document.
- Web, Lite, and `eidos serve` SHOULD consume this shared package rather than
  redefining Markdown behavior in host code.

### 3.2 The canvas is WYSIWYG by default

- Supported constructs MUST render as their reading representation during
  ordinary editing.
- Markdown punctuation SHOULD appear only when it is directly useful to the
  active edit, not as the default document presentation.
- The editor MUST NOT depend on a whole-document source/editor toggle for a
  supported operation.
- Hosts MAY offer a separate diagnostic source viewer, but it is not a valid
  substitute for an editor capability required by this specification.

### 3.3 Every construct is operable

Every supported block MUST be creatable, focusable or selectable, editable,
copyable, cuttable, deletable, movable, and undoable. Inline constructs MUST be
selectable, editable, removable, and undoable within their containing flow.

Rendered content that cannot receive a caret, such as a block equation,
image, divider, or frontmatter card, MUST still expose block selection and
keyboard operations.

### 3.4 Fidelity is more important than normalization

- Opening a document and making no content edit MUST preserve its source.
- Editing one source-preserving block MUST NOT reserialize unrelated blocks.
- An intentionally edited block MAY be serialized into a stable EFM spelling,
  but its semantics MUST be preserved.
- Unsupported or malformed syntax MUST be isolated in the smallest practical
  source-preserving block.
- The editor MUST NOT silently drop source because its internal document model
  cannot represent it.

### 3.5 Borrow the interaction model, not the data model

“Notion-like” means a calm block canvas, gutter insertion, slash commands,
predictable block selection, and source editing scoped to selected blocks. It does not
mean adopting a proprietary block database, page schema, or Notion-specific
Markdown extensions.

## 4. Ownership boundary

The package owns:

- EFM import into an editable projection;
- Markdown serialization after editor operations;
- native and semantic editor nodes;
- text, range, and block selection behavior;
- block creation, selected-block source editing, movement, and deletion;
- editor-local undo and redo;
- editor-local same-document fragment navigation;
- clipboard conversion for editor content;
- safe visual presentation of EFM content; and
- diagnostics about editor support and local syntax errors.

The package does not own:

- filesystem or database persistence;
- file locking, publication, sync, or conflict resolution;
- attachment storage or URI authorization;
- a whole-document source editor;
- Markdown syntax outside EFM and explicitly named presentation extensions; or
- cross-document host navigation and external URL policy beyond exposing safe
  callbacks.

## 5. Document and block model

The editor presents one continuous document canvas. A **block** is the smallest
top-level or structurally nested unit that can participate in block operations.
An implementation MAY use different internal nodes as long as the observable
behavior is the same.

### 5.1 Plugin composition

The shared component MUST assemble optional syntax through an immutable plugin
profile. A plugin MAY contribute Lexical node definitions, Markdown
transformers, editor behavior components, block or inline insertion commands,
text-selection toolbar actions, shortcut definitions, and capability
identifiers. Node definitions MUST NOT
install editor-wide event listeners; those listeners belong to behavior
components.

Before an editor session mounts, the implementation MUST validate plugin API
versions, stable identities, dependencies, ordering constraints, conflicts,
duplicate registrations, and required insertion handlers. Plugin order and
transformer order MUST be deterministic. Changing the syntax profile MAY reset
transient editor state, but MUST NOT change canonical Markdown merely because a
plugin is absent. A recognized construct without an enabled visual codec MUST
remain in the smallest practical source-preserving fallback block.

The default profile MUST include every syntax family claimed in the complete
support matrix. Hosts MAY intentionally provide a smaller profile, but MUST NOT
describe disabled syntax as fully supported.

### 5.2 Native flow content

The following content SHOULD behave like ordinary rich text with a caret and
continuous range selection:

- paragraphs and soft or hard breaks;
- ATX and Setext headings;
- block quotes;
- bullet, ordered, nested, and task lists;
- emphasis, strong emphasis, strikethrough, inline code, and highlight;
- links, autolinks, and reference links;
- fenced and indented code; and
- GFM tables.

Markdown-native shortcuts MAY transform newly typed prefixes, but undo MUST be
able to restore the literal text.

### 5.3 Semantic inline atoms

Inline mathematics, images, footnote references, and other source-bearing
inline constructs MAY be represented as semantic atoms inside text flow. They
MUST participate in surrounding range selection and MUST expose a local edit
interaction without converting the containing document to source.

### 5.4 Semantic block atoms

Display mathematics, frontmatter, block images, footnote definitions,
reference definitions, thematic breaks, and raw HTML MAY be represented as
semantic block atoms. Each atom MUST provide:

1. a visual or safely readable presentation;
2. a selectable block surface;
3. a selected-block source-edit path when the construct is editable;
4. Markdown-aware copy and cut behavior; and
5. Delete, Backspace, movement, and undo behavior.

### 5.5 Source-preserving fallback blocks

Valid, malformed, or unsupported source that cannot be safely projected MUST
be retained in a localized fallback block. A fallback block:

- MUST retain its exact source until the user edits it;
- MUST render as inert, readable content and never execute embedded code;
- MUST be selectable and removable like any other block;
- MUST participate in the selected-block source editor;
- MUST keep the rest of the document WYSIWYG; and
- MUST report a diagnostic that identifies why native editing is unavailable.

Wikilinks, callouts, directives, MDX, and other exclusions remain ordinary or
fallback Markdown unless a separately named extension specifies them.

## 6. Complete syntax support matrix

This table is the complete syntax claim of this specification. A conforming
editor MUST support every syntax family and source form named below. Examples
are representative; the grammar and edge cases remain governed by CommonMark
0.31.2, the incorporated GFM productions, and EFM 1.0. A syntax omitted from
the table is not implicitly supported.

“Rich text” means direct caret editing in the document flow. “Semantic inline”
means a rendered atom with a local inline editing path; “semantic block” means a
rendered atom that participates in selected-block source editing. Neither an
inert preview nor a source-preserving fallback alone counts as syntax support.
Fallback remains the required compatibility behavior for malformed input and
syntax outside this matrix.

| Family                           | Supported source forms                                                                                  | Required editor form                                | Creation paths                                                      | Canonical and presentation behavior                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Paragraphs and block separation  | Plain text; one or more blank lines between blocks                                                      | Rich text                                           | Direct typing, Enter, paste/import                                  | Blank lines separate blocks; transient empty caret paragraphs do not add non-empty canonical content.                  |
| Soft line breaks                 | A single source newline inside a paragraph                                                              | Rich text                                           | Direct typing, paste/import                                         | Presents as a CommonMark soft break; an intentionally edited paragraph may serialize to an equivalent normalized form. |
| Hard line breaks                 | Two or more trailing spaces or a trailing `\` before a newline                                          | Rich text                                           | `Shift+Enter`, direct typing, paste/import                          | Preserves hard-break semantics and emits a valid CommonMark hard-break marker.                                         |
| ATX headings                     | `# Heading` through `###### Heading`, including CommonMark closing sequences                            | Rich text heading levels 1–6                        | `+` or slash for H1–H3; Markdown shortcut or paste/import for H1–H6 | Serializes as a stable ATX heading.                                                                                    |
| Setext headings                  | `Heading` followed by `===` or `---`                                                                    | Rich text H1 or H2                                  | Markdown shortcut or paste/import                                   | May normalize to the equivalent ATX form after an intentional edit.                                                    |
| Thematic breaks                  | Three or more valid `-`, `*`, or `_` markers with permitted spacing                                     | Semantic block                                      | `+`, slash, Markdown shortcut, paste/import                         | Renders as a divider and serializes to a stable thematic-break spelling.                                               |
| Block quotes                     | `>` containers, including multiple paragraphs and nested block content                                  | Rich text quote/container                           | `+`, slash, Markdown shortcut, paste/import                         | Preserves quote structure and valid nesting.                                                                           |
| Bullet lists                     | `-`, `*`, or `+` list markers                                                                           | Rich text list                                      | `+`, slash, Markdown shortcut, paste/import                         | Preserves list semantics; an edited list may use a stable marker.                                                      |
| Ordered lists                    | Numeric markers using `.` or `)`, including a non-1 start number                                        | Rich text numbered list                             | `+`, slash, Markdown shortcut, paste/import                         | Preserves ordering and the semantic start number.                                                                      |
| Nested and loose lists           | Nested bullet/ordered containers; tight or loose items; multiple blocks in an item                      | Rich nested list                                    | Indent/outdent, Markdown shortcut, paste/import                     | Preserves containment, item boundaries, and tight/loose meaning.                                                       |
| GFM task lists                   | `- [ ]`, `- [x]`, or `- [X]` list items                                                                 | Interactive checklist                               | `+`, slash, Markdown shortcut, paste/import                         | Checkbox changes update the marker; checked items serialize as `[x]`.                                                  |
| Fenced code blocks               | Backtick or tilde fences of valid length, with an optional info string                                  | Editable code block                                 | `+`, slash, Markdown shortcut, paste/import                         | Preserves code text and the language/info string; highlighting is derived presentation only.                           |
| Indented code blocks             | Lines indented by four spaces or one tab under CommonMark rules                                         | Editable code block                                 | Direct typing or paste/import                                       | May normalize to a fenced block after an intentional edit without changing code text.                                  |
| GFM tables                       | Header, delimiter row, body rows, escaped pipes, and optional `:---`, `:---:`, or `---:` alignment      | Visual editable grid                                | `+`, slash, paste/import                                            | Preserves cell content and column alignment; serializes to a stable pipe table.                                        |
| Emphasis                         | `*text*` or `_text_`                                                                                    | Rich text                                           | Selection toolbar, Markdown shortcut, paste/import                  | Serializes with a valid stable delimiter.                                                                              |
| Strong emphasis                  | `**text**` or `__text__`                                                                                | Rich text                                           | Selection toolbar, Markdown shortcut, paste/import                  | Serializes with a valid stable delimiter.                                                                              |
| Combined strong emphasis         | `***text***` or `___text___`, including valid nesting combinations                                      | Rich text                                           | Combined toolbar formats, Markdown shortcut, paste/import           | Preserves both strong and emphasis semantics.                                                                          |
| GFM strikethrough                | `~~text~~`                                                                                              | Rich text                                           | Selection toolbar, Markdown shortcut, paste/import                  | Serializes with `~~` delimiters.                                                                                       |
| Inline code                      | CommonMark backtick spans, including longer delimiters and required padding                             | Rich text code span                                 | Selection toolbar, Markdown shortcut, paste/import                  | Preserves literal code content and emits a sufficient backtick delimiter.                                              |
| Inline links                     | `[label](destination)` with optional CommonMark title                                                   | Rich link                                           | Markdown shortcut, paste/import                                     | Keeps the label editable; activation follows the URI policy in Section 13.                                             |
| Autolinks                        | CommonMark `<https://eidos.space>` / `<name@example.com>` and incorporated GFM bare URL/email autolinks | Rich link                                           | Direct typing or paste/import                                       | Serializes as a valid link form; unsafe destinations remain inactive.                                                  |
| Reference links                  | Full, collapsed, and shortcut forms such as `[label][id]`, `[id][]`, and `[id]`                         | Semantic inline link plus semantic definition block | Direct typing or paste/import                                       | Retains the normalized identifier relationship and definition source.                                                  |
| Link reference definitions       | `[id]: destination "optional title"` and other CommonMark-valid title forms                             | Semantic block                                      | Direct typing or paste/import                                       | Remains independently selectable/editable and continues to resolve owned references.                                   |
| Images                           | Inline and reference forms: `![alt](url "title")` and `![alt][id]`                                      | Semantic inline image or semantic image block       | `+`, block slash, paste/drop/import                                 | Shows a safe image or accessible alt-text fallback; URL, alt, title, and reference meaning remain canonical.           |
| Backslash escapes                | CommonMark escapes such as `\*literal\*`                                                                | Rich text literal characters                        | Direct typing or paste/import                                       | Presents the escaped characters literally and serializes without introducing formatting.                               |
| Character references             | Named, decimal, and hexadecimal references such as `&amp;`, `&#35;`, and `&#x23;`                       | Rich text decoded character                         | Direct typing or paste/import                                       | Preserves the decoded character semantics; spelling may normalize after an intentional edit.                           |
| Raw HTML and HTML comments       | CommonMark inline and block HTML, including comments                                                    | Semantic inline/block or inert readable fallback    | `+`, slash, direct typing, paste/import                             | Allowed markup receives a sanitized preview; active or denied markup never executes and retains its source.            |
| YAML frontmatter                 | One offset-zero `---` envelope containing an empty value or YAML 1.2 mapping                            | Semantic metadata block                             | `+` or slash in the `document` profile; paste/import                | Exists only in `document`, remains pinned first, and serializes as one frontmatter envelope.                           |
| Footnote references              | `[^id]`                                                                                                 | Semantic inline reference                           | Block or inline Footnote command, direct typing, paste/import       | Displays a number derived from first-reference order while preserving the source identifier.                           |
| Footnote definitions             | `[^id]: body`, including CommonMark-indented continuation blocks                                        | Semantic definition block                           | Block or inline Footnote command, direct typing, paste/import       | Definitions render after the body and retain their relationship to every reference.                                    |
| Inline mathematics               | `$equation$` under the EFM whitespace, digit, escape, and single-line rules                             | Typeset semantic inline                             | Inline command, direct typing, paste/import                         | Local editor owns only the TeX source; canonical source retains single-dollar delimiters.                              |
| Display mathematics              | Standalone `$$` delimiter lines or a backtick/tilde fenced block whose language is exactly `math`       | Typeset semantic block                              | `+`, slash, direct typing, paste/import                             | Source mode owns the full block syntax; new blocks use `$$`, while valid imported forms may be preserved.              |
| Highlight presentation extension | `==text==`                                                                                              | Rich highlighted text                               | Selection toolbar, Markdown shortcut, paste/import                  | Serializes with `==` delimiters and MUST be identified as an editor extension, not EFM 1.0.                            |

Choosing display math or image creation MUST insert and select an empty semantic
block immediately. The empty block MUST present a descriptive placeholder
without inserting sample content or opening a second block-local editor. The
normal selection hint and source-edit shortcut MUST provide its editing path.

Wikilinks, callouts, directives, definition lists, superscript/subscript
shortcuts, emoji shortcodes, Mermaid, and MDX/JSX are outside this matrix. They
MUST remain literal Markdown or enter the smallest practical source-preserving
fallback unless a separately named extension adds them.

## 7. Selection model

Selection is a first-class editor capability, not a side effect of whether a
node contains editable text.

### 7.1 Text and cross-block range selection

- Pointer dragging MUST be able to start in one text block and end in another.
- A range MUST continue across paragraphs, headings, quotes, nested lists, task
  items, tables, code blocks, and semantic atomic blocks.
- Atomic blocks fully crossed by a range MUST visibly indicate inclusion in the
  selection.
- Selection MUST remain visually understandable across indentation and nested
  list levels; it MUST NOT be clipped to the first list container.
- Starting a drag on non-interactive space in a block MUST select content or
  the block rather than doing nothing.
- Controls inside an active source editor or inline/insertion composer are
  exempt and retain their normal input selection behavior.

### 7.2 Block marquee selection

Block marquee selection MUST start only from an explicit non-content zone inside
the editor stage:

1. the full left or right empty-canvas region between the stage edge and the
   content boundary, including space outside a centered editor root; or
2. the trailing block-padding area below the last document block.

The side zones MUST follow the responsive content boundary and MUST NOT be
artificially capped to the editor root's inline padding. Pointer dragging that
begins beyond the editor stage or on an interactive control MUST NOT start a
marquee. Hovering an available start zone SHOULD expose a crosshair cursor. Once
a marquee has started, it MAY cross content and selection zones freely and MUST
retain its long-document auto-scroll behavior.

### 7.3 Atomic block selection

- Clicking the non-interactive surface of an atomic block MUST select it.
- Shift-click SHOULD extend the current selection through the clicked block.
- A selected block MUST have a clear but quiet visual state distinct from text
  selection and hover.
- Arrow keys MUST allow the caret to move before or after an atomic block.
- The registered source-edit command on an editable selected atom MUST open the
  selected-block source editor; blocks MUST NOT expose a separate **Edit block**
  action or local editor.
- Escape MUST leave source mode or clear block selection in a predictable
  stepwise order.
- Escape on a collapsed caret MUST enter keyboard block-selection mode with the
  containing top-level block selected. It MUST NOT do so from a source textarea,
  inline/insertion composer, or during IME composition.
- A collapsed caret inside a table cell or an active table-cell selection MUST
  resolve across the table cell shadow-root boundary and select the complete
  top-level table. The editor MUST retain focus.
- In keyboard block-selection mode, Shift+ArrowUp and Shift+ArrowDown MUST move
  the focus end by one top-level block, extending or shrinking a consecutive
  range around a stable anchor. Movement MUST stop at the document boundaries.
- In keyboard block-selection mode, Mod+A MUST select every top-level block.
  Escape MUST clear the mode and restore the caret that entered it.
- An active block selection SHOULD expose a compact, non-interactive hint for
  the resolved source-edit command. The hint MUST disappear when selection is
  cleared, MUST NOT receive focus or pointer input, and MUST NOT replace the
  editor's accessible shortcut metadata.

### 7.4 Operations on a selection

- Backspace and Delete MUST remove selected text and every fully selected atom.
- Copy MUST include the Markdown meaning of selected atoms, not only their
  rendered label.
- Cut MUST perform the same copy and then remove the selection as one undoable
  transaction.
- Deleting a cross-block range MUST merge its remaining boundaries into valid
  Markdown structure.
- When deletion would leave no editable caret target, the editor MUST create an
  empty paragraph without adding non-empty canonical content.
- One Undo MUST restore the content and structure removed by one user action.

### 7.5 Consecutive block source editing

An editable selection of consecutive top-level blocks MAY enter one in-place
Markdown source editor. The shipped behavior uses unmodified `E` and MUST obey
the shortcut registry, exact-modifier, text-input, contenteditable text-editing,
and IME-composition guards.

- The selected nodes MUST be consecutive in both the projected editor root and
  their source ownership. A list or table is eligible only as a complete
  top-level block; nested list items and table cells MUST NOT become independent
  source ranges.
- Selected pinned footnote definitions and generated blocks without owned
  source MUST be excluded before resolving the editable range. If no editable
  block remains, the editor MUST NOT enter. Protected footnote source between
  selected editable ranges MUST remain outside the draft and MUST be preserved
  after the edited source on commit. Other editor or source discontinuities
  MUST NOT enter.
- The local textarea MUST replace the selected range in normal flow. It MUST NOT
  use a dialog, popover, floating editor, header, action bar, or whole-document
  source surface. It MUST present as a code block, wrap by default, expand to
  its content, and MUST NOT show horizontal or vertical scrollbars.
- The draft MUST contain only the exact source interval from the first selected
  block through the last, including separators inside that interval. Source
  before and after it MUST remain byte-stable after decoding.
- The multiline commit shortcut MUST validate the draft, splice that
  interval, reparse visual blocks, and create one undoable content operation.
  Empty source deletes the range. A parse error MUST keep the draft and original
  document source intact while exposing an accessible error.
- Escape MUST restore the original blocks without a content history
  entry. Moving focus away MUST leave the draft open rather than implicitly
  choosing commit or cancel.
- A same-document external value update while the draft is open MUST use the
  controlled-document conflict policy in Section 11.3. Read-only mode MUST NOT
  enter and switching to read-only MUST safely discard the uncommitted draft.
- Closing MUST restore a block selection or a nearby valid caret. The surface
  MUST have an accessible name and shortcut description, and SHOULD reuse code
  syntax highlighting and theme tokens.
- The source surface MUST provide registry-owned commands for indenting,
  outdenting, moving, copying, deleting, and selecting complete logical lines.
  Multi-line commands MUST operate on every line touched by the selection and
  MUST keep the resulting caret or selection on the operated text.
- Line commands MUST preserve untouched content and existing LF, CRLF, or CR
  separators. Tab indentation MUST insert two spaces to match the presented
  source surface's tab size. Commands MUST be ignored during IME composition.
- Native textarea selection, clipboard, navigation, and deletion behavior MUST
  remain available. Source-local undo and redo MUST cover ordinary input and
  registry-owned line commands. `Mod+Enter` remains reserved for commit.
- The source surface SHOULD show a compact, non-interactive summary of its
  resolved indent, movement, commit, and cancel shortcuts. Disabled commands
  MUST be omitted. This hint is presentational and MUST NOT become an action
  bar, receive focus, or capture pointer input.

## 8. Block insertion and movement

### 8.1 Gutter insertion

A collapsed caret in an editable block SHOULD expose a quiet `+` control in
that block's gutter. The control MUST not reserve permanent document width or
shift content when it appears.

Activating `+` opens the same block command catalog as the empty-paragraph slash
menu and inserts a new top-level block immediately after the active block. It
MUST NOT transform or replace the active block, including when that block is an
empty paragraph. The empty-paragraph slash entry point MAY transform its trigger
paragraph instead. Footnote definitions form the document's terminal definition
region and MUST NOT expose `+`; new body content is inserted before that region.

### 8.2 Slash menu

Typing `/` in an empty paragraph MUST open the block insertion catalog. Typing
`/` at the start of an editable rich-text flow or immediately after whitespace
or an opening bracket MUST open a caret-anchored inline insertion catalog.
Neither command entry point inserts the trigger slash. A slash inside a word,
link, inline-code span, or code block remains ordinary text.

Both catalogs MUST be searchable and keyboard navigable, with Arrow Up/Down to
move, Enter to choose, and Escape to close. The inline catalog MUST remain
visually anchored to the saved caret while the document scrolls and MUST expose
only constructs that can be inserted into the current text flow. Its complete
built-in catalog is **Inline equation** and **Footnote**. Image creation MUST
remain in the block catalog; imported inline image syntax remains supported in
text flow but the editor does not expose an inline-image command. Choosing an
inline command MUST restore the saved caret instead of replacing or transforming
its containing block.

The block catalog MUST expose every block construct the editor claims users can
create. At a minimum it includes headings, quote, bullet list, ordered list,
task list, code, table, divider, display math, image, footnote, safe HTML, and
frontmatter when the document profile permits it.

Unavailable items SHOULD explain the constraint instead of silently failing.
For example, frontmatter is unavailable in fragment mode and a document can
contain only one frontmatter envelope at source offset zero.

### 8.3 Composed insertion

Constructs that require initial data open a focused composer. The composer MUST
show only fields for the new block, preserve the rest of the canvas, validate
without destroying the draft, and place selection at a useful location after
insertion.

An inline composer MUST remain local to the saved caret. Confirming **Inline
equation** inserts one valid single-dollar EFM math atom as one undoable
transaction. Confirming **Footnote** inserts the reference at that caret and
appends its matching definition to the document end in the same transaction.
Canceling the inline menu or its composer MUST leave the canonical Markdown
unchanged and MUST NOT leave an empty semantic placeholder.

### 8.4 Movement

Top-level blocks SHOULD expose a top-aligned gutter group on hover or keyboard
focus, ordered as `+` followed by a Notion-like drag handle. Moving a block MUST
preserve its Markdown semantics and be undoable as one transaction. Pointer
dragging MUST show the pending insertion boundary and SHOULD auto-scroll at the
viewport edges. The focused handle SHOULD support `Alt+ArrowUp` and
`Alt+ArrowDown` for one-step movement. Frontmatter remains pinned to source
offset zero. Footnote definitions remain pinned as a terminal region: they MUST
NOT expose a drag handle, MUST NOT move through block-reorder commands, and an
ordinary block MUST NOT be moved after the first footnote definition.

When the caret or a text selection is contained by one list item,
`Alt+ArrowUp` and `Alt+ArrowDown` MUST move that item one position among its
siblings. This is an in-place reorder: it MUST NOT indent, outdent, convert, or
split the item. A nested list owned by the moved item MUST travel with it as one
logical subtree. The caret or selection MUST remain inside the moved item, and
one Undo MUST restore the previous order. At the first or last sibling the
command is a content no-op and MUST NOT escape the editor or create a history
entry. Table rows require equivalent structure-aware movement before a row
shortcut is claimed; no movement command may create an invalid document shape.

When the caret or a text selection is contained by one task-list item,
`Mod+Enter` MUST toggle that item's checked state as one undoable transaction.
The same shortcut inside an ordinary bullet or ordered item MUST NOT convert
the list or mutate its content.

## 9. Scoped source editing

Complex top-level syntax uses the selected-block source interaction from
Section 7.5:

1. The block normally displays its rendered or safely readable presentation.
2. Selecting the block and invoking `selection.edit-source` replaces it in flow
   with its Markdown source.
3. `Mod+Enter` validates the draft, commits its owned source range, and reparses
   the visual block.
4. Escape discards the draft and restores the previous presentation.

Top-level semantic and fallback blocks MUST NOT expose a separate **Edit block**
button, local textarea, action bar, or floating block composer. A parse error
MUST preserve the source draft, display an actionable diagnostic, and leave
every other block unchanged. Inline semantic atoms MAY retain a focused local
composer when selected-block source editing cannot isolate them.

### 9.1 Mathematics

- Inline and display mathematics MUST render as typeset mathematics by default.
- Inline-math editing MUST expose only the TeX source in a focused local
  composer.
- Display-math editing MUST use selected-block source mode and expose its full
  Markdown delimiters.
- Invalid mathematics MUST retain the source and show a local error or readable
  fallback.

### 9.2 Frontmatter

- Frontmatter exists only in the EFM document profile, only once, and only at
  source offset zero.
- It SHOULD render as a compact metadata card rather than a permanent YAML
  textarea.
- Editing MUST use selected-block source mode. Committing MUST produce a YAML
  1.2 mapping or keep the invalid draft uncommitted.
- Moving or inserting ordinary content before frontmatter MUST NOT invalidate
  its source position.

### 9.3 Footnotes and definitions

- Footnote references MUST display the number determined by first reference.
- Definitions SHOULD appear after the document body without becoming detached
  from their canonical identifiers.
- Activating a footnote reference or return link MUST scroll to and focus its
  target within the same editor instance. It MUST NOT mutate the host URL or
  browser hash, because those values may belong to the host router.
- The definition region is the document tail, not an ordinary insertion or
  sorting surface. It MUST NOT expose block creation or movement controls.
- Generated footnote-definition blocks MUST be excluded from selected-block
  source editing. Selecting adjacent body blocks MUST preserve their canonical
  definition source.

### 9.4 Raw HTML

Raw HTML never gains execution authority. Allowed markup MAY receive a
sanitized preview. Active, disallowed, or malformed markup MUST render as inert
readable source and participate in selected-block source editing.

## 10. Clipboard and paste

- Copy SHOULD publish `text/markdown` and `text/plain`; safe `text/html` MAY be
  added for interoperability.
- Markdown copied from atomic and fallback blocks MUST contain their canonical
  source rather than a visual placeholder.
- Pasting `text/markdown` into the canvas MUST parse it into the corresponding
  visual structure at the selection.
- Multiblock plain-text paste MAY use Markdown recognition when intent is
  unambiguous; otherwise it remains plain text.
- Binary attachment persistence belongs to the host. When a clipboard payload
  contains image files and `onPasteImage` is present, the editor MUST call it
  once per image in clipboard order with the `File`, document identity,
  zero-based image index, total image count, and an abort signal. The callback
  MAY complete asynchronously and returns a stable `markdownUrl`, optional
  accessible alt text and title, and an optional transient `displayUrl`.
- The editor MUST preserve the selection captured when the paste occurred while
  those callbacks run. Successful results from one clipboard event MUST be
  inserted together at that saved selection as semantic image blocks and as one
  undoable transaction. A result of `null` inserts nothing for that file. A
  rejected or invalid result MUST surface through `onError` without inserting a
  broken source node.
- A claimed asynchronous paste MUST be cancelled when the editor unmounts or
  becomes read-only. A late host result MUST NOT mutate a read-only or
  unmounted editor.
- `markdownUrl` is canonical and MUST be serialized. `displayUrl` is
  presentation-only and MUST NOT enter Markdown. On import and remount, the
  editor MAY call the host's asynchronous `resolveImageUrl` with the canonical
  URL, document identity, and an abort signal to recover a current presentation
  URL. Resolution failure keeps the Markdown source and exposes the accessible
  image fallback.
- Without `onPasteImage`, binary files are not claimed by the package and the
  browser or another Lexical plugin MAY handle the paste. When a claimed
  clipboard payload contains both text and images, the persisted images take
  precedence so browser-generated image HTML is not also inserted.
- Pasting inside a selected-block source field MUST insert literal text and MUST
  NOT restructure the surrounding document.
- Paste, cut, and drop operations MUST each be undoable as one transaction.

## 11. Serialization and synchronization

### 11.1 Stable canonical output

Serialization MUST follow the EFM input profile and EFM serializer rules. It
MUST emit LF and MUST NOT emit a UTF-8 BOM. Security filtering affects
presentation and activation; it MUST NOT silently erase canonical source.

### 11.2 Locality of change

The editor SHOULD retain sufficient source ownership to avoid rewriting
untouched regions. At minimum:

- a no-op session preserves the original Markdown byte-for-byte after decoding;
- editing a semantic atom changes only that atom's owned source range, plus the
  minimum delimiter or blank-line repair needed for valid EFM;
- unsupported fallback blocks remain byte-for-byte stable until edited; and
- normalization of an edited native block MUST NOT remove unrelated reference
  definitions, footnotes, HTML, comments, or whitespace in another block.

### 11.3 Host synchronization

`markdown` and `onMarkdownChange` form the canonical host boundary. A host may
replace the document when `documentKey` changes. External replacement of the
same document while an editor draft is active MUST be reconciled explicitly; it
MUST NOT silently overwrite the local draft.

The default reconciliation keeps the draft visible. Its commit command chooses
the local draft and emits the resulting Markdown; Cancel or Escape chooses the
pending external value. The conflict MUST be exposed to assistive technology
and through the operational error callback.

`document` input recognizes frontmatter. `fragment` input treats an initial
`---` as ordinary Markdown. Switching profiles MUST NOT reinterpret and save a
document without a user-visible operation.

## 12. Undo, focus, and keyboard behavior

- Direct typing, formatting, insertion, movement, checkbox toggles, source-range
  commits, paste, cut, and deletion MUST participate in editor undo/redo.
- Opening or closing a menu, source editor, or inline composer is transient UI state and SHOULD
  NOT create a content history entry.
- A source-range commit MUST be one undoable content transaction.
- Undo after an automatic Markdown shortcut MUST first restore the literal
  typed prefix when practical.
- Closing a source editor MUST return focus to its block or a predictable nearby
  caret.
- All pointer operations required by this specification MUST have a keyboard
  equivalent.

### 12.1 Shortcut registry

Package-owned keyboard behavior MUST be defined once in a registry and
referenced by stable command ID. Nodes, plugins, tooltips, and accessibility
metadata MUST NOT maintain independent copies of the same binding. Each command
definition contains a scope, description, and one or more bindings.

`Mod` means exactly one primary accelerator key, Meta or Ctrl. Visible hints use
Meta on macOS and Ctrl on other desktop platforms. A match MUST use the declared
modifiers exactly: additional Alt, Shift, a second primary key, or another Mod
key does not match unless it is part of the binding. Package shortcuts MUST be
ignored during IME composition. Interactive controls MUST expose the resolved
bindings through `aria-keyshortcuts` when applicable.

Hosts MAY replace every binding for a stable ID or disable that command. The
same resolved binding MUST control execution, visible hints, and accessibility
metadata. Overrides MUST NOT introduce two commands with the same binding in
the same scope. Reusing a chord in disjoint scopes is valid; for example,
`Alt+ArrowDown` acts on a list item while the caret is in that item and on a
top-level block while its gutter handle is focused.

### 12.2 Default shortcuts

| Stable ID                      | Default binding        | Scope         | Behavior                                                                           |
| ------------------------------ | ---------------------- | ------------- | ---------------------------------------------------------------------------------- |
| `document.save`                | `Mod+S`                | document      | Requests host persistence when a save callback exists.                             |
| `history.undo`                 | `Mod+Z`                | editor        | Undoes one editor transaction.                                                     |
| `history.redo`                 | `Mod+Shift+Z`, `Mod+Y` | editor        | Redoes one editor transaction.                                                     |
| `format.bold`                  | `Mod+B`                | selection     | Toggles bold on rich text or `**` markers around a source selection.               |
| `format.italic`                | `Mod+I`                | selection     | Toggles italic on rich text or `*` markers around a source selection.              |
| `insert.open-menu`             | `/`                    | editor        | Opens block insertion on an empty line or inline insertion at a command boundary.  |
| `menu.previous`                | `ArrowUp`              | menu          | Moves to the previous command.                                                     |
| `menu.next`                    | `ArrowDown`            | menu          | Moves to the next command.                                                         |
| `menu.choose`                  | `Enter`                | menu          | Chooses the active command.                                                        |
| `overlay.dismiss`              | `Escape`               | overlay       | Closes the active menu or composer without a content edit.                         |
| `selection.clear`              | `Escape`               | selection     | Clears the active block selection.                                                 |
| `selection.enter-block`        | `Escape`               | editor        | Selects the top-level block containing the caret.                                  |
| `selection.extend-up`          | `Shift+ArrowUp`        | selection     | Extends or shrinks the block selection upward.                                     |
| `selection.extend-down`        | `Shift+ArrowDown`      | selection     | Extends or shrinks the block selection downward.                                   |
| `selection.edit-source`        | `E`                    | selection     | Opens consecutive selected top-level blocks as one in-place Markdown source range. |
| `selection.select-all-blocks`  | `Mod+A`                | selection     | Selects every top-level block.                                                     |
| `source-editor.copy-line-down` | `Shift+Alt+ArrowDown`  | source editor | Copies selected/current source lines downward.                                     |
| `source-editor.copy-line-up`   | `Shift+Alt+ArrowUp`    | source editor | Copies selected/current source lines upward.                                       |
| `source-editor.delete-line`    | `Mod+Shift+K`          | source editor | Deletes selected/current source lines.                                             |
| `source-editor.indent`         | `Tab`, `Mod+]`         | source editor | Inserts two spaces or indents selected source lines.                               |
| `source-editor.move-line-down` | `Alt+ArrowDown`        | source editor | Moves selected/current source lines downward.                                      |
| `source-editor.move-line-up`   | `Alt+ArrowUp`          | source editor | Moves selected/current source lines upward.                                        |
| `source-editor.outdent`        | `Shift+Tab`, `Mod+[`   | source editor | Removes a tab or up to two leading spaces.                                         |
| `source-editor.select-line`    | `Mod+L`                | source editor | Selects the current logical source line.                                           |
| `block.move-up`                | `Alt+ArrowUp`          | block handle  | Moves the handled top-level block up one position.                                 |
| `block.move-down`              | `Alt+ArrowDown`        | block handle  | Moves the handled top-level block down one position.                               |
| `list-item.move-up`            | `Alt+ArrowUp`          | list item     | Moves the current list item before its previous sibling.                           |
| `list-item.move-down`          | `Alt+ArrowDown`        | list item     | Moves the current list item after its next sibling.                                |
| `list-item.toggle-checked`     | `Mod+Enter`            | list item     | Toggles the current task-list item's checked state.                                |
| `block-editor.commit`          | `Mod+Enter`            | composer      | Commits a multiline source or insertion draft.                                     |
| `composer.confirm`             | `Enter`                | composer      | Confirms a single-line block composer.                                             |
| `inline-atom.activate`         | `Enter`, `Space`       | editor        | Opens the focused inline semantic atom.                                            |

## 13. Safety and resource behavior

- Raw HTML and unknown source MUST remain non-executable.
- Active links are limited to the package's declared EFM resource policy.
- Dangerous schemes such as `javascript:`, `vbscript:`, `data:`, and `file:`
  MUST remain inactive.
- Relative links and images require a host-provided base URI before activation.
- A host MAY resolve a non-denied canonical image scheme such as `opfs:` through
  `resolveImageUrl`. The returned presentation URL is trusted only after the
  editor restricts it to `blob:`, `http:`, or `https:`; it MUST never replace
  the canonical URL during serialization. Denied canonical schemes MUST NOT be
  delegated to this resolver.
- Syntax highlighting MUST be presentational. It MUST NOT add canonical text,
  break caret positions, or modify Markdown.
- Markdown source highlighting MUST recognize the supported CommonMark, GFM,
  frontmatter, mathematics, and highlight-extension syntax by parser-owned
  offsets. Plain prose MUST NOT be passed through programming-language keyword,
  type, number, or operator heuristics.
- A renderer or parser failure MUST surface through diagnostics and preserve
  the affected source whenever possible.

## 14. Accessibility and visual behavior

- The editor MUST expose an accessible document label and meaningful names for
  formatting, insertion, block editing, and commit controls.
- Selection MUST not be communicated by color alone.
- Menus and composers MUST trap neither focus nor keyboard navigation.
- Rendered equations and images MUST expose useful accessible text derived from
  source and alt text.
- Read-only mode MUST disable mutation controls without making content
  unselectable for copying.
- `document` layout keeps reading margins; `embedded` layout fills the width
  owned by its host. Both MUST inherit host editorial typography and semantic
  theme tokens, and MUST share the same block and inline presentation rules.
  `embedded` MAY differ only in container sizing, overflow, and reading-width
  ownership.
- Motion is optional and MUST respect reduced-motion preferences.

## 15. Acceptance requirements

Requirements use stable IDs so tests and implementation changes can cite this
document.

### Canonical data

- **CAN-001**: Markdown is the only persisted editor value.
- **CAN-002**: Opening and closing an unchanged document preserves its source.
- **CAN-003**: Unsupported source survives import, unrelated edits, and export.
- **CAN-004**: Editing one semantic atom does not reserialize unrelated atoms.

### Syntax coverage

- **SYN-001**: Every row in the Section 6 matrix has parser, presentation, and
  stable round-trip fixtures for every named source form.
- **SYN-002**: Every rich-text or semantic row in the matrix is editable and
  creatable through at least one listed path without a whole-document source
  mode.
- **SYN-003**: A source-preserving fallback does not satisfy a rich-text or
  semantic support claim.
- **SYN-004**: Syntax outside the matrix remains literal or source-preserved and
  is never silently interpreted as a supported extension.

### Creation

- **CRT-001**: `+` inserts a new block immediately below without changing the
  current block.
- **CRT-002**: `/` on an empty paragraph opens the insertion catalog.
- **CRT-003**: Every claimed supported block is creatable without source mode.
- **CRT-004**: Frontmatter creation enforces document profile, uniqueness, and
  offset-zero placement.
- **CRT-005**: Pasted Markdown becomes the corresponding visual structure.
- **CRT-006**: Empty equation and image creation inserts a persistent placeholder
  block, then edits that same block through a local composer.
- **CRT-007**: `/` at a rich-text command boundary opens a caret-anchored inline
  catalog containing only Inline equation and Footnote; either command inserts
  at the saved caret, while canceling makes no canonical edit.
  Footnote creation also appends its definition in the same undoable transaction.
- **CRT-008**: A host-handled clipboard image is persisted before insertion and
  serializes the returned stable URL rather than its transient presentation URL.
- **CRT-009**: Async image paste restores its captured selection, inserts every
  successful image in clipboard order, and creates one undo entry.

### Selection and block operations

- **SEL-001**: Drag selection crosses different top-level block types.
- **SEL-002**: Drag selection crosses nested bullet, ordered, and task lists.
- **SEL-003**: Atomic blocks crossed by a range visibly join the selection.
- **SEL-004**: Clicking a non-interactive atomic surface selects the block.
- **SEL-005**: Copy and cut include the Markdown source of selected atoms.
- **SEL-006**: Delete and Backspace remove selected atoms and mixed ranges.
- **SEL-007**: One Undo restores a deleted or cut mixed-block selection.
- **SEL-008**: The document retains a valid caret target after full deletion.
- **SEL-009**: Selected top-level blocks can be moved by their gutter handle,
  remain valid Markdown, and return to their previous position with one Undo;
  footnote definitions expose no gutter controls and ordinary blocks cannot move
  past the terminal definition region.
- **SEL-010**: Block marquee starts throughout the stage's left/right empty canvas
  or trailing document padding; space outside the stage does not start it.
- **SEL-011**: Consecutive eligible top-level blocks open as one exact in-place
  source range; nested children, pinned definitions, and source-discontinuous
  selections do not.
- **SEL-012**: Escape on a collapsed caret, including a table-cell caret or
  table-cell selection, selects its complete top-level block without blurring;
  Shift+ArrowUp/Down extends or shrinks the anchored block range, Mod+A selects
  every top-level block, and Escape restores the original caret.

### Keyboard

- **KEY-001**: `Alt+ArrowUp` and `Alt+ArrowDown` reorder the current list item
  among same-level siblings, keep an owned nested list attached, and never
  change nesting level.
- **KEY-002**: A moved list item retains its caret or selection, creates one
  undoable transaction, and a boundary no-op creates none.
- **KEY-003**: Every package shortcut has a stable ID and scope, uses exact
  modifier matching, is ignored during IME composition, and has no same-scope
  conflict in the default registry.
- **KEY-004**: A host override or disablement changes execution, visible hints,
  and `aria-keyshortcuts` from the same resolved binding.
- **KEY-005**: `Mod+Enter` toggles the task-list item containing the caret as
  one undoable transaction and does not convert ordinary list items.
- **KEY-006**: Unmodified `E` enters selected-block source editing only outside
  text inputs, textarea/contenteditable text editing, and IME composition.
- **KEY-007**: Keyboard block selection uses registered, overridable shortcuts,
  stops at root boundaries, and does not capture keys from source editors,
  composers, menus, dialogs, or IME composition.
- **KEY-008**: Block-selection and source-editor hints reflect resolved
  bindings, omit disabled commands, disappear with their owning mode, and do
  not capture focus or pointer input.

### Navigation

- **NAV-001**: Footnote references and return links scroll and focus their
  targets inside the current editor without changing the host URL or invoking
  external navigation.

### Scoped editing

- **EDT-001**: Inline equation editing scopes input to TeX; display equations
  use selected-block Markdown source mode.
- **EDT-002**: Frontmatter editing uses only its selected source range and does
  not expose or convert the entire document.
- **EDT-003**: Top-level semantic and fallback blocks expose no **Edit block**
  action, local textarea, action bar, or floating block composer.
- **EDT-004**: Invalid source syntax preserves the draft and isolates the error.
- **EDT-005**: A selected-block source commit is one undoable transaction.
- **EDT-006**: A consecutive source-range commit splices only its owned source,
  reparses visual blocks, and is one undoable transaction; Escape is source-neutral.
- **EDT-007**: Empty source deletes the range, parse errors retain the draft,
  focus departure is neutral, and external-value conflicts require an explicit
  commit or Escape.
- **EDT-008**: Source line shortcuts indent, outdent, move, copy, delete, and
  select logical lines while preserving untouched source, line endings, and the
  operated caret or selection; source-local undo and redo cover line commands
  and ordinary input.

### Fidelity and safety

- **FID-001**: EFM round trips preserve semantics for all supported constructs.
- **FID-002**: Fallback blocks are byte-stable until intentionally edited.
- **FID-003**: Editing one block preserves unrelated definitions, footnotes,
  HTML, comments, and whitespace.
- **SAF-001**: Raw HTML and fallback source cannot execute active content.
- **SAF-002**: URI activation follows the documented resource policy without
  deleting source.

### Shared-host behavior

- **HST-001**: Web, Lite, and Serve use the same package behavior and fixtures.
- **HST-002**: Read-only mode preserves selection and copy while preventing
  mutation.
- **HST-003**: Document and fragment profiles differ only where EFM specifies.

## 16. Test organization

Automated tests SHOULD cite requirement IDs in their names or comments. The
package test suite should include:

1. parser, presentation, editor, and serializer fixtures for every row and
   named source-form variant in the Section 6 matrix;
2. byte-preservation fixtures for unsupported and untouched source;
3. interaction tests for insertion, scoped source editing, selection, deletion,
   movement, clipboard, and undo;
4. mixed-content fixtures that combine text, nested lists, tables, equations,
   HTML, frontmatter, footnotes, and fallback blocks; and
5. host-level smoke tests proving the shared behavior in Web, Lite, and Serve.

A feature is complete only when its creation, presentation, editing, selection,
clipboard, deletion, undo, and round-trip behaviors are covered. Rendering a
construct without making it operable does not count as support.

## 17. Delivery priority

When requirements compete, implementation work follows this order:

1. canonical data safety and source fidelity;
2. continuous selection and reliable block operations;
3. creation and local editing for the complete supported syntax set;
4. Notion-like interaction fluency and keyboard parity; and
5. visual polish, animation, and delight.
