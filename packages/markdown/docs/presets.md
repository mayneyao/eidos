# Eidos Markdown

The editor uses one default dialect: **CommonMark + GFM + Wiki links**, with
Eidos document extensions. Lite and the playground do not expose a dialect switch.

## Syntax and ownership

| Layer            | Syntax                                                                             |
| ---------------- | ---------------------------------------------------------------------------------- |
| CommonMark       | Paragraphs, headings, lists, quotes, code, links, images and safe HTML             |
| GFM              | Tables, task lists, strikethrough, autolinks and HTML tag filtering                |
| Wiki             | File links and aliases, including .eidos and non-Markdown targets                  |
| Eidos extensions | Frontmatter, equations, footnotes, highlights, callouts, tags, comments, block IDs |

Plugins own parsing, serialization, nodes and editing behavior. The host owns
file discovery, path resolution, navigation and attachments. A link does not imply
an embed. Wiki embeds (`![[...]]`) are unsupported and remain literal text. Pass `searchNotes` and
`onOpenInternalLink` to integrate host files with the default editor.

The [behavior specification](../SPEC.md) defines the dialect and source retention.
Unsupported source must not be silently dropped.

## Compatibility API

`eidosPreset` and `eidosMarkdownProfile` identify the default composition.
`obsidianPreset`, `obsidianMarkdownProfile` and `profile="obsidian"` are deprecated
aliases retained for existing callers. They no longer select a separate mode.
Existing Lite compatibility preferences are accepted but no longer change grammar.

CommonMark/GFM building blocks and explicit custom plugin APIs remain available
for existing consumers and conformance tests. They are implementation composition
tools, not competing product modes. No .obsidian settings are required or read.
