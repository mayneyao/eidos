# Editor composition contract

1. A preset resolves exactly one ordered, validated plugin set. Dependencies,
   conflicts and duplicate contributions must be validated before mounting.
2. Parser, semantic import, preview and export contributions must belong to the
   selected syntax owners. Disabling UI alone is not disabling a syntax.
3. Explicit grammar composition must not implicitly enable GFM extensions.
   Legacy codec defaults may remain supported through legacy entry points.
4. A preset inherited through `createMarkdownPreset` contributes its plugins,
   not a second codec. Custom codec profiles are a separate advanced API.
5. Core HTML sanitization cannot be disabled by configuration. A parser's HTML
   extension does not authorize active HTML execution.
6. Editor reconfiguration preserves controlled source and resets session-scoped
   registration and undo history. It must not emit an edit solely to normalize
   unchanged source.
7. Configuration sharing carries versioned, validated data, never executable
   JavaScript or the user's document by default.
8. Generated modules use public package imports and the same resolved plugin
   set as the preview. They must be verified against a built package, not only
   repository source aliases.
9. A modified standard preset must be identified as custom rather than claiming
   full conformance with that standard.
10. Toolbar, insertion menus, block drag controls and block selection must be
    independently configurable without changing document syntax. Disabled menus
    must not intercept slash input. Disabled block selection must not disable
    native text selection. Runtime changes must unregister disabled behaviors.
11. Explicit CommonMark construct declarations are additive across syntax owners.
    Once enabled, undeclared configurable constructs must be disabled in both
    AST parsing and HTML preview generation, including nested content. Legacy
    grammars without any declaration retain their complete CommonMark defaults.
12. Adding an extension must not replace independently selected syntax owners
    merely because it belongs to another dialect. In particular, Vault inline
    syntax must not disable standard equations, footnotes or frontmatter, or
    reinterpret ordinary image alt text as attachment dimensions without the
    attachment capability being selected.
13. Inline syntax contributions must have unique namespaced identities and valid
    half-open source ranges. Protected content cannot be claimed by a custom
    scanner. Overlapping custom matches are errors. Import must create one
    detached inline node; export must return null for unowned nodes. Resolved
    inline contributions must reach both preset and editor import paths.
14. Parsed-block recognizers may claim only complete root-level blocks produced
    by the selected grammar. They must not cause nested blocks to become root
    siblings. Raw scanners retain their protected-container boundary. Matches
    from both paths share conflict validation, and each block contribution must
    provide at least one recognition path. Semantic views must use the selected
    grammar rather than reparse with an implicit preset.
15. Native text formatting is enabled by the resolved text-format transformers,
    not by the presence of toolbar buttons. HTML and Lexical clipboard imports
    must not introduce native text formats without a matching transformer;
    unsupported formatting is removed while its text is retained. Custom
    semantic inline nodes remain owned by their registered plugins.

16. Nested inline conversion must use the composition's selected transformers,
    not a library-wide default. Transformer contributions may provide a pure
    `configure` function which receives the frozen, ordered unbound transformer
    definitions and returns a session-local transformer. Binding must not mutate
    shared definitions or leak capabilities between compositions.

Grammar-family examples are illustrative. A full standard-conformance claim
requires its corresponding conformance suite, not only selected examples.
