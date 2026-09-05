# Markdown editor refactor closeout

Status: complete for the reduced Eidos editor refactor scope, 2026-09-05.

## Scope

Finish the existing Markdown editor refactor, not a general-purpose framework
launch. Keep the current editor, supported syntax, source-preserving edits,
block interactions, embedding and Eidos host integrations working.

Retain the package name, existing preset/plugin APIs and working examples.
Do not force hosts onto a new integration model or delete working features merely
to reduce scope. The site and Builder remain development/reference tools, not
a separate product whose expansion blocks this refactor.

Independent npm publication, a new site deployment, third-party grammar
universality, more dialects, framework bindings, a plugin marketplace and new
performance targets are not acceptance requirements for this task.

## Implementation boundaries

| Area                                      | Responsibility                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------- |
| `src/editor`                              | React assembly, editor configuration and host callbacks                     |
| `src/core`                                | Document sessions, source ranges, transactions and shared safety            |
| `src/markdown`                            | Markdown analysis, conversion and source preservation                       |
| `src/nodes`                               | Serializable node data and Lexical node lifecycle/update logic              |
| `src/ui`                                  | Shared rendering, previews, controls and editor context                     |
| `src/features`                            | Existing syntax-specific grammar, insertions and behavior contributions     |
| `src/plugins`                             | Editor-wide interactions: selection, insertion, clipboard and shortcuts     |
| `src/plugin-system`, `src/profile-system` | Compile and select existing configurations                                  |
| Eidos hosts                               | Persistence, attachment storage, link resolution/navigation and host layout |

Shared built-in semantic data and rendering dispatch are intentional for the
current Eidos editor. Splitting every built-in into a fully independent
third-party extension is not a completion criterion. Extract modules when it
clarifies an existing responsibility, not to anticipate hypothetical consumers.

## Closeout checks

- [x] Record the reduced scope and stop the framework-product delivery roadmap.
- [x] Separate semantic data, Lexical node definitions and React preview views.
      Keep node types, serialized data, source spelling and existing imports
      compatible. Inline math commits remain Lexical transactions in the node
      adapter; preview components receive a save callback.
- [x] Retain current host props and storage/navigation boundaries; no forced
      profile/preset migration.
- [x] Run package tests/typecheck and the complete browser interaction suite.
- [x] Run focused Eidos Lite Markdown integration tests and host typecheck.
- [x] Record results and remaining known limitations; end the refactor task.

Specs describe observable behavior; API docs describe integration; this document
describes implementation scope and verification. CommonMark/GFM remain external
standards. Syntax support, visual editing and source fidelity are distinct
claims, not a blanket promise of losslessness.

## Known limitations retained

- Legacy and composed codecs still share parts of `efm-document.ts`; built-in
  semantic views and complex insertion composers are not fully independent.
- Source fidelity is defined for documented edit paths, not arbitrary
  byte-for-byte round trips of every input.
- Existing codec benchmarks and package-consumer checks are useful evidence,
  not a browser performance SLA or a guarantee for every React/toolchain version.
- Existing build warnings for CSS `::highlight()` minification and bundle size
  are not resolved by this responsibility-only refactor.
- No commit, deployment or npm publication is implied by closing this task.

## Verification

The final local checkpoint passes:

- Package unit/integration tests: 277 tests in 42 files.
- Playground/site unit tests: 30 tests in 7 files.
- Complete production-browser suite: 86 tests, including editor interactions,
  standalone/embedded layout, menus, source editing, syntax and retained demos.
- Eidos Lite Markdown tests: 36 tests in 8 files, run through
  `scripts/run-electron-node.mjs`, covering editor adapters, attachments, previews,
  file editing and note resolution. This is not Electron UI verification.
- Package, playground and Eidos Lite TypeScript checks.
- Focused Oxlint and Oxfmt checks for the extracted modules; `git diff --check`.
- `pnpm build:eidos-lite:dev`: renderer/main/preload build, staging environment
  and Electron output checks, and unsigned local macOS arm64 development package.

No Electron UI window was launched for this checkpoint. No commit, remote
deployment or package publication was performed. Existing minifier/chunk warnings
remain as noted above; the build and test commands completed successfully.
