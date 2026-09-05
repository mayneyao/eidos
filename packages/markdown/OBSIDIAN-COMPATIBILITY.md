# Obsidian Markdown compatibility

> **Experimental:** `obsidianMarkdownProfile` is an opt-in compatibility
> preview. It is not a complete Obsidian implementation, its behavior may
> change between prereleases, and important Vaults should remain backed up.

This document records the current compatibility target of the built-in
`obsidianMarkdownProfile`. It is a host-facing profile layered on CommonMark
and GFM; it does not change the stable default Eidos Flavored Markdown profile.

The scope is the Markdown syntax used by Obsidian. The package does not read,
interpret, or special-case the `.obsidian` directory. It parses and renders the
document syntax, then delegates optional note navigation and attachment access
to explicit host callbacks.

Reference behavior is based on the official Obsidian documentation for
[internal links](https://obsidian.md/help/links),
[embeds](https://obsidian.md/help/embeds),
[properties](https://obsidian.md/help/properties), and
[callouts](https://obsidian.md/help/callouts).

## Activating the profile

```tsx
<MarkdownEditor
  documentKey="Projects/Current.md"
  markdown={markdown}
  profile="obsidian"
  onMarkdownChange={setMarkdown}
  onOpenInternalLink={openVaultTarget}
  navigationTarget={navigationTarget}
  resolveImageUrl={resolveVaultAttachment}
/>
```

`profile="obsidian"` selects one document codec and its matching plugin set.
It is mutually exclusive with `plugins`. A host that needs another dialect can
provide a custom `MarkdownProfile` instead of mixing codecs in one session.

## Experimental compatibility matrix

| Obsidian surface                                                                      | Current behavior                                                                                                                    | Status                                                                         |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| CommonMark and GFM text                                                               | Headings, quotes, lists, task lists, tables, code, emphasis, links, and other shared syntax remain editable                         | Supported                                                                      |
| YAML properties                                                                       | Offset-zero frontmatter preserves YAML source; empty values, arrays, URLs, and wikilink values render semantically                  | Supported                                                                      |
| Wikilinks                                                                             | `[[Note]]`, folder paths, aliases, headings, nested heading paths, and `#^block-id` targets are parsed and routed to the host       | Supported                                                                      |
| Markdown internal links                                                               | Vault-root and `./` / `../` note destinations are parsed without converting them to web URLs                                        | Supported                                                                      |
| Same-note anchors                                                                     | Heading and block targets scroll within the current editor without changing the host URL                                            | Supported                                                                      |
| Persistent block IDs                                                                  | Trailing `^id` markers remain source-preserving and are addressable navigation targets                                              | Supported                                                                      |
| Image embeds                                                                          | `![[image.png]]`, `![[image.png\|300x200]]`, `![alt\|300x200](image.png)`, and `![300](image.png)` render through `resolveImageUrl` | Supported for raster images                                                    |
| Note and non-image embeds                                                             | The target remains visible and opens through `onOpenInternalLink`                                                                   | Source-safe placeholder; inline transclusion is not implemented                |
| Tags                                                                                  | Inline `#tag` values receive semantic presentation and preserve source                                                              | Supported; no Vault tag index or autocomplete                                  |
| Inline footnotes                                                                      | `^[text]` imports as an inline semantic note and preserves source                                                                   | Supported; no dedicated inline-footnote composer                               |
| Named footnotes                                                                       | References and definitions are linked, numbered by first use, and displayed in the document tail                                    | Supported                                                                      |
| Obsidian comments                                                                     | `%%comment%%` remains source-preserving and is visually de-emphasized                                                               | Supported                                                                      |
| Callouts                                                                              | Type, title, body, and `+` / `-` folding state render visually; source is edited locally                                            | Supported for one parsed callout block; nested callout editing is source-local |
| Math and highlight                                                                    | Obsidian `$…$`, display math, and `==highlight==` use the matching semantic presentation                                            | Supported                                                                      |
| Rename propagation                                                                    | Existing link source is preserved                                                                                                   | Not implemented; the host does not rewrite backlinks after a rename            |
| Link autocomplete and unresolved-note creation                                        | Literal source remains editable                                                                                                     | Not implemented                                                                |
| Backlinks, graph, search, Canvas, Bases, community plugins, themes, Sync, and Publish | Outside the Markdown editor contract                                                                                                | Host or Obsidian application concern                                           |

## Optional host integration

When the Obsidian compatibility profile is selected, Markdown files use this
syntax profile. A host may additionally:

- resolve explicit Vault-root paths, relative Markdown paths, and unique or
  nearest same-folder note names without following symlinks;
- open heading and block targets after the destination note mounts;
- resolve existing raster attachments relative to the note, from the Vault
  root, or by a deterministic shortest-name search; and
- keep clipboard-image persistence host-owned.

Profile selection is explicit. Directory contents, including the presence or
absence of `.obsidian`, never change how a Markdown document is interpreted.

## Fidelity and safety

- A no-op open/close keeps the original Markdown bytes after line-ending and
  BOM normalization defined by the selected codec.
- Local edits preserve untouched source spelling, blank lines, and manual
  paragraph wrapping whenever the mapping is unambiguous.
- Vault navigation never grants the renderer direct filesystem access.
- Traversal outside the Vault, symlink targets, active URI schemes, and
  canonical `file:` or `data:` resources are rejected.
- Unsupported Obsidian features stay literal or use the smallest practical
  source-preserving semantic placeholder; they are never silently deleted.
