# Implementation architecture

This directory explains implementation structure and decisions. It is not the
behavioral specification or the public API reference.

- [Eidos editor refactor scope and closeout](./DELIVERY.md)
- [Behavioral contracts](../specs/README.md)
- [Public integration API](../API.md)

## Dependency direction

Eidos hosts and the playground consume package entry points. React assembly
consumes the plugin registry, interactions and feature contributions. Features
depend on core contracts; core and generic interactions must not depend on
specific feature implementations. Lexical integration is explicit in the advanced
plugin API, not a prerequisite for ordinary React consumers.

## Current state versus target

`src/core` owns the document session and neutral analysis/source-range contracts.
`src/plugin-system` compiles immutable contributions; `src/profile-system` selects
one codec and plugin set. `src/features` is the target home for vertically owned
features. `src/plugins` contains editor-wide behavior; it is not another syntax
registry. `src/nodes/efm-semantic-data.ts` describes serialized built-in data;
`efm-semantic-node.tsx` owns Lexical node lifecycle and updates;
`src/ui/efm-semantic-view.tsx` owns shared previews. Views receive an inline-math
save callback instead of importing node classes or starting Lexical updates.

CommonMark's granular plugins own their grammar constructs, transformer objects,
toolbar items, insertion factories and behavior registrations directly. The
legacy `commonmarkPlugin` aggregates these descriptors for compatibility; granular
owners must not select capabilities by filtering a bundle's order numbers or
localized labels. Display order and copy are presentation, not ownership keys.

Block extensions can either scan new delimiters or claim a complete parsed
root block through `matchParsedBlock`. Callouts use the latter: their feature
owns recognition, import metadata, preview generation and export. Their view
consumes the imported preview instead of reparsing with GFM. Generic block
matching does not change raw scanner protection or lift nested content into
root-level siblings. Legacy direct-codec callout dispatch is retained only for
compatibility; composed presets use the registry.

The editor is not being delivered as a universal extension framework.
`markdown/efm-document.ts`, built-in semantic data and shared previews retain
explicit syntax dispatch, and the insertion host retains complex composers.
These are accepted internal implementation boundaries for Eidos, not proof of
fully independent third-party syntax ownership. Further extraction should serve
a concrete maintenance need rather than block completion of this refactor.

Source fidelity currently combines source-range commits with canonical-text
alignment. Stable mapping across repeated content and structural edits needs
additional evidence; the implementation does not justify an unrestricted
byte-for-byte round-trip promise.

Tests stay beside the module they verify. Compatibility fixtures and benchmarks
belong to the package. Website documentation consumes the same public interfaces
as external users, with development-only aliases permitted for hot reloading.
