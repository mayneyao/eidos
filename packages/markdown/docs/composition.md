# Composing an editor

The `/build` workbench creates an explicit plugin composition and generates the
same configuration used by its live editor. It does not execute generated source
code. The preview and the generated module both call `createMarkdownPreset`.

```tsx
import { createMarkdownPreset, MarkdownEditor } from "@eidos.space/markdown"
import { gfmPreset } from "@eidos.space/markdown/presets"
import { wikilinkPlugin } from "@eidos.space/markdown/plugins"

const preset = createMarkdownPreset({
  id: "my-app.markdown",
  extends: gfmPreset,
  plugins: [wikilinkPlugin],
})
```

This is GFM plus wiki links, not the Obsidian preset. Equations, callouts,
embeds and tags are not implicitly enabled. `onOpenInternalLink` receives
`path`, `heading`, `blockId` and the source document identity. Your host resolves
the path and opens the document; the editor does not own a vault, file index,
router or backlink graph. Selecting a wiki link does not require those systems
inside the package. Loading embedded content is a separate capability.

Use `commonmarkPreset` instead when GFM extensions are unnecessary. There is no
need to construct a custom codec or profile for either combination.

Pass this object as `preset` to `MarkdownEditor`, alongside `documentKey`,
`markdown`, and `onMarkdownChange`. `profile` remains a compatible alternative;
do not pass both. `plugins` cannot be passed together with either form.

Presets inherit plugin descriptors, not another preset's codec. A custom codec
continues to use `defineMarkdownProfile`; it must not be used as an inherited
parser expecting its codec to be retained. `exclude` removes exact plugin IDs.
Missing dependencies, unknown removals, and conflicting definitions are errors.
Define preset objects outside renders or memoize them.

Composable presets do not infer a document dialect from plugin IDs or feature
namespaces. Explicit grammar and capabilities determine interpretation. Legacy
profile entry points retain their defaults for existing integrations.

## Available granular extensions

GFM tables, task lists, strikethrough, automatic links and tag filtering have
independent plugin exports. Equations, footnotes, frontmatter, highlight, images,
and safe HTML can be added or removed separately. CommonMark now has independent
`paragraphPlugin`, `headingPlugin`, `quotePlugin`, `listPlugin`, `codeBlockPlugin`,
`inlineCodePlugin`, `emphasisPlugin`, `linkPlugin`, and `thematicBreakPlugin`
exports from `/plugins`. `minimalPreset` from `/presets` starts with paragraphs
and source editing; add only the syntax you need. Task lists require `listPlugin`,
not the whole CommonMark bundle. The legacy `commonmarkPlugin` remains supported
but cannot be mixed with its granular members. The Builder exposes these base
syntax switches and a Minimal starting point. Selecting task lists enables Lists;
reference links enable Links. These dependencies are visible and cannot be
removed until the dependent option is disabled. Wiki links, embeds, tags,
comments, block identifiers and inline footnotes are independently selectable.
Callouts, attachment dimensions and Vault-relative links are separate plugins
too. The Builder's Obsidian starting point resolves to the same plugin set as
the public `obsidianPreset`; further changes become a custom composition.

Each grammar contribution contains its micromark syntax, mdast conversion, and
HTML preview extensions. The compiled grammar is used for document analysis,
inline semantics and nested semantic previews. An explicit empty grammar means
CommonMark; it does not imply GFM. HTML sanitization is always enforced after
preview rendering. GFM tag filtering does not replace sanitization.

For granular CommonMark ownership, `grammar.commonmark` declares the micromark
constructs owned by a plugin. These lists are unioned; once any plugin declares
one (including an empty list), unselected constructs are disabled in the parser
and HTML previews. Escapes, entities and line endings remain core. An omitted
`commonmark` field retains the complete legacy CommonMark grammar only when no
plugin declares it. This is different from `commonmark: []` (text-only).

## Source and host responsibilities

Syntax and interaction choices are independent. Pass `interactions` with any of
`toolbar`, `insertMenu`, `blockDrag`, and `blockSelection` set to `true` or `false`.
The Builder exposes each switch and emits the same object in its React example.
Disabling insertion menus removes both the plus button and slash interception;
disabling block selection does not disable native text selection. Formatting
shortcuts and list-item movement remain separate shortcut capabilities.
For compatibility, omitted toolbar/menu/drag values inherit `showToolbar`
(default `true`); omitted block selection defaults to `true`. Explicit values
override these defaults. Read-only mode still suppresses editing controls.

Changing configuration starts a new editor session and undo history without
replacing the controlled Markdown. Codec exports may normalize syntax; the
editor's document session preserves unchanged original source. Unsupported
constructs can remain literal Markdown or source-editable fallback blocks.

The workbench only shares a versioned configuration, never the document body.
Version 2 records base syntax explicitly. Version 1 links are migrated with their
previous implicit CommonMark base intact, rather than silently disabling it.
Unknown versions and plugin IDs are rejected. Loading an example is explicit and
offers draft restoration. Images require host `onPasteImage` / `resolveImageUrl`
callbacks for storage; selecting an image plugin does not implement a backend.

This is a pre-release workspace package. Generated code requires the built
package artifact or workspace dependency; npm publication is separate.

## Composing wiki links

`wikilinkPlugin` is available from `@eidos.space/markdown/plugins` and in the
Builder's note connections group. It supports `[[Note]]` links independently of embeds,
tags, and other vault syntax. It can be combined with the standard math,
footnote, and frontmatter plugins without changing their semantics. Link
navigation remains a host responsibility. Do not combine it with the legacy
`obsidianSyntaxPlugin` bundle, which already owns wiki links.

`obsidianPreset` composes independent plugins over `eidosPreset`. The legacy
`obsidianSyntaxPlugin` and `obsidianMarkdownProfile` remain supported but are not
used by the Builder. This is syntax compatibility, not the Obsidian application.

Relative Markdown paths are handled by `linkPlugin`, including in CommonMark
and GFM. `vaultLinkPlugin` remains a compatibility descriptor requiring
`linkPlugin`; new integrations do not need it.

`calloutPlugin` requires `quotePlugin`; `attachmentPlugin` requires `imagePlugin`.
Builder derives these dependencies from
the plugin declarations and disables removal of a required capability while its
dependent remains selected. Hover the disabled control to see its dependents.

The same `/plugins` entry exports `embedPlugin`, `tagPlugin`, `commentPlugin`,
`blockIdPlugin`, and `inlineFootnotePlugin`. Each can be added to `minimalPreset`
without enabling the others. Embeds identify host-resolved targets; selecting
them does not add filesystem access. These descriptors currently share the
node/view infrastructure. Their scanners and exporters now live in the feature
package and register through `inlineSyntax`, rather than central dialect branches.
Adding a Vault inline plugin does not enable attachment-size syntax in ordinary
Markdown images: image alt text is preserved unless that capability is enabled.

## Download a runnable project

The workbench's **Download project** action exports a React/Vite project with
the selected configuration, integration files, and the Markdown package tarball
from the same site build as the preview. It does not include the draft document.
Unzip it, run `pnpm install`, then `pnpm dev` using Node.js 22.12 or newer.
`pnpm build` runs strict TypeScript checking before the production build.
The archive is not an offline dependency cache: installation still fetches React,
Vite, and transitive dependencies. No npm publication is required to try it.

With images enabled, **Local OPFS image storage** adds a complete host adapter
to both the preview and generated files. Pasted images stay in browser storage;
Markdown stores stable `opfs://` addresses while rendering uses temporary blob
URLs. This requires a secure context (HTTPS or localhost). OPFS is scoped to the
browser origin, is not a backup or cross-device storage, and is not included in
the project download. Replace the adapter for durable or shared documents.
The example keeps Markdown in React state only; persist it separately.
