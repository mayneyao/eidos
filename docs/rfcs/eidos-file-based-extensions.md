# RFC: File-Based Extensions for Eidos Spaces

Status: Draft, v1 contract frozen; P2b developer preview implemented
Date: 2026-07-09
Last updated: 2026-07-15
Owner: Eidos
Related:

- `eidos-space-base-storage.md`
- `eidos-base-file-format.md`
- `eidos-space-markdown-runtime.md`
- `eidos-graft-space-versioning.md`

## Implementation Status (2026-07-15)

The storage, manifest, trust, delivery, and minimal Worker boundaries in this
RFC are frozen through P2b. The development tree now implements strict
package inspection, bounded change watching, symlink-safe host discovery,
Extension Manager diagnostics, and inline creation of real local package files.
Structurally valid packages are shown as `Untrusted`, not `Ready`; disabled and
enabled states now become reachable through the P2a local-state slice. Trust,
enablement, and individual capability grants are persisted by the independent
`@eidos.space/extension-state` package and keyed to the exact package ID,
content digest, and permission hash. Created source is visible through the
existing Version Changes boundary while private cache staging and
`.eidos/state/extensions.sqlite3` remain ignored.

The P2b developer preview compiles the exact inspected in-memory snapshot with
a fixed Rollup/Oxc compiler, lazily runs each enabled package in a Web Worker
inside a hidden sandboxed Electron renderer and isolated session, and exposes
only declared commands/menus, bounded read-only text access, and host-rendered
notice, confirm, and select UI. Every capability call revalidates the source
digest, permission hash, trust, enablement, and exact grant. Source or local
state changes terminate the active runtime; activation/invocation timeouts,
renderer crashes, stale generations, undeclared commands, and private paths fail
closed. The Markdown Task Counter is wired into the command palette and
file-context menu. GitHub installation, network/write capabilities, and custom iframe
document surfaces remain future phases.

Existing bundled and database-backed extensions remain compatibility paths.

## Summary

Eidos extensions should move toward a file-based source model in file-based workspaces.

The canonical source for user/space extensions should live in the Space as ordinary files:

```txt
my-space/
  .eidos/
    extensions/
      example.kanban-view/
        extension.json
        src/
          extension.ts
          view.tsx
        assets/

    cache/
      extensions/

    state/
      extensions.sqlite3
```

The split is:

- `.eidos/extensions/**` is Eidos-owned extension source and should be tracked by graft.
- `.eidos/cache/**`, `.eidos/state/**`, `.eidos/sessions/**`, and `.eidos/indexes/**` are private runtime state and should be ignored by graft.

This keeps the Space mental model consistent:

```txt
.md            documents
.base          structured data
.eidos/extensions/** programmable behavior
.eidos/cache/**      private runtime/cache state
.graft/**      versioning metadata
```

## Motivation

The current Eidos extension mechanism already has a file-like surface. Extensions appear in the sidebar under a virtual path such as:

```txt
~/.eidos/__EXTENSIONS__/<slug>.ts
~/.eidos/__EXTENSIONS__/<slug>.tsx
```

But this is a projection over the `eidos__extensions` table. The source code, compiled code, metadata, enabled state, bindings, and marketplace IDs all live in the workspace database.

That model is convenient for a database-native app, but it conflicts with the file-based direction:

- extension source is user/developer authored content,
- extension source can define how a space behaves,
- extension source should be readable outside Eidos,
- extension source should be diffable, reviewable, copied, and versioned,
- extension source should not be hidden inside an opaque `.eidos/db.sqlite3` row.

The `.github/workflows` model is the useful analogy: files live in an app-specific hidden namespace, but they are still project-owned source files. Hiddenness prevents root namespace collisions; it does not decide whether content is versioned user state.

If a user opens a Space with custom table views, file handlers, folder handlers, or actions, those definitions should be part of the visible Space state.

## Goals

- Make user/space extension source file-based.
- Track extension source with graft by default.
- Keep generated, local, secret, and runtime extension state under `.eidos/`.
- Preserve the current extension concepts: script extensions, block extensions, table views, file handlers, folder handlers, UDFs, tools, and actions.
- Support future marketplace extensions without making downloaded build artifacts canonical user state.
- Make extension changes appear in the Changes UI as normal path changes.
- Add an explicit trust boundary before running extension code from a Space.

## Non-Goals

- This RFC does not define a full extension marketplace.
- This RFC does not define a complete sandbox implementation.
- This RFC does not require immediately removing `eidos__extensions`.
- This RFC does not require all built-in extensions to become Space files.
- This RFC does not make extension runtime caches portable.

## Current Implementation Snapshot

The current model stores extensions in `eidos__extensions`:

```txt
id
slug
name
description
type
version
code
ts_code
meta
icon
marketplace_id
enabled
bindings
created_at
updated_at
```

The virtual file system maps that table into:

```txt
~/.eidos/__EXTENSIONS__/<slug>.ts
~/.eidos/__EXTENSIONS__/<slug>.tsx
```

This gives the UI a file tree, but the source of truth is still the database row.

The target model should invert that:

```txt
.eidos/extensions/<publisher.name>/src/**         canonical source
.eidos/extensions/<publisher.name>/extension.json canonical manifest
.eidos/cache/extensions/**               generated build output
.eidos/state/extensions.sqlite3          local/private runtime state
```

## Directory Layout

Recommended default layout:

```txt
my-space/
  .eidos/
    extensions/
      example.todo-actions/
        extension.json
        src/
          extension.ts

      example.markdown-task-counter/
        extension.json
        src/
          extension.ts

    cache/
      extensions/

    state/
      extensions.sqlite3

    secrets.sqlite3
```

Version 1 uses the fixed directory `.eidos/extensions/<publisher.name>/`.
Configurable roots and flat-file packages are deliberately unsupported because a
stable package root is required for discovery, identity conflicts, content
digests, Graft diffs, and GitHub installation.

## Extension Manifest

Each extension folder includes an `extension.json` manifest. The canonical
machine-readable contract is
`apps/docs/public/schemas/extension-manifest.schema.json`; this RFC does not
define a second legacy-shaped manifest.

```json
{
  "$schema": "https://docs.eidos.space/schemas/extension-manifest.schema.json",
  "manifestVersion": 1,
  "publisher": "example",
  "name": "markdown-task-counter",
  "displayName": "Markdown Task Counter",
  "version": "0.1.0",
  "engines": { "eidos": ">=0.34.0" },
  "entrypoints": { "worker": "src/extension.ts" },
  "contributes": {
    "commands": [
      {
        "id": "example.markdown-task-counter.count-tasks",
        "title": "Count Markdown tasks"
      }
    ]
  },
  "permissions": {
    "files": { "read": ["**/*.md"], "write": [] },
    "network": []
  }
}
```

The canonical package ID is `${publisher}.${name}`. Contribution IDs belong to
that namespace. Manifest version 1 rejects unknown fields so future additive
capabilities require an explicit contract revision instead of silently changing
the meaning of installed source.

The manifest is portable source state and is tracked by Graft.

The compiled output is not portable source state. It should be rebuilt into `.eidos/cache/extensions/**`.

### Version 1 dependency policy

Version 1 accepts relative imports within the package and imports from the Eidos
extension SDK. Bare third-party package imports, Node.js and Electron built-ins,
non-literal dynamic imports, package-manager lifecycle scripts, and runtime CDN
imports are rejected. A publisher may vendor reviewable source under the package
root and import it relatively.

Eidos never runs `npm install` for an extension. Broader dependency resolution
requires a later manifest version with lock, integrity, license, and build
reproducibility semantics.

### Canonical digests

Version 1 intentionally uses a conservative content digest. It hashes the
normalized relative path and bytes of every installed package file except the
host-managed `extension.lock.json`. Changing a README therefore changes the
content digest and requires review. This is noisier than dependency-graph-only
hashing, but it is explicit and avoids an executable asset being omitted from
the trust boundary.

The canonical algorithm is deliberately implementable outside Eidos:

1. Accept regular files and directories only. Reject symbolic links and special
   files before copying or hashing.
2. Convert each file path relative to the package root to UTF-8 NFC with `/`
   separators. Reject empty, `.`, `..`, NUL, NFC-colliding, and case-folding-
   colliding paths.
3. Exclude exactly the root-level, host-managed `extension.lock.json`. Empty
   directories do not participate.
4. Sort paths by unsigned UTF-8 byte order.
5. Feed SHA-256 one record per file:
   `[u32be pathLength][pathBytes][u64be contentLength][contentBytes]`.
6. Encode the result as `sha256:<lowercase hex>`.

Installers hash the copied staging snapshot, never a changing source directory.
A live Space scan retries when file metadata changes during the scan.

The permission hash is calculated separately from normalized requested
permissions: file-pattern and origin arrays are sorted, the normalized object is
serialized with RFC 8785 JSON Canonicalization Scheme, and the UTF-8 bytes are
hashed as `sha256:<lowercase hex>`. Trust is keyed by package ID, content digest,
and permission hash. Build cache keys additionally include the host runtime ABI.

## State Split

### Tracked Source State

These files are part of the Space and should be tracked:

```txt
.eidos/extensions/<publisher.name>/extension.json
.eidos/extensions/<publisher.name>/extension.lock.json
.eidos/extensions/<publisher.name>/src/**
.eidos/extensions/<publisher.name>/assets/**
.eidos/extensions/<publisher.name>/README.md
```

They answer:

> What behavior does this space define?

### Private Runtime State

These files are Eidos-private and should be ignored:

```txt
.eidos/cache/extensions/**
.eidos/state/extensions.sqlite3
.eidos/sessions/**
.eidos/indexes/**
```

They answer:

> What has this local Eidos instance built, trusted, enabled, or cached?

### Local Secrets

Secrets and sensitive bindings must not be tracked.

Recommended storage:

```txt
.eidos/secrets.sqlite3
.eidos/state/extensions.sqlite3
```

If an extension needs configurable bindings, the manifest may define the schema, but the actual secret values remain local.

## Trust and Security

File-based extensions create an explicit executable-code boundary.

Eidos should not silently execute extension code from a newly opened or newly synced Space. The user should see a trust prompt or extension review state.

Recommended states:

```txt
discovered
trusted
enabled
disabled
blocked
```

Rules:

- A discovered extension is visible but not executable.
- Trust is local user state.
- Enabled/disabled is local by default.
- Permission grants are local by default.
- Any installed package-file change except the host-managed lock file changes
  the version 1 content digest and invalidates trust for that digest.
- Marketplace-installed extensions should be pinned by ID/version or lock metadata.

The implemented local-state format uses separate `trusted_snapshots`,
`snapshot_enablements`, and `permission_grants` tables. Enablement is
snapshot-bound rather than package-bound: trusting a changed package cannot
silently revive the previous snapshot's enabled flag or grants. Revoking trust
cascades to both. The state database is never deleted or recreated when its
application ID or schema version is unknown, because trust decisions are not a
disposable cache.

This is the main reason not to store execution state purely in tracked files.

## Graft Semantics

With the default broad Space tracking rule, extension source appears as normal path changes:

```txt
.eidos/extensions/example.kanban-view/extension.json
.eidos/extensions/example.kanban-view/src/view.tsx
.eidos/extensions/example.kanban-view/assets/icon.svg
```

The Changes UI should show them as file changes first. It does not need extension-specific diff semantics in v1.

Recommended graft classification:

```txt
.eidos/extensions/**/*.ts     text
.eidos/extensions/**/*.tsx    text
.eidos/extensions/**/*.json   text
.eidos/extensions/**/assets/* text | binary by detection
.eidos/cache/extensions/**    ignored
.eidos/state/**               ignored
```

Extension source is tracked because it is user-visible state. Compiled output is ignored because it is generated state.

## Product UX

The file tree may hide `.eidos/` by default while still exposing an "Extensions" product view backed by `.eidos/extensions/**`. Advanced file views may show `.eidos/extensions/` as a normal folder.

The extension manager should present the same extensions as product objects:

```txt
Extensions
  Kanban View
    Source: .eidos/extensions/example.kanban-view/
    Status: trusted, enabled
    Permissions: files read, network denied
```

The extension editor should edit the real source file, not a virtual database projection.

Creating a new extension should create files:

```txt
.eidos/extensions/<publisher.name>/extension.json
.eidos/extensions/<publisher.name>/src/extension.ts
```

Disabling an extension should update local runtime state, not necessarily edit the manifest.

## Relationship to Base

Base files may allow extension-defined view types, actions, or renderers. The Base should reference extension capabilities by stable extension ID and type, not by compiled code.

Example:

```txt
tasks.base
  eidos__views.view_type = "kanban"
  eidos__views.extension_id = "example.kanban-view"

.eidos/extensions/example.kanban-view/
  extension.json
  src/view.tsx
```

This keeps Base data portable while allowing the UI runtime to resolve richer behavior when the extension is present and trusted.

If an extension is missing or untrusted, Eidos should degrade gracefully:

- show the raw table,
- show an unsupported view message,
- allow the user to trust/install the extension,
- avoid corrupting the Base file.

## Built-In Extensions

Built-in Eidos extensions do not need to live in the Space.

They can remain bundled with the app:

```txt
app bundle / built-in registry
```

Only user-authored or space-specific extensions should be created under `.eidos/extensions/**`.

If a user ejects or customizes a built-in extension, Eidos can write a copy into the Space:

```txt
.eidos/extensions/local.<name>/
```

After ejection, that copy becomes user source state and should be tracked.

## Marketplace Extensions

Marketplace extensions are a hybrid:

- source/package identity should be reproducible,
- downloaded code and build output should not become accidental user state,
- trust and permissions should remain explicit.

Each installed package stores provenance beside its source:

```txt
.eidos/extensions/<publisher.name>/extension.lock.json
```

The manifest describes package behavior. The host-managed lock file describes
where the installed snapshot came from:

```json
{
  "lockVersion": 1,
  "source": {
    "kind": "github",
    "repository": "https://github.com/vendor/kanban-view",
    "requested": "refs/tags/v1.2.3",
    "commit": "0123456789abcdef0123456789abcdef01234567"
  },
  "contentDigest": "sha256:..."
}
```

Downloaded packages and compiled builds should live under `.eidos/cache/extensions/**`.
There is no central lock file in version 1; per-package locks avoid unrelated
merge conflicts and keep copied installed source self-describing.
`contentDigest` records the installed baseline. A mismatch does not make a
locally edited package invalid; it marks the package as modified and prevents an
update from overwriting it silently. Runtime trust always uses the digest
recomputed from current package content.

## Migration

Migration from the current database-backed extension model should be incremental.

### Phase 1: Export

Add an export command:

```txt
eidos extension export <slug> --publisher <publisher>
```

It writes:

```txt
extension.json
src/extension.ts or src/view.tsx
assets/
```

### Phase 2: Dual Read

Eidos can read both:

- legacy `eidos__extensions`,
- file-based `.eidos/extensions/**`.

Legacy rows and file-based packages keep distinct identities during dual read.
Export records the legacy-to-canonical mapping in local migration state. If a
canonical package ID conflicts, both candidates are blocked until the user
resolves the conflict; Eidos never chooses executable code from a slug match.

### Phase 3: File-Based Create/Edit

New extensions created in file-based spaces are written to `.eidos/extensions/**`.

The extension editor reads and writes real files.

### Phase 4: Runtime State Split

Move enabled state, trust state, permissions, and bindings into `.eidos/state/extensions.sqlite3`.

### Phase 5: Legacy Freeze

For new file-based spaces, stop creating user extensions in `eidos__extensions`.

Legacy spaces can keep using the old model until migrated.

## Key Decisions

1. User/space extension source lives under the fixed
   `.eidos/extensions/<publisher.name>/` root.
2. `.eidos/extensions/**` is tracked by graft by default.
3. `.eidos/cache/**`, `.eidos/state/**`, `.eidos/sessions/**`, and `.eidos/indexes/**` are private runtime state and ignored by graft.
4. Built-in extensions can remain bundled with the app.
5. Trust, enabled state, permissions, and secret bindings are local/private by default.
6. The current virtual `~/.eidos/__EXTENSIONS__` model is a compatibility layer, not the target source of truth.
7. Manifest version 1 uses `publisher`, `name`, explicit `entrypoints`,
   declarative `contributes`, and capability-oriented `permissions`.
8. Version 1 supports relative package modules plus the Eidos SDK only. Eidos
   never executes package-manager scripts.
9. GitHub provenance is stored in a tracked per-package
   `extension.lock.json`.
10. Any installed package-file change except the host-managed lock file
    produces a new version 1 content digest; trust remains keyed by ID, content
    digest, and permission hash.

## Deferred Questions

The following do not block the version 1 foundation and are explicitly deferred:

1. Shareable team enablement and permission policy.
2. Arbitrary npm dependencies and package-manager compatibility.
3. A community marketplace or automatic update service.
4. Background activation without a user-visible contribution trigger.
5. Binary custom-document editing and mobile/web extension runtimes.

## Delivery Plan

### P0: Contract convergence

- Make the manifest schema the single v1 source of truth.
- Publish the fixed directory, digest, dependency, lock, and local-state rules.
- Keep docs and executable examples marked as preview until runtime evidence
  exists.

### P1: Non-executing foundation

- Discover `.eidos/extensions/*/extension.json` through a host-internal project
  file boundary that cannot access `.graft` or unrelated private state.
- Parse, validate, diagnose, and hash packages without executing or compiling
  code.
- Watch extension package changes with generation tokens so stale scans cannot
  replace newer state.
- Show discovered packages in the Extension Manager as invalid, incompatible,
  untrusted, disabled, or ready.
- Create extension templates as real files and show those changes through the
  existing Graft Changes UI.

### P2a: Local trust state

- Persist snapshot-bound trust, enablement, and per-capability grants under
  `.eidos/state/extensions.sqlite3`.
- Re-inspect package bytes in the host before every state mutation; renderer
  requests carrying stale digests must fail.
- Keep all capabilities denied by default and clear effective trust,
  enablement, and grants when source or requested permissions change.
- Expose inline review and management without compiling or executing code.

### P2b: Minimal executable worker

- Add a per-package lazy worker and capability gateway.
- Support declared commands and menus with read-only file access plus
  host-rendered notice, select, and confirm UI.
- Consume the P2a trust state and add timeout, termination, crash recovery, and
  safe startup with all third-party packages disabled.
- Prove the runtime with the Markdown Task Counter example.

Implemented in the current developer preview. The fixed transport-only preload
does not expose an Electron API; it transfers one `MessagePort` into the
sandboxed host page. Runtime compilation never installs dependencies, discovers
configuration, or reopens mutable package files.

### P3: UI surfaces

- Define the text-document contract first: versioned snapshots, minimal edits,
  dirty state, undo/redo, autosave, external-change conflict handling, and
  multiple synchronized views.
- Then activate `fileEditors` in sandboxed iframe surfaces through a dedicated
  `MessagePort` capability channel.
- Prove the surface with an editable Markdown Task Board rather than a
  read-only demo.

### P4: GitHub installation

- Resolve an immutable Git commit, validate an extracted staging tree, show
  source and permission changes, vendor atomically, and write the per-package
  lock file.
- Keep updates manual in the first release and never overwrite locally modified
  source silently.
