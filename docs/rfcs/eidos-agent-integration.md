# RFC: Native File Space Agent Runtime

Status: integration delivery candidate
Date: 2026-07-17
Owner: Eidos

Related RFCs:

- `eidos-space-markdown-runtime.md`
- `eidos-file-format.md`
- `eidos-file-based-extensions.md`
- `eidos-graft-space-versioning.md`

## Summary

Eidos keeps two Agent runtimes. The new File Space Agent does not provide a
compatibility layer for the legacy DataSpace Agent:

1. **Legacy DataSpace Agent Runtime** remains owned by
   `packages/ai/server/agent-api.ts`, legacy DataSpace, session storage, and
   tools.
2. **Native File Space Agent Runtime** is assembled independently by
   `apps/desktop/electron/modules/file-space-agent/file-space-agent-runtime.ts`
   and accepts only typed file-Space host tools.

The runtimes may share AI SDK, provider resolution, thinking configuration,
the Skills toolkit, and presentation components. That is library and UI reuse,
not runtime compatibility. The native runtime does not call `prepareAgent`,
create a legacy DataSpace, mount Bash/VFS, expose the legacy `eidos` CLI, or
import legacy `{id}.meta.json + {id}.jsonl` sessions.

Through formal host services, the native Agent can:

- list, search, read, create, modify, move, and delete Space files;
- create, edit, inspect, grant, trust, enable, and run File-Based Extensions;
- inspect Graft status, history, and diffs, and perform enable, stage, unstage,
  commit, discard, restore, remote sync, and conflict resolution;
- read Markdown, images, Eidos File snapshots, and Eidos File rows; and
- continue in Electron main after its tab closes, with a durable journal used
  to reattach the UI.

## Product and navigation boundary

The shared Sidebar Work Modes owner controls the Files, Version, and Agent
entry points, keyboard shortcuts, and shell state. This RFC owns only the Agent
mode conversation panel and `/agent/:conversationId` content page. It does not
reorder the shared shell.

Files locates canonical Space resources. Agent reasons and acts. Version lets
the user review worktree and history. Agent may call typed version tools, but
it can never read or modify `.graft/` directly.

The mature message UI in `apps/web-app/components/ai-agent/` remains shared:
streamed Markdown, reasoning, tool timelines, usage, Stop, Retry,
edit/regenerate, Fork, Copy, outline, and completion sound. Reusing those
components does not require runtime or session compatibility.

## Two-runtime boundary

| Boundary       | Legacy DataSpace Agent            | Native File Space Agent                        |
| -------------- | --------------------------------- | ---------------------------------------------- |
| Entry          | legacy `/agent` API/channel       | Desktop `file-space-agent` IPC                 |
| Assembly       | `prepareAgent` / `handleAgentApi` | `prepareFileSpaceAgentRuntime`                 |
| Canonical data | DataSpace/SQLite                  | Space files, `.eidos`, `.eidos/extensions`     |
| Tools          | legacy Bash/VFS/eidos/web tools   | typed Space/Extension/Version/Eidos File tools |
| Session        | legacy sidecar/session store      | `<id>/meta.json + events.jsonl`                |
| Approval       | legacy permission server          | run-scoped approval in Electron main           |
| Lifecycle      | request/renderer chain            | background run in Electron main                |

The native runtime must never add fallback to:

- `prepareAgent` or `handleAgentApi`;
- legacy DataSpace, `AgentSessionStore`, or legacy session import;
- `createBashTool`, `createFileTools`, legacy VFS, or legacy `eidos` commands;
- the legacy permission WebSocket; or
- direct system paths, direct `.eidos` SQLite, or direct `.graft` access.

## Architecture

```text
Agent tab / panel
  -> file-space-agent IPC
  -> FileSpaceAgentService (run, journal, approval, recovery)
       -> prepareFileSpaceAgentRuntime
            -> shared provider resolver + AI SDK ToolLoopAgent
            -> selected Skills toolkit
       -> SpaceManagementService
       -> FileExtensionService
       -> SpaceVersioningService
       -> Eidos File runtime facade
```

`startRun` registers an `ActiveRun` and `AbortController` in main, then consumes
`fullStream` in a detached promise. The renderer only polls durable event
sequences. Closing a tab stops polling; only explicit Stop aborts. A provider
stream cannot survive application exit. On the next launch, a non-terminal run
becomes `interrupted`, and mutations are never replayed automatically.

## Files and conversations

```text
.eidos/agent/sessions/
  <conversation-id>/
    meta.json
    events.jsonl
.eidos/agent/local/
  preferences.json
```

The native store recognizes only the directory format. Legacy
`<id>.meta.json` and `<id>.jsonl` sidecars remain owned by the old runtime. The
new runtime ignores and does not delete them.

`meta.json` carries a `formatVersion` but never persists a machine-local
registry `spaceId` or approval authority. The `events.jsonl` envelope carries a
`schemaVersion` and is a monotonically sequenced, checksum-chained,
append-and-fsync journal. It may repair only a partial final line; an internal
sequence/checksum error or unsupported version fails visibly. Contiguous stream
deltas are batched, and polling reads only sequences added since the cursor.

Approval mode is main-owned machine-local security state stored in the
non-versioned `.eidos/agent/local/preferences.json`. Renderer changes it through
dedicated IPC; a similarly named `startRun` field is never an authority source.
A conversation restored on another device therefore defaults to Ask.

Files exposes `.eidos/agent/sessions/**` as managed, read-only Space content so
users can inspect and export the underlying conversation files. Generic Files
and Agent file mutations cannot edit, move, create, or delete inside this root;
conversation controls remain the only supported writer. Other
`.eidos/agent/**` runtime state stays private.

Whether conversations enter Graft is still a per-Space user choice in Settings
and defaults off. Agent cannot change that privacy setting. Enabling it only
changes the managed ignore rule; it never stages, commits, or pushes
automatically.

## Native tool surface

### Space files

| AI tool                  | Host service                       | Permission      |
| ------------------------ | ---------------------------------- | --------------- |
| `list_space_files`       | `SpaceManagementService.listFiles` | observe         |
| `search_space_files`     | `searchFiles`                      | observe         |
| `read_space_file`        | `readFile`                         | observe         |
| `create_space_file`      | `createFile`                       | approval        |
| `create_space_directory` | `createDirectory`                  | approval        |
| `write_space_file`       | digest-bound `writeFile`           | diff + approval |
| `move_space_path`        | `moveFile`                         | approval        |
| `delete_space_path`      | `removeFile`                       | approval        |

Paths are Space-relative. `SpaceFiles` enforces traversal and symlink
containment, hides `.graft` and private `.eidos` state, and deliberately exposes
`.eidos/extensions/**` as versionable Extension source plus
`.eidos/agent/sessions/**` as managed read-only conversation files. Writes use
the shared operation lock and update the file index.

Updating an existing text file requires a preceding read and the exact
`contentDigest`. The approval shows a diff, and the write verifies both mtime
and digest. Agent never mounts the Space root in a shell.

### File-Based Extensions

| AI tool                                | Behavior                                                               |
| -------------------------------------- | ---------------------------------------------------------------------- |
| `inspect_extensions`                   | discovery, manifest, source, diagnostics, trust, grants, runtime state |
| `create_extension`                     | canonical template under `.eidos/extensions/local.*`                   |
| `uninstall_extension`                  | uninstall an exact snapshot and clean up its runtime state             |
| `read_space_file` / `write_space_file` | edit manifest and source                                               |
| `trust_extension`                      | trust an exact content/permission snapshot                             |
| `set_extension_grant`                  | grant or revoke an exact file/network capability                       |
| `set_extension_enabled`                | enable or disable an exact trusted snapshot                            |
| `run_extension_command`                | execute a command from an enabled exact snapshot                       |

Agent does not invent another manifest format or bypass snapshot identity.
Creation, uninstall, trust, grants, enablement, and command execution are
approved and audited in main. Generic file tools may edit files inside an
existing package but may not create, move, or delete a package root. A source
edit invalidates the previous snapshot, so Agent must inspect again.

### Graft Versioning

Observe tools cover status, history, diffs, commit detail, conflicts, and
remotes. Mutation tools cover enable, stage, unstage, commit, discard, restore
path/version, remote configure/remove, fetch/pull/push, and conflict
resolution.

Every mutation calls `SpaceVersioningService` and inherits its repository lock,
private-path filtering, managed ignore, expected-head, conflict, and file
refresh semantics. Except for initial enablement, Agent reads status first and
passes the exact current head to guarded mutations. Every mutation or external
sync requires Allow once or Deny. Agent never operates `.graft/` directly.

### Eidos File and resource context

`.eidos` is never overwritten as an ordinary text file. Agent currently reads
it through `getEidosFileSnapshotReadOnly`, `getEidosFileTableRow`, and
`getEidosFileTablePage`. Future Eidos File mutations must be added through typed Eidos File
Runtime APIs, not file replacement.

Active context supports Markdown selection/heading, plain text, Eidos File row,
image, and binary metadata with digest, mtime, fingerprint, and capture time.
Main may attach an image up to 10 MiB as a model file part.

## Permission, audit, and failure semantics

- Observe tools execute automatically but still create ToolRun audit records.
- Modify and external tools are bound to Space, conversation, run, and ToolRun
  in main. Ask prompts for every action; Approve for me auto-approves only safe
  typed mutations; Full access auto-approves typed tools within the current
  Space without expanding scope or bypassing argument validation.
- Approval defaults to Deny after five minutes; closing a tab does not change
  the wait.
- Parallel approvals are aggregated per run; the run remains waiting while any
  approval is unresolved.
- Stop aborts provider generation and pending approval.
- Tool input, resource, risk, preview, result/error, and every status transition
  are journaled.
- Recovery marks unfinished tools `interrupted`; an approved tool whose outcome
  cannot be proven becomes `outcome-unknown` and must be inspected before retry.
- Provider or tool failures surface Retry. Stale digest, head, or Extension
  snapshot fails before host mutation. Move/delete approvals capture a recursive
  path fingerprint and verify it again immediately before execution.
- Agent never receives credential values and cannot write `.graft` or private
  `.eidos` state.

## Acceptance matrix

| Requirement                     | Implementation evidence                                                                      | Automated verification                                                 | Desktop acceptance                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Two independent runtimes        | `agent-api.ts` and `file-space-agent-runtime.ts`; no `prepareAgent` import in native service | typecheck, static grep, service stream test                            | old Agent and Agent mode run separately with no tool crossover         |
| No legacy session compatibility | native store scans only conversation directories                                             | sidecar-ignore and delete-isolation tests                              | old sidecars neither appear nor get deleted in Agent mode              |
| Background run                  | main `activeRuns`, detached `executeRun`, durable journal                                    | stream, stop, recovery, and parallel-approval tests                    | close a tab during generation and reopen it                            |
| Full file CRUD                  | typed tools call `SpaceManagementService`                                                    | search/read/stale-write plus create/move/delete approval tests         | create, rename, edit, and delete Markdown with inspectable approvals   |
| Extension authoring             | create/edit/inspect/trust/grant/enable tools                                                 | template, diagnostics, command approval tests; Extension runtime smoke | create a command Extension, fix diagnostics, trust/enable, then run it |
| Version management              | status/diff/stage/commit/restore/sync tools                                                  | status-to-stage-to-commit approval test and coordinator suite          | approve stage/commit in Agent, then inspect it in Version mode         |
| Conversation privacy            | per-Space default-off setting and managed ignore                                             | settings and coordinator tests                                         | sessions stay out of status until the user opts in                     |
| Local authority boundary        | `.eidos/agent/local/preferences.json` and dedicated IPC                                      | fail-closed local-state and run-authority tests                        | a synced conversation defaults to Ask on another machine               |
| Shared shell boundary           | Agent consumes the Work Modes contract only                                                  | sidebar tests                                                          | Files/Version/Agent switching preserves tabs and state                 |

Delivery commands:

```bash
pnpm typecheck
pnpm --filter eidos smoke:file-agent
pnpm --filter eidos smoke:eidos-file-query
pnpm --filter eidos smoke:file-extension-runtime
pnpm build:desktop:dev
```

## RFC ownership boundaries

- Space Markdown owns safe-save, selection, and preview semantics.
- Eidos File Runtime owns `.eidos` queries and mutations; Agent calls its typed facade.
- File-Based Extensions owns manifests, compilation, snapshot trust, grants,
  and sandboxing; Agent orchestrates its formal service.
- Graft Versioning owns repositories, ignore rules, stage/commit/restore/sync,
  and conflicts; Agent orchestrates `SpaceVersioningService`.
- Sidebar Work Modes owns shared navigation and shell state; this RFC does not
  reorder modes.
- No implementation modifies `/Users/mayne/workspace/graft`.
