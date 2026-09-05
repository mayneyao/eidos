# Behavioral specifications

Specifications describe observable guarantees, not code organization. Passing
conformance tests is evidence of implementation; a written requirement alone is
not evidence that it is implemented.

## Current contracts

- [Editor behavior](../SPEC.md): editing, selection, history, source editing,
  resource policies and plugin contracts. This working draft originated with
  the Eidos profile and is being separated into general and profile-specific
  requirements; EFM-specific clauses must not be treated as universal Markdown.
- [Obsidian compatibility](../OBSIDIAN-COMPATIBILITY.md): supported and partial
  behavior of the experimental profile, not compatibility with the Obsidian app.

Do not duplicate CommonMark/GFM grammar in editor documentation. General editor
contracts apply across presets; syntax spelling and interpretation belong to the
selected grammar or profile. A feature's implementation details belong in
`architecture/` or beside its code, not in a normative clause.

## Evidence categories

Each supported feature needs separate evidence for parsing, visual editing,
serialization, untouched-source preservation, and relevant user interaction.
For extension plugins, include removal/disablement and unsupported-source cases.
For host integration, include independent containers and multiple editors.

The [refactor closeout](../architecture/DELIVERY.md) tracks Eidos editor validation,
not a general-purpose framework release. This index does not replace the existing
contract or relax supported editor behavior.
