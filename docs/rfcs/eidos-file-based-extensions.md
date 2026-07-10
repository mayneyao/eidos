# RFC: File-Based Extensions for Eidos Spaces

Status: Draft
Date: 2026-07-09
Owner: Eidos
Related:

- `eidos-space-base-storage.md`
- `eidos-base-file-format.md`
- `eidos-space-markdown-runtime.md`
- `eidos-graft-space-versioning.md`

## Summary

Eidos extensions should move toward a file-based source model in file-based workspaces.

The canonical source for user/space extensions should live in the Space as ordinary files:

```txt
my-space/
  .eidos/
    extensions/
      kanban-view/
        extension.json
        index.tsx
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
.eidos/extensions/<slug>/index.tsx       canonical source
.eidos/extensions/<slug>/extension.json  canonical manifest
.eidos/cache/extensions/**               generated build output
.eidos/state/extensions.sqlite3          local/private runtime state
```

## Directory Layout

Recommended default layout:

```txt
my-space/
  .eidos/
    extensions/
      todo-actions/
        extension.json
        index.ts

      kanban-view/
        extension.json
        index.tsx
        assets/
          icon.svg

    cache/
      extensions/

    state/
      extensions.sqlite3

    secrets.sqlite3
```

Flat files may be supported later, but folder-based extensions are the better default because they leave room for assets, tests, README files, and multiple modules.

## Extension Manifest

Each extension folder should include a manifest:

```json
{
  "id": "kanban-view",
  "name": "Kanban View",
  "version": "0.1.0",
  "type": "block",
  "entry": "index.tsx",
  "meta": {
    "type": "tableView",
    "componentName": "KanbanView",
    "tableView": {
      "title": "Kanban",
      "type": "kanban",
      "description": "Render a table as a Kanban board"
    }
  },
  "permissions": {
    "files": "read",
    "network": false
  }
}
```

The manifest is portable source state. It may be tracked by graft.

The compiled output is not portable source state. It should be rebuilt into `.eidos/cache/extensions/**`.

## State Split

### Tracked Source State

These files are part of the Space and should be tracked:

```txt
.eidos/extensions/<slug>/extension.json
.eidos/extensions/<slug>/index.ts
.eidos/extensions/<slug>/index.tsx
.eidos/extensions/<slug>/src/**
.eidos/extensions/<slug>/assets/**
.eidos/extensions/<slug>/README.md
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
- Extension source changes can invalidate trust and require review.
- Marketplace-installed extensions should be pinned by ID/version or lock metadata.

This is the main reason not to store execution state purely in tracked files.

## Graft Semantics

With the default broad Space tracking rule, extension source appears as normal path changes:

```txt
.eidos/extensions/kanban-view/extension.json
.eidos/extensions/kanban-view/index.tsx
.eidos/extensions/kanban-view/assets/icon.svg
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
    Source: .eidos/extensions/kanban-view/index.tsx
    Status: trusted, enabled
    Permissions: files read, network denied
```

The extension editor should edit the real source file, not a virtual database projection.

Creating a new extension should create files:

```txt
.eidos/extensions/<slug>/extension.json
.eidos/extensions/<slug>/index.tsx
```

Disabling an extension should update local runtime state, not necessarily edit the manifest.

## Relationship to Base

Base files may allow extension-defined view types, actions, or renderers. The Base should reference extension capabilities by stable extension ID and type, not by compiled code.

Example:

```txt
tasks.base
  eidos__views.view_type = "kanban"
  eidos__views.extension_id = "kanban-view"

.eidos/extensions/kanban-view/
  extension.json
  index.tsx
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
.eidos/extensions/ejected/<slug>/
```

After ejection, that copy becomes user source state and should be tracked.

## Marketplace Extensions

Marketplace extensions are a hybrid:

- source/package identity should be reproducible,
- downloaded code and build output should not become accidental user state,
- trust and permissions should remain explicit.

Recommended tracked metadata:

```txt
.eidos/extensions.lock.json
```

or:

```txt
.eidos/extensions/<slug>/extension.json
```

with marketplace identity fields:

```json
{
  "id": "vendor.kanban-view",
  "version": "1.2.3",
  "source": {
    "type": "marketplace",
    "package": "vendor/kanban-view",
    "integrity": "sha256-..."
  }
}
```

Downloaded packages and compiled builds should live under `.eidos/cache/extensions/**`.

## Migration

Migration from the current database-backed extension model should be incremental.

### Phase 1: Export

Add an export command:

```txt
eidos extension export <slug> .eidos/extensions/<slug>/
```

It writes:

```txt
extension.json
index.ts or index.tsx
assets/
```

### Phase 2: Dual Read

Eidos can read both:

- legacy `eidos__extensions`,
- file-based `.eidos/extensions/**`.

File-based extensions should win on slug conflicts in file-based spaces.

### Phase 3: File-Based Create/Edit

New extensions created in file-based spaces are written to `.eidos/extensions/**`.

The extension editor reads and writes real files.

### Phase 4: Runtime State Split

Move enabled state, trust state, permissions, and bindings into `.eidos/state/extensions.sqlite3`.

### Phase 5: Legacy Freeze

For new file-based spaces, stop creating user extensions in `eidos__extensions`.

Legacy spaces can keep using the old model until migrated.

## Key Decisions

1. User/space extension source lives under `.eidos/extensions/**`.
2. `.eidos/extensions/**` is tracked by graft by default.
3. `.eidos/cache/**`, `.eidos/state/**`, `.eidos/sessions/**`, and `.eidos/indexes/**` are private runtime state and ignored by graft.
4. Built-in extensions can remain bundled with the app.
5. Trust, enabled state, permissions, and secret bindings are local/private by default.
6. The current virtual `~/.eidos/__EXTENSIONS__` model is a compatibility layer, not the target source of truth.

## Open Questions

1. Should the default source folder be exactly `.eidos/extensions/`, or should Eidos support a configurable path?
2. Should enabled/disabled ever be shareable team state, or always local state?
3. Should marketplace extension locks live in `.eidos/extensions.lock.json`, per-extension manifests, or both?
4. What is the minimal sandbox needed before enabling file-based extensions by default?
5. Should extension source changes always invalidate trust, or only when entry files and manifests change?
6. Should extension source support dependencies, or should v1 require single-file/bundled extensions?

## Recommended Vertical Slice

1. Support discovering `.eidos/extensions/*/extension.json`.
2. Compile `entry` into `.eidos/cache/extensions/build/<id>/`.
3. Store trust/enabled state in `.eidos/state/extensions.sqlite3`.
4. Show discovered extensions in the extension manager.
5. Add a trust prompt before first run.
6. Create new extensions as real files under `.eidos/extensions/<slug>/`.
7. Show extension file changes in graft Changes UI.
