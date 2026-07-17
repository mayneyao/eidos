# `@eidos.space/extension-cli`

Developer tools for Eidos file-based extensions. The CLI creates source-only
packages and validates them with the same strict package inspector and fixed
compiler used by Eidos Desktop.

```bash
eidos-extension init example.hello-tools --template command
eidos-extension init example.task-cards --template eidos-file-view
eidos-extension init example.notes-editor --template text-editor \
  --pattern "**/*.notes.md"
eidos-extension check example.notes-editor --host-version 0.33.0
eidos-extension check example.notes-editor --host-version 0.33.0 --json
```

`init` refuses to overwrite an existing package directory. `check` does not
execute extension code, discover package-manager configuration, install
dependencies, or run lifecycle scripts. It inspects one immutable in-memory
snapshot, performs strict TypeScript checking against the public Eidos SDK,
and compiles declared worker and UI entrypoints with the production compiler.
Compiler warnings fail the check.

During the developer preview this package is built from the Eidos monorepo. It
is prepared for a later public npm release but should not be documented as
published until that release exists.

Maintainers can verify the packed package graph from an isolated consumer with
`pnpm smoke:extension-tooling` at the Eidos repository root. The gate installs
only tarballs for Eidos-owned dependencies and disables lifecycle scripts.
