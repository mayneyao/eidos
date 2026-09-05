# Writing a plugin

A plugin packages one feature's grammar, node definitions, editing behavior,
insertion commands and presentation. The editor owns the session, history and
selection lifecycle. Your application owns storage and navigation.

The plugin API is a prerelease. Top-level block grammars are extensible today;
nested container grammars still need codec support. Not every built-in feature
has finished moving out of the shared implementation.

## Start with composition

```tsx
import { MarkdownEditor } from "@eidos.space/markdown"
import { commonmarkPlugin, gfmPlugin } from "@eidos.space/markdown/plugins"
import "@eidos.space/markdown/styles.css"

const plugins = [commonmarkPlugin, gfmPlugin]

// Pass stable plugins alongside the controlled Markdown value.
<MarkdownEditor
  documentKey="notes"
  markdown={markdown}
  onMarkdownChange={setMarkdown}
  plugins={plugins}
/>
```

Omitted syntax is not silently enabled. Unsupported source may remain a
source-preserving fallback. The GFM plugin requires the CommonMark plugin.
Do not pass both `plugins` and `profile`.

## What belongs in a feature

| Part       | Responsibility                                                      |
| ---------- | ------------------------------------------------------------------- |
| Grammar    | Recognize owned source ranges and import/export them                |
| Nodes      | Data model, serialization and node presentation                     |
| Behaviors  | Register commands and event lifecycles, with cleanup                |
| Insertions | Supply catalog metadata and an executable insertion action          |
| Styles     | Scoped presentation without changing a host's global elements       |
| Tests      | Parsing, editing, round trip, disabled behavior and malformed input |

Descriptors are immutable session configuration. Use namespaced IDs and bump
the plugin version when its implementation changes. Replacing the compiled
plugin configuration creates a new editor session; it is not a live mutation
of Lexical's node registry.

## Compose nested inline parsing

A `transformers` contribution can provide `configure(transformers)` alongside
its `transformer` and `order`. The compiler calls it with the ordered, unbound
contributions of the selected plugins. Return a fresh transformer; do not mutate
the frozen input or shared definitions. This is a single binding pass, not a
recursive dependency resolver. Generated semantic export adapters are not part
of this input.

The table plugin uses this hook to parse cells with only the selected
`text-format` and `text-match` transformers. Adding a table must not implicitly
enable emphasis or links, or require nodes from an unselected plugin.

## Add a block grammar

`blockSyntax` contributes `scan`, `import` and `export`. The scanner returns
half-open ranges covering whole lines in normalized source. The importer runs
inside a Lexical update and returns one detached, registered block node.
Return `null` from the exporter for nodes your grammar does not own.

To extend an existing block, provide `matchParsedBlock(block, options)` instead
of (or alongside) `scan`. It receives a complete root-level block with `type`,
`source`, and half-open `start`/`end` offsets into the normalized body. Return
`true` to own that entire block. For example, `calloutPlugin` matches a
`blockquote` whose source starts with a callout marker. Nested blocks are not
offered independently, and scanners still cannot start in protected containers.
Both hooks share overlap validation: two owners claiming the same block are an
error. A contribution must provide at least one recognizer. Import/export and
node validation are identical for both paths.

Callout rendering uses the plugin's imported preview and selected grammar; the
view does not reparse with an implicit GFM preset.

The isolated package-consumer fixture implements `:::note` with these hooks.
It imports only public entry points, edits the node, exports the changed
Markdown, and builds a React application from the packed artifact. See
[the executable fixture](../../../packages/markdown/tests/consumer/note-plugin.ts)
and [its round-trip check](../../../packages/markdown/tests/consumer/smoke.mjs).

## Reuse the interaction system

Insertion actions receive helpers for block and inline insertion, retained
selection anchors, menu dismissal, focus and a small text-request form. Use
these helpers so your plugin participates in shared undo and selection behavior.
Declare shortcuts through the registry, not global keyboard listeners.

CommonMark and GFM now register their own editing behaviors. Copying capability
IDs does not automatically install those behaviors. Include the owning plugin
or explicitly provide a behavior implementation.

The [API reference](../API.md) defines every contribution and its constraints.
The [architecture notes](../architecture/README.md) describe what remains in the
shared implementation; they are not a second syntax specification.

## Custom inline syntax

Plugins may declare `inlineSyntax` alongside `nodes` and `grammar`. Each
`MarkdownInlineSyntax` has a namespaced `id`, a `scan(source, context)` function
returning half-open source ranges, an `import(source, options)` function creating
one detached inline Lexical node, and `export(node)` returning Markdown or
`null` when the node is not owned by this syntax. An empty export is valid.

The scanner receives protected ranges and analysis options. Matches intersecting
code, HTML, Markdown links/images, or already-owned semantic ranges are ignored.
Invalid ranges and overlaps between custom inline grammars are errors, not
implicit registration-order precedence. Plugins implement their own delimiter
escaping rules. Import runs inside a Lexical update. Returned blocks or attached
nodes are rejected. Exporters are registered before built-in inline exporters.

Set `capturesContent: true` for a whole-token grammar such as a comment or wiki
alias. These captures run before inner semantic replacements, so `$x$` inside a
comment is not separately imported as math. AST-protected code, HTML and links
remain protected. Captures protect their ranges from ordinary inline scanners;
overlapping captures remain errors.

`createMarkdownPreset` and `MarkdownEditor` pass the resolved registry through
to inline import, including rich list items. Removing the plugin removes this
interpretation without requiring a central feature flag. Input shortcuts remain
separate behavior/transformer contributions. HTML previews of source-editable
containers still require the plugin's matching `grammar` preview extension;
`inlineSyntax` alone does not add an HTML renderer.

The built-in `mathPlugin` uses this same interface for `$…$` equations and
`blockSyntax` for display equations. Inline recognition/import/export live in
the feature, not in a preset-specific importer. The direct legacy EFM codec
retains its default math registration; composed presets use only their explicit
registry.
