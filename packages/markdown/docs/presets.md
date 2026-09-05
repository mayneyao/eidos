# Presets

A preset is an explicit composition of plugins, not a separate editor.
Start with `commonmarkPreset` for foundational Markdown or `gfmPreset` for
tables, task lists and other GFM extensions. Add only the plugins your
application needs with `createMarkdownPreset`.

```tsx
import { MarkdownEditor } from "@eidos.space/markdown"
import { gfmPreset } from "@eidos.space/markdown/presets"

;<MarkdownEditor
  documentKey="notes"
  preset={gfmPreset}
  markdown={markdown}
  onMarkdownChange={setMarkdown}
/>
```

Eidos and Obsidian presets are examples of richer compositions, not requirements
of the framework. The existing `profile="gfm"`, `profile="eidos"` (default)
and `profile="obsidian"` shortcuts remain supported for compatibility.
See [composition](/docs/composition) to customize a preset and
[writing a plugin](/docs/plugins) to add your own syntax.

## Included syntax

| Syntax family                                     | GFM | Eidos | Obsidian       |
| ------------------------------------------------- | --- | ----- | -------------- |
| CommonMark blocks, inlines, links and images      | Yes | Yes   | Yes            |
| Tables, task lists and strikethrough              | Yes | Yes   | Yes            |
| Extended URL/email autolinks                      | Yes | Yes   | Yes            |
| Disallowed HTML filtering and safe rendering      | Yes | Yes   | Yes            |
| YAML document properties                          | No  | Yes   | Yes            |
| Footnotes, equations and highlights               | No  | Yes   | Yes            |
| Wikilinks, callouts, tags, comments and block IDs | No  | No    | Yes            |
| Note/attachment embed references                  | No  | No    | Host-dependent |

GFM includes all five extension families in the [GFM specification](https://github.github.com/gfm/):
tables, task lists, strikethrough, extended autolinks and disallowed raw HTML.
This is not a claim that every GitHub product feature is GFM: equations,
footnotes, issue mentions and emoji shortcodes are not part of that specification.
Nor is syntax-family coverage a claim of passing every official conformance
example. The editor adds a stricter security boundary: unsafe HTML stays inert,
and some complex containers are visually rendered with source editing instead
of direct caret editing. Inline images can be imported but are not offered by
the inline insertion menu.

## Try the presets

The [playground](/playground) changes the actual editor profile, not just the
sample text. Switching keeps the current Markdown and read-only/source-view
state, while starting a new editor session (caret and undo history reset).
The `?preset=gfm`, `?preset=eidos` and `?preset=obsidian` URLs select a preset on
load. They do not persist document drafts after reloading.

The [syntax lab](/spec) lists the syntax families and shows editable source next
to the actual editor. It also shows what happens when the selected preset does
not enable an extension. It keeps each example's draft during switching.

## Custom presets and plugins

`gfmMarkdownProfile`, `eidosMarkdownProfile` and `obsidianMarkdownProfile`
are public profile objects. `defineMarkdownProfile` composes a codec and plugins;
`defineMarkdownPlugins` composes syntax and behavior. Do not pass both `profile`
and `plugins` to the editor. See [Writing a plugin](./plugins.md).

## Preset-specific limits

Obsidian is an experimental preset, not a separate editor or an emulation of
the Obsidian application. It does not read `.obsidian` settings. Cross-document
links and attachment lookup require host callbacks; note transclusion and
arbitrary plugin syntax are not implemented. The detailed
[Obsidian preset coverage](../OBSIDIAN-COMPATIBILITY.md) remains a reference
for that preset, not a top-level product capability.

The [behavior specification](../SPEC.md) defines interaction and source retention.
