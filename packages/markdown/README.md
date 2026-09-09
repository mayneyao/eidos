# @eidos.space/markdown

A React Markdown editor with block-based interactions, source-aware editing,
and composable syntax plugins. Markdown is the persisted document, not an
export format.

**Status: internal, pre-release.** Development prioritizes the editor used by
Eidos hosts. Existing presets, plugins and examples remain available, but a
general-purpose framework launch is not the current goal. The package is private
in this workspace and has not been published through this project's release
workflow. See the [refactor scope](./architecture/DELIVERY.md).

## Getting started

### Static HTML (no editor runtime)

```ts
import { renderMarkdownToHtml } from "@eidos.space/markdown/static"

const html = renderMarkdownToHtml("# Notes\n\n- [x] Published")
```

This synchronous entry returns an HTML fragment and runs in Node, Workers, or a
browser without React, Lexical, or DOM globals. Wrap the result in an element
with `class="eme-static"` and include `@eidos.space/markdown/static.css`. That
standalone stylesheet shares theme variables and core typography with the editor;
it requires no JavaScript or additional CSS imports. Hosts own the page shell,
title, language, attachment URL rewriting, and serving policy.

The default `eidosSyntax` uses the same extension manifest as `eidosPreset`:
CommonMark/GFM, footnotes, inline/display math, highlights, YAML properties,
callouts, wikilinks, tags, comments, block IDs, inline notes and image dimensions.
Pass `{ syntax: gfmSyntax }` for an explicit GFM-only document. Both profiles are
exported from `/static` without importing editor code.

Syntax ownership lives in `src/syntax`; feature scanners and semantic parsers
live alongside their features, separately from Lexical node adapters. The editor
and static renderer share GFM/footnote grammar, vault-inline scanning and precedence,
math scanning/MathML rendering, callout parsing, frontmatter boundaries and values,
image dimensions, heading matching and the HTML element policy. Contract tests
compare the composed grammars and require coverage for every extension owner.
Add a syntax owner to the shared manifest and supply both adapters; never add a
second list of enabled syntax in a host.

Static presentation intentionally omits editing controls. Comments are hidden,
callout folding uses native `details`, and code blocks need no client JavaScript.
Wiki embeds remain literal, matching the editor's unsupported-source behavior.
Same-document heading/block links work locally. Cross-document wikilinks display
their labels and require `resolveInternalLink(target)` to return a published URL;
without a mapping they are non-interactive. No local document is implicitly
published or fetched. Safe raw HTML is sanitized, while active HTML falls back to
escaped source. No source CSS, event handlers or executable URL schemes survive.

The low-level `grammar` option retains grammar-only rendering for existing
consumers; it does not enable Eidos semantics. Grammar implementations and HTML
extensions are trusted application code, never untrusted document input.

### Interactive editor

The component requires React 18 or 19 and a browser DOM. TypeScript consumers
need TypeScript 5.2 or newer and `ESNext.Disposable` in `compilerOptions.lib`
(alongside their DOM and ECMAScript libraries) for Lexical's public types.

Import the component and its stylesheet from the public package entry points:

```tsx
import { useState } from "react"
import { MarkdownEditor } from "@eidos.space/markdown"
import { eidosPreset } from "@eidos.space/markdown/presets"
import "@eidos.space/markdown/styles.css"

export function Notes() {
  const [markdown, setMarkdown] = useState("# Notes\n\nStart writing.")

  return (
    <MarkdownEditor
      documentKey="notes"
      preset={eidosPreset}
      markdown={markdown}
      onMarkdownChange={setMarkdown}
    />
  )
}
```

The host owns persistence, image storage, and navigation. The editor does not
require Eidos File, a filesystem, or an account. Use `layout="embedded"` when
your application owns the reading width, and `layout="document"` for a
standalone document surface.

Hosts can pass `navigationTarget.textSearch` with an original Markdown
`start`/`end` range, `query`, and a new `requestId` for each navigation. Ordinary
literal text is mapped through source blocks and parser text spans, then
highlighted briefly without changing the document. Ambiguous projections and
source-only matches call `onTextSearchUnavailable`; the host can open its source
editor at the original range. No approximate rich-text location is claimed.

## What it provides

- Rich-text editing, cross-block text selection, and separate block selection.
- Searchable insertion menus, block reordering, and configurable shortcuts.
- Inline equations and footnotes; block images, equations, tables, and code.
- Selected-block Markdown source editing with apply, cancel, and undo.
- Controlled values, draft-conflict handling, and asynchronous image callbacks.
- Plugins contributing syntax, nodes, behaviors, commands, and presentation.

Choose a **preset** through the `profile` prop: **GFM** for CommonMark and all
five GFM extension families, **Eidos** (default) for document properties,
footnotes, equations and highlights, or experimental **Obsidian** for vault
conventions. Presets share one editor; they do not imply compatibility with
every Markdown dialect or every application feature.

Source preservation is a contract with limits, not a blanket lossless claim:
untouched source, edited blocks, normalized line endings, and unsupported
syntax have different rules. See the specification and compatibility matrix
before relying on a particular round trip.

## Documentation

The [Chinese documentation](./docs/zh/getting-started.md) covers integration, interactions and
plugin development. Chinese API and specification guides are informative;
the complete English references remain authoritative.

| Document                                    | Responsibility                                                   |
| ------------------------------------------- | ---------------------------------------------------------------- |
| [API reference](./API.md)                   | Component props, callbacks, public exports, and plugin contracts |
| [Editor guide](./docs/editor-guide.md)      | Existing interactions and host integration behavior              |
| [Specifications](./specs/README.md)         | Document semantics, fidelity, and interaction contracts          |
| [Presets](./docs/presets.md)                | GFM, Eidos and Obsidian syntax coverage and switching contracts  |
| [Architecture](./architecture/README.md)    | Implementation ownership and dependency boundaries               |
| [Delivery plan](./architecture/DELIVERY.md) | General-purpose package and documentation-site work still to do  |

Consumers use `@eidos.space/markdown`, `@eidos.space/markdown/plugin-api`,
`@eidos.space/markdown/plugins`, and `@eidos.space/markdown/styles.css`.
Imports from `src/` or generated internal chunks are not public APIs.

## Development

From the repository root:

```sh
pnpm --filter @eidos.space/markdown test
pnpm --filter @eidos.space/markdown typecheck
pnpm --filter @eidos.space/markdown build
pnpm --filter @eidos.space/markdown test:package
pnpm dev:markdown-editor-playground
```

Tests live beside the behavior they verify. The site’s development server can
use source aliases for live updates; its production build must use the package
artifact, just as an external consumer would.

`test:package` installs a tarball in a temporary directory outside the workspace,
checks its public declarations without `skipLibCheck`, exercises a consumer-owned
grammar, and builds a minimal React application. It needs registry access
(or a populated cache with `node scripts/test-package.mjs --offline` after a build).
The temporary application is retained at the printed path for inspection.
Its React, TypeScript and Vite versions are pinned to the installed development
toolchain for repeatability; dependencies are installed independently, not linked
from the workspace. This smoke check does not certify every supported peer version.
