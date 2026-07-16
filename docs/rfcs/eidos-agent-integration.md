# RFC: Agent Integration for File-Based Spaces

Status: Draft, P1 developer preview
Date: 2026-07-17
Owner: Eidos
Related:

- `eidos-space-markdown-runtime.md`
- `eidos-base-file-format.md`
- `eidos-space-base-storage.md`
- `eidos-file-based-extensions.md`
- `eidos-graft-space-versioning.md`
- `eidos-legacy-space-migration.md`

## Summary

This RFC makes Agent a first-class working mode in a file-based Space. It does
not reconnect the legacy DataSpace Agent backend. The new runtime owns a
conversation independently of any renderer tab, builds explainable context
from canonical Space files and Base snapshots, and invokes typed host tools
through an explicit permission boundary.

The first deliverable lets a Desktop user:

1. open Agent from a Markdown or Base tab,
2. ask a question grounded in the current Space,
3. inspect the exact resources and tool runs used by the answer,
4. approve or deny a proposed Markdown patch, and
5. close and reopen the Agent tab without canceling the active run.

## Product Decisions

### Agent is a content tab

The primary Space sidebar modes remain Files and Version. Agent is opened as a
normal `/agent/:conversationId` content tab from the Space sidebar, command
palette, or keyboard shortcut. Opening Agent captures the source tab before
Agent becomes active and may place the conversation in a right split. A
searchable conversation list and New Tab entry belong to P2.

This preserves three independent concepts:

- Files locates canonical Space resources.
- Agent reasons about and acts on those resources.
- Version reviews changes to canonical resources.

Agent does not automatically stage, commit, pull, or push. A file changed by
Agent appears in Version exactly like a user edit. Conversations remain private
by default. A per-Space Versioning setting may explicitly include only the
conversation transcript, captured context, tool runs, approvals, and
attachments as ordinary Space changes; it never stages, commits, or pushes
them automatically.

### Context is explicit and inspectable

The prompt does not silently contain an unbounded copy of the Space. Each turn
has immutable `ResourceContext` captures. A capture records why it was
included, its path and logical target, a bounded excerpt, and the file digest,
mtime, or Base fingerprint used at capture time.

The initial vertical slice understands:

- a Markdown or text file,
- a Markdown heading and current text selection,
- a Base file and table,
- a Base record, and
- resources discovered through bounded Space search.

The UI renders context chips and lets the user inspect each excerpt and its
freshness. A changed resource is marked stale instead of being presented as
the current file state.

### Runs belong to the Desktop runtime

The Electron main process owns provider calls, tool loops, cancellation,
approval waits, and persistence. Renderer tabs subscribe by event sequence.
Closing a tab never implies cancellation. Explicit Stop aborts the run.

After an application restart, a run that was `running` or
`waiting-approval` becomes `interrupted`. It is not replayed automatically.
Retry creates a new attempt. A mutating tool with an unknown completion state
must be reconciled before another mutation is proposed.

## Current-State Evidence

The file Space route policy currently rejects `/agent`, and the Desktop API
route resolves a legacy `DataSpace` before constructing the old Agent. A file
Space deliberately has no legacy DataSpace database. Therefore adding a route
alone cannot deliver Agent.

The required native primitives already exist:

- `SpaceFiles` provides contained paths, stable reads, content digests, atomic
  replacement, and external-change detection.
- the Space file index provides bounded search and snippets,
- the Base query worker provides persistent per-Space snapshots and paging,
- the file operation lock serializes canonical writes, and
- the File Extension runtime provides snapshot-bound trust and an isolated
  execution boundary for a future Agent tool contribution contract.

The legacy Agent retains useful presentation and interaction code, but its
DataSpace command bridge, unrestricted network sandbox, all-secret environment
injection, unauthenticated approval WebSocket, global bypass, and
renderer-owned stream lifetime are not part of this design.

### Legacy capability inventory and disposition

| Capability                                              | Concrete legacy flow                                                                                                                                                                                                                                    | Disposition                                                              | Evidence and reason                                                                                                                                                                                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session create, append, restore, search, edit, and fork | HTTP routes in `packages/ai/server/routes.ts` call `packages/core/agent-session/agent-session-store.ts`, which writes through a legacy `DataSpace` virtual filesystem                                                                                   | Adapt, do not call directly                                              | The JSONL reconstruction, history, fork, and message replacement behavior is useful. The path `~/.eidos/agent/sessions` is resolved inside a DataSpace, has no event checksum or durable Run state, and cannot own a file-Space run.                            |
| Streaming and partial persistence                       | `packages/ai/server/agent-api.ts` uses `ToolLoopAgent`, `createUIMessageStream`, `onStepFinish`, and `onFinish`; `apps/web-app/pages/[database]/agent/page.tsx` owns `useChat` and calls `stop()` when the component unmounts                           | Reuse AI SDK/provider assembly; replace lifetime and persistence         | Tool loop construction, incomplete-tool sanitization, and provider options are mature. Renderer-owned HTTP streaming violates tab-independent execution and explicitly admits incomplete mid-stop persistence.                                                  |
| Provider, model, and settings                           | `packages/ai/server/model.ts` resolves `model@provider`; `apps/desktop/electron/modules/config/config-manager.ts` stores `AIFormValues`; `apps/web-app/components/settings/stores/ai-config-store.ts` mirrors that config in the renderer               | Directly reuse model resolution for P1; migrate credential storage in P2 | The new IPC accepts only a model reference and resolves it in main. Existing provider API keys are still plaintext config values and renderer-readable, so this RFC does not claim secure-storage completion.                                                   |
| Data and prompt context                                 | `packages/ai/server/agent-context.ts` injects goal/date and legacy node mentions; bash `eidos` commands in `packages/ai/tools/bash/index.ts` query DataSpace tables, docs, journals, and extensions                                                     | Replace                                                                  | It has no canonical file path, Markdown selection, Base snapshot, digest, or active-tab capture. Its default instruction to execute without confirmation also conflicts with the new trust model.                                                               |
| Built-in tools                                          | `packages/ai/tools/bash/index.ts` creates a sandbox with `network: { allowAll: true }`; `packages/ai/server/agent-api.ts` injects all secrets and merges client-supplied tools                                                                          | Retire for file-Space Agent                                              | P1 exposes only host-defined, typed, bounded file/search/Base tools. No generic shell, arbitrary network, secret enumeration, or renderer-supplied executable crosses the gateway.                                                                              |
| File edit concurrency                                   | `packages/ai/tools/file-tools.ts` uses line hashes before editing files mounted into the bash VFS                                                                                                                                                       | Adapt the optimistic-concurrency idea, not the VFS tool                  | P1 binds a whole-file diff to the real `SpaceFiles` `sha256:` content digest, mtime, file-operation lock, and atomic replacement.                                                                                                                               |
| Permission confirmation                                 | `packages/ai/permission/wrapper.ts` wraps tools; `packages/ai/permission/server.ts` and `apps/web-app/components/permission/PermissionProvider.tsx` exchange decisions over a localhost WebSocket and support session persistence and global bypass     | Replace transport and grant semantics                                    | The old socket authenticates only by query-string session ID, has no Space/resource/digest binding, and can globally bypass. P1 decisions are main-process in-memory capabilities bound to Space, conversation, run, and ToolRun, with only Allow once or Deny. |
| Extension access                                        | `packages/ai/tools/bash/extension-commands.ts` mutates legacy DataSpace extensions. The file Extension v1 schema in `packages/extension-manifest/src/types.ts` declares commands, panels, file editors, Base views, and menus, but no Agent tool        | Retire legacy bridge; defer a new manifest contract                      | Existing file Extension commands are not silently promoted into Agent tools. `contributes.agentTools` requires its own RFC revision and must reuse exact-snapshot trust in `apps/desktop/electron/modules/file-extensions/`.                                    |
| Message, reasoning, and tool UI                         | `apps/web-app/components/ai-agent/assistant-message.tsx`, `message-bubble.tsx`, `tool-timeline-node.tsx`, `agent-goal-input.tsx`, and `ui/message-scroller.tsx` render streamed Markdown, reasoning, model usage, tools, mentions, stop, edit, and fork | Adapt incrementally                                                      | P1 uses a smaller event-backed surface with context, ToolRun, patch preview, approval, model selection, and stop. Markdown rendering, usage, retry/edit/fork, skills, outline, and richer composer move only after their data contracts exist.                  |
| Attachments, images, and references                     | Structured legacy node mentions are accepted by `agent-goal-input.tsx` and injected by `agent-context.ts`; the Agent composer has no complete persisted attachment/image pipeline                                                                       | References adapt; attachments/images are new P2 work                     | P1 captures the active file, Markdown selection, Base table, and row. It must not serialize ad-hoc renderer blobs into model messages.                                                                                                                          |
| Background channels                                     | `apps/desktop/electron/modules/agent-channel/agent-channel.service.ts` and `packages/ai/server/channel.ts` own abort controllers, but still require `DataSpaceManager`                                                                                  | Adapt after the file-Space runtime is stable                             | P4 channel adapters must call the same run manager and gateway rather than maintain a second tool/security stack.                                                                                                                                               |

### File-Space primitives reused by P1

- `packages/file-space/src/space-files.ts`: contained public paths, stable UTF-8
  reads, `sha256:` identities, compare-and-swap writes, and atomic replacement.
- `packages/file-space/src/file-space-index.ts` and
  `SpaceManagementService.searchFiles`: bounded file search and snippets.
- `apps/desktop/electron/modules/space-management/space-management.service.ts`:
  the host file and Base facade; Agent adds a read-only Base snapshot method and
  never opens `.base` SQLite directly.
- `apps/desktop/electron/modules/space-management/file-space-operation-lock.ts`:
  shared read/write exclusion across Agent, Base, Graft restore, and file edits.
- `apps/desktop/electron/modules/space-versioning/graft-ignore.ts`:
  `.eidos/agent/` is ignored by Graft by default. Explicit per-Space consent
  narrows that ignore to `.eidos/agent/local/`, making only
  `.eidos/agent/sessions/` eligible for versioning while canonical edits stay
  visible. The generic `.eidos/sessions/` namespace remains available to other
  runtimes.

### P1 implementation evidence

| Concern                         | Implementation                                                                                                                                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Main-process ownership          | `apps/desktop/electron/modules/file-space-agent/file-space-agent.service.ts` owns provider calls, tool loops, cancellation, approval waits, and active runs.                                                                                                       |
| Durable transcript and recovery | `file-space-agent-session-store.ts` writes fsynced checksum-chained events below `.eidos/agent/sessions/`; startup access turns unfinished runs into `interrupted` and repairs only a partial final line.                                                          |
| IPC boundary                    | `file-space-agent.module.ts`, `apps/desktop/electron/app.module.ts`, `preload.ts`, and `electron-env.d.ts` expose typed list/get/start/stop/decision methods; renderer polling uses a validated non-negative event sequence.                                       |
| Resource capture                | `apps/web-app/components/file-space-agent/open-agent.ts` flushes the source file before opening a right split; `resource-context.ts`, `space-file/page.tsx`, and `packages/markdown-editor/src/editor.tsx` capture file/heading/Base target and current selection. |
| Agent UI                        | `apps/web-app/pages/[database]/file-agent/page.tsx` restores events, renders inspectable context and ToolRuns, shows patch diffs, and sends scoped Allow once/Deny decisions.                                                                                      |
| Safe file mutation              | `SpaceManagementService.writeFile` validates the `sha256:` CAS value and mtime, takes the shared operation lock, and delegates atomic replacement to `SpaceFiles.writeText`.                                                                                       |
| Read-only Base access           | `SpaceManagementService.getBaseSnapshotReadOnly` takes a read lock and opens Base readonly; Agent Base inspect/context and existing row paging stay behind this facade.                                                                                            |
| Shell routing                   | `file-space-route-policy.ts`, `file-space-routes.tsx`, the file sidebar, command palette, and `Cmd/Ctrl+J` provide file-Space-only entry while legacy Spaces retain `/agent`.                                                                                      |
| Conversation versioning consent | `graft-ignore.ts`, `space-versioning.coordinator.ts`, `use-space-versioning.ts`, and `file-space-versioning-settings.tsx` keep sessions private by default and expose a per-Space opt-in under Versioning.                                                         |

## Architecture

```text
Agent content tab
  -> typed file-space-agent IPC (start/subscribe/approve/stop)
  -> AgentRunManager
       -> ProviderBroker
       -> Conversation journal
       -> ResourceContextResolver
       -> AgentToolGateway
            -> PermissionPolicy
            -> SpaceFiles / FileIndex / Base query worker
            -> File Extension runtime (later manifest revision)
```

IPC responses are cloneable snapshots, not streams. The renderer requests
events after its last sequence. The main process appends stream deltas and
state transitions to the journal before exposing them to subscribers.

## Data Model

### Conversation

```ts
interface Conversation {
  id: string
  spaceId: string
  title: string
  model: string
  createdAt: string
  updatedAt: string
  latestSequence: number
  parentConversationId?: string
  forkedMessageId?: string
}
```

### ResourceContext

```ts
interface ResourceContext {
  kind: "markdown" | "text" | "base" | "base-row"
  path: string
  heading?: string
  tableId?: string
  rowId?: string
  selection?: string
  excerpt?: string
  contentDigest?: string
  mtimeMs?: number
  baseFingerprint?: string
  capturedAt: string
  reason: "active-tab" | "selection" | "explicit" | "tool"
}
```

### AgentRun

An `AgentRun` is one attempt to answer a user message. Its states are
`queued`, `running`, `waiting-approval`, `succeeded`, `failed`, `canceled`, and
`interrupted`. It records the provider/model reference, assistant message ID,
timestamps, error, usage, and last durable event sequence.

### ToolRun and ApprovalDecision

A `ToolRun` records the capability, normalized input summary, affected
resource, risk, preview, result or error, and every status transition. Mutating
tool arguments that are not safe to persist remain in the active run memory;
the journal keeps their digest and reviewable diff.

An approval is bound to the Space, conversation, capability, resource pattern,
normalized arguments, and—when applicable—the exact Extension content digest
and permission hash.

## Storage Boundary

Canonical Space state remains ordinary Markdown, assets, and `.base` files.
Agent-private state is grouped under an Agent-owned namespace:

```text
.eidos/
  agent/
    sessions/<conversation-id>/events.jsonl
    sessions/<conversation-id>/attachments/
    local/
      index.sqlite3
      state.sqlite3
      cache/
```

`events.jsonl` is the transcript and audit source of truth. Events have a
monotonic sequence and checksum chain. The index database is disposable. The
state database contains run leases, grants, and preferences that cannot be
derived from the transcript; missing or corrupt grants fail closed.

Conversation versioning is a local, per-Space consent policy encoded in the
Eidos-managed `.graftignore` block. It is off by default. Enabling it makes only
`.eidos/agent/sessions/**` eligible for the same explicit stage/commit/push flow
as other Space files; `.eidos/agent/local/**`, credentials, and provider settings
remain excluded. Disabling it first unstages current conversation changes, but
does not erase conversation data already present in committed history or a
remote.

In the target state, provider credentials never enter a Space, renderer, or
tool environment. The renderer sends a model reference only, and a
main-process provider broker resolves its credential from Electron secure
storage. P1 already keeps credentials out of Agent IPC, journals, and tools;
existing plaintext, renderer-readable provider values still require P2
migration.

## Built-In Tool Contract

The first vertical slice exposes only:

| Tool                    | Risk    | Boundary                                       |
| ----------------------- | ------- | ---------------------------------------------- |
| `space.files.search`    | observe | bounded query, count, snippets, and timeout    |
| `space.files.readText`  | observe | contained public path and byte limit           |
| `space.base.inspect`    | observe | existing Base snapshot API                     |
| `space.base.readRows`   | observe | existing paging API, maximum 100 rows          |
| `space.files.patchText` | modify  | diff approval, digest check, lock, atomic save |

Observe tools are visible in the ToolRun timeline but do not prompt when they
remain inside the active Space and declared bounds. Modify tools wait for an
explicit decision. The default decision is Allow once; a Space-wide grant
cannot be created from a chat banner.

Generic shell execution, unrestricted network, secret enumeration, and
client-supplied executable tools are excluded from this slice.

## File Extension Tools

The strict v1 File Extension manifest has no Agent tool contribution. Existing
commands must not be treated as tools. A later revision may add
`contributes.agentTools` with an input schema, result schema, declared risk,
and required capabilities.

Invocation must go through the existing isolated runtime. Installation,
enablement, exact snapshot trust, capability grants, and the Agent approval
must all be valid immediately before execution. A source or grant generation
change invalidates the ToolRun.

## Failure Semantics

- A renderer disconnect leaves the run active but denies an approval after its
  deadline if no renderer reconnects.
- Stop aborts provider generation and all pending observe tools.
- An approval wait is canceled when its run stops.
- A stale file digest fails the write without applying any part of the patch.
- A provider or tool error is journaled and rendered with retry guidance.
- Startup recovery marks unfinished leases interrupted and never replays a
  mutating tool automatically.
- Journal corruption is surfaced. Only a partially written final line may be
  truncated automatically; an invalid internal checksum is not ignored.

## Delivery Plan

### P1: Current Space vertical slice

- file Space route and shell entry,
- main-process run ownership and durable event subscription,
- current Markdown/Base context,
- provider/model resolution,
- bounded search/read/Base tools,
- approved Markdown patch,
- ToolRun and context presentation,
- stop and tab-close recovery.

### P2: Conversation completeness

- list, search, archive, retry, edit, and fork,
- restart reconciliation,
- attachments and image model parts,
- secure credential migration and per-Space model preference,
- native Desktop smoke coverage.

### P3: Capability expansion

- Base mutations through the Base runtime,
- origin-scoped network tools,
- bounded and trusted skills,
- explicit File Extension Agent tool manifest revision.

### P4: Channels and migration

- channel adapters use the same file Space runtime,
- explicit conversation export/import,
- legacy Agent retirement plan after compatibility acceptance.

## Acceptance Matrix

| Requirement                     | Current status                             | Remaining gap                                           | Implementation evidence                                            | Automated verification                                                        | Native Desktop scenario                                                                                                     |
| ------------------------------- | ------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Agent route and source capture  | P1 implemented                             | Add New Tab/history entry in P2                         | `file-space-routes.tsx`, `open-agent.ts`, sidebar/cmdk/shortcut    | route policy, resource-context, Markdown selection tests                      | Open Agent from Markdown selection and a Base record; verify it opens in the right split.                                   |
| Durable stream                  | P1 implemented                             | Compaction/indexing for long sessions                   | main-process `executeRun`; checksum event journal                  | session-store concurrent append, stream persistence, incremental cursor tests | Start a long answer, close its tab, reopen the same URL, and observe continued deltas.                                      |
| Explainable context             | P1 implemented for active resource         | Live stale badge and explicit add/remove context are P2 | `resolveResourceContext`; context detail UI                        | Markdown, selection, oversized preview, Base-row tests                        | Expand the context card and inspect path, selection/table/row, digest or Base revision, and capture reason.                 |
| Space search/read               | P1 implemented                             | Ranking/timeout telemetry                               | typed `space.files.search` and `space.files.readText`              | observe ToolRun and byte-bound tests                                          | Ask a cross-file question and expand the search/read ToolRuns used by the answer.                                           |
| Base read                       | P1 implemented                             | Rich filtered/grouped context                           | read-only snapshot plus existing query-worker page/row APIs        | Base-row context test; `smoke:base-query`                                     | Ask about the active table and record; confirm no Base mutation appears.                                                    |
| Permission                      | P1 Allow once/Deny                         | Durable narrow grants are intentionally absent          | main-process pending approval bound to Space/conversation/run/tool | approve and deny ToolRun tests                                                | Deny one patch, ask again, inspect the diff, then Allow once.                                                               |
| Safe write                      | P1 implemented                             | Multi-hunk patch protocol and stale UI affordance       | digest-bound read, diff, shared lock, atomic `writeText`           | success, invalid/stale digest, and no-write-on-deny tests                     | Edit the target externally while approval is open; Allow once must fail without overwriting.                                |
| Stop and recovery               | P1 implemented                             | Retry/reconciliation UI is P2                           | AbortController, approval deadline, lazy interrupted recovery      | stop/denial state and interrupted-run tests                                   | Stop during generation; separately force quit during a run and verify `interrupted` after restart.                          |
| Conversation versioning consent | Per-Space, default-off setting implemented | Historical versions cannot be retroactively redacted    | managed `.graftignore` policy plus Versioning settings switch      | ignore-policy, coordinator, and settings UI tests                             | Confirm sessions are absent by default; opt in, commit and push one; opt out and confirm local runtime state never appears. |
| Version boundary                | Architectural boundary present             | Manual packaged-app evidence still required             | conditional session ignore plus canonical host write only          | Graft ignore regression and full Version suite                                | Apply a patch and confirm Version shows the canonical file; Agent sessions appear only after explicit opt-in.               |
| Legacy compatibility            | Route separation implemented               | Full regression suite must remain green                 | file route policy and unchanged legacy Agent route                 | route-policy and legacy test suite                                            | Open a legacy Space and confirm the existing Agent still uses its prior session flow.                                       |
| Attachments/images/references   | Active resource reference only             | Persisted attachments, image parts, citations are P2    | ResourceContext model                                              | context tests                                                                 | P2: attach an image/file, restart, and verify a stable preview and model part.                                              |
| File Extension Agent tools      | Explicitly excluded                        | Separate manifest/runtime RFC is P3                     | no `agentTools` schema or gateway adapter                          | file-extension smoke remains unchanged                                        | Existing Extension commands never appear as Agent tools in P1.                                                              |

Required delivery commands:

```bash
pnpm test
pnpm typecheck
pnpm --filter eidos smoke:file-agent
pnpm --filter eidos smoke:base-query
pnpm build:desktop:dev
```

Extension tool delivery additionally requires:

```bash
pnpm --filter eidos smoke:file-extension-runtime
```

## Cross-RFC Boundaries

- Markdown remains canonical and is written only through the host safe-save
  path. Agent does not create a hidden document body database.
- Base reads and future writes use the standalone Base runtime. Agent does not
  open Base SQLite files directly.
- Version owns staging, commits, remotes, and conflicts. Agent only edits the
  working tree unless a future, separately approved capability says otherwise.
- File Extension manifest v1 and runtime trust semantics are unchanged by P1.
- Legacy migration does not implicitly migrate chats or messages. Any transfer
  is an explicit export/import feature.
