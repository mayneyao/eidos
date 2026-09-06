# Obsidian Markdown compatibility

Eidos Markdown includes CommonMark, GFM, and its wiki/document extensions by
default. No separate Obsidian preset or Vault detection is required.
`obsidianPreset`, `obsidianMarkdownProfile`, and `profile="obsidian"` remain
deprecated compatibility aliases, not distinct product modes.

The scope is Markdown documents. Eidos does not interpret `.obsidian`
configuration, Bases, Canvas, community plugins, or Obsidian workspaces.
Existing Vaults should remain backed up: syntax recognition is not a claim of
complete rendering, editing, or byte-for-byte preservation in every case.

## Host integration

```tsx
<MarkdownEditor
  documentKey="Projects/Current.md"
  documentPath="Projects/Current.md"
  markdown={markdown}
  onMarkdownChange={setMarkdown}
  searchNotes={searchFiles}
  onOpenInternalLink={openVaultTarget}
  navigationTarget={navigationTarget}
  resolveImageUrl={resolveVaultAttachment}
/>
```

The editor owns parsing and interactions. Lite owns file discovery, navigation,
attachment access, and persistence; the renderer receives no raw filesystem handle.

## Current coverage

| Surface                          | Reading and navigation                                                                                        | Editing and remaining limits                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CommonMark + GFM                 | Headings, lists, tasks, tables, code, links and formatting                                                    | Native editing; unsupported containers retain source-local editing                                                                                       |
| YAML frontmatter                 | Arrays, empty values, URLs and wiki values                                                                    | Source-preserving editor; Lite indexes string/list `aliases` (and legacy `alias`) for completion                                                         |
| Wiki and Markdown internal links | Files, aliases, headings, nested heading paths, block targets                                                 | File completion with `[[`; complete plain-text wiki links are recognized on paste                                                                        |
| Heading/block completion         | Existing targets navigate                                                                                     | Lite offers headings with `[[file#` / `[[#`, and explicit paragraph/structured block IDs with `#^`; no generated-ID picker for arbitrary unmarked blocks |
| Paragraph block IDs              | Trailing `^id` is a hidden anchor                                                                             | Copy block link; stable through typing, splitting and reordering                                                                                         |
| Structured block IDs             | A separate `^id` after a blank line belongs to the preceding list, quote, table or callout                    | ID travels with its native block, including serialized editor state; no extra editable marker paragraph                                                  |
| List-item IDs                    | Inline IDs can be parsed and navigation targets the containing item                                           | No list-item Copy block link action yet                                                                                                                  |
| Images                           | Standard Markdown images                                                                                      | Host resolves and persists image assets; wiki image embeds remain literal                                                                                |
| Wiki embeds                      | `![[...]]` is unsupported and remains literal source                                                          | No preview, loading, completion or automatic reference updates                                                                                           |
| Footnotes                        | Named footnotes navigate and appear at the document tail                                                      | Inline `^[text]` remains a lightweight tooltip, without the full named-footnote editing experience                                                       |
| Callouts                         | Type, title and folding                                                                                       | Body is a preview; editing is source-local rather than nested WYSIWYG                                                                                    |
| Tags/comments                    | Source retained and semantic presentation                                                                     | No tag index or completion; comments are de-emphasized                                                                                                   |
| Math/highlight                   | KaTeX math and highlighted text                                                                               | Full Obsidian formula compatibility is not established                                                                                                   |
| Mermaid                          | Source code is preserved                                                                                      | No diagram renderer                                                                                                                                      |
| Missing targets                  | Lite offers a new-note reference in file completion; clicking a missing Markdown link asks to create the note | Explicit confirmation shows an immutable path; existing directories required; no creation for non-Markdown targets, no automatic write during search     |
| Rename/move propagation          | Lite updates resolved wiki and Markdown file destinations, including reference definitions                    | Host-initiated moves only; unresolved references remain unchanged                                                                                        |

## Alias discovery in Lite

Note completion searches YAML aliases as well as file names. Selecting an alias
inserts `[[actual/path.md|Alias]]`, never `[[Alias]]`; duplicate aliases remain
separate candidates with visible file paths. Ordinary path search does not read
Markdown bodies. The note index lazily reads up to 64 KiB of each Markdown file's
prefix, with eight concurrent reads, then reuses metadata until the path changes.
UTF-8 and BOM-marked UTF-16 are supported. Malformed/oversized frontmatter,
non-string aliases and symlink targets do not contribute aliases. No `.obsidian`
configuration is inspected.

## Missing-note authoring in Lite

An unmatched file query offers **Link to new note**. Choosing it inserts a wiki
reference only; searching and insertion do not write a file. Clicking a missing
Markdown reference opens a confirmation showing the exact destination. Basename
wiki targets create beside the source document; slash-qualified targets are
Space-root-relative; ordinary Markdown paths remain document-relative. An omitted
extension becomes `.md`. Non-Markdown extensions are never created by this flow.
The containing directory must already exist. The host uses exclusive file
creation: an existing or concurrently created file is not overwritten. On success,
Lite refreshes the tree and opens the new empty note. Cancelling leaves the
unresolved link intact.

## Rename and move safety

Lite resolves references against the pre-move file tree and patches only destination
bytes. Labels, wiki aliases, fragments, titles, code, and unrelated source formatting
are retained. Moving a note or folder also rebases its resolved outgoing relative
Markdown links. Short wiki names are retained if they still resolve to the same file;
otherwise a root-qualified path disambiguates them. File attachments are included.

Save or discard open text drafts before moving or renaming files. Updates use each
note's expected disk revision and preserve its encoding. Changed, unreadable, or
oversized notes are skipped and reported; multi-file updates are best-effort, not an
atomic vault transaction. Moves made outside Lite are not automatically repaired.
Only resolved links are maintained; missing destinations and raw HTML URLs are not.

## Structured block identity

For example:

```md
- First item
- Second item

^my-list
```

The ID belongs to the list, not to an empty paragraph below it.
`[[#^my-list]]` reveals the whole list. The source analysis groups the structure
and marker into one source range; native block editing and reordering preserve
the ID. A marker inside a code fence is literal. An orphan standalone ID is not
silently attached to an unrelated block.

The interactive Copy block link action still targets standalone paragraphs only.
Structured IDs already present in Markdown are supported without adding new
creation or management UI.

## Fidelity and verification

- Opening without a change preserves the normalized source; BOM and line endings
  follow the codec contract.
- Local editing attempts to retain untouched Markdown spelling and whitespace.
  This is not a blanket lossless-editing guarantee.
- Tests cover structured IDs on lists, tasks, quotes, tables and callouts;
  source range grouping, unrelated edits, movement, JSON restoration and reload.
- Optional real-Vault tests read only Markdown and never write to the Vault:

```sh
EIDOS_MARKDOWN_VAULT_FIXTURES=/absolute/path/to/notes \
  pnpm --filter @eidos.space/markdown exec vitest run \
  src/features/vault-inline/vault-corpus.test.ts
```

These corpus tests check no-op source retention and appending a paragraph without
rewriting existing content. They do not prove all editing operations or visual
rendering.

Reference semantics: [internal links](https://obsidian.md/help/links),
[embeds](https://obsidian.md/help/embeds),
[properties](https://obsidian.md/help/properties),
[callouts](https://obsidian.md/help/callouts).
