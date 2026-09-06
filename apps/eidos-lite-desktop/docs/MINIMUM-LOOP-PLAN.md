# Lite minimum usable loop

Status: steps 1–4 implemented and locally verified; candidate release
acceptance remains pending.

## Product boundary

Complete the offline workflow first: open a folder, write or import content,
save, organize, find it again, edit, recover mistakes, and reopen safely.
Use one Eidos Markdown profile. Wiki links, heading/block navigation and
host-initiated link maintenance are included. `![[...]]` stays literal source;
do not restore embed loading or a separate Obsidian mode.

Keep Sync expansion, semantic search, full Obsidian compatibility and unified
cross-database search outside this iteration. Existing table search remains
available, and text search must label its scope explicitly.

## 1. Protect text drafts

Implemented. Native macOS development acceptance on 2026-09-06 verified two
dirty documents in the close dialog, cancellation, Save all followed by byte
inspection and reopen, external-conflict close refusal, exclusive Save a copy,
quit cancellation, and explicit discard. Real files were confined to a temporary
Space. Closing after a conflict now exposes recovery actions in the editor.
The initial full source run passed 799 tests (187 opt-in tests skipped), with
focused follow-up coverage for conflict recovery. Update preparation is covered
by the shared handshake and updater tests; an actual installed-version update
remains part of step 5. Same-window Space replacement is rejected by the host.

- Reproduce unsaved edits followed by window close, quit, Space replacement,
  and update installation before changing lifecycle behavior.
- Add a host/renderer close handshake covering every dirty document, including
  inactive drafts. Offer Save, Discard and Cancel; wait for pending saves.
- A failed save or disk conflict must stop closure. Offer saving the draft as a
  separate file when the original changed externally.
- Retain manual saving initially. Full crash-recoverable draft persistence is
  a separate decision, not a claim made by normal-exit protection.

Acceptance: all normal exit paths preserve saved bytes or require an explicit
discard; cancellation leaves the editor usable. Test pending saves, multiple
drafts, disk conflicts and write failures through the real host boundary.

## 2. Find text inside the current document

Implemented. The shared rich Markdown editor now provides literal Find over
rendered text with non-mutating CSS highlights. Source mode uses Pierre's existing
Find panel. Native macOS development acceptance on 2026-09-06 verified Cmd+F,
Chinese matches across inline formatting, counts, previous/next, off-screen
reveal and Escape. Source acceptance also verified literal `[a]+` matching.
Both fixture files retained identical SHA-256 hashes, and closing required no
draft decision. Focused tests cover live match refresh and undo without Find
adding document changes. Workspace result navigation will reuse the text-range
reveal helper in step 3; source locations remain distinct from rendered text.

- Provide Cmd/Ctrl+F, match count, previous/next and Escape.
- Support literal Chinese/English queries in Source and Rich text modes.
- Define matching over visible text in Rich text mode and source in Source
  mode; decorations must not alter Markdown or its undo history.
- Share document-location/reveal handling with workspace search.

Acceptance: opening, navigating and closing Find changes no document bytes;
edits refresh matches, and off-screen matches become visible.

## 3. Search workspace text

Implemented. A main-owned bounded disk scan exposes typed progress/cancellation
IPC; each window replaces stale queries. The visible sidebar entry labels
saved text scope and exclusions. Results include paths, snippets and positions;
opening revalidates against disk/current drafts and locates Markdown in Source
mode so source offsets are unambiguous. Native macOS development acceptance on
2026-09-06 completed phrase search → open → edit → save → search the new phrase,
and refused a stale match after an external write. First-load positioning waits
for Pierre's attached viewport. Tests cover Chinese, UTF-16, duplicate names,
literal punctuation, exclusions, cancellation before/after start, stale query
events, limits, renames and changed-content locations. Full source tests passed
808 tests, with 187 opt-in tests skipped, under normal local permissions (the
sandbox prevents loopback sockets and some native file-watch events).

- Add a main-owned cancellable text-search service behind typed IPC. Start
  with bounded scans rather than a persistent index; measure before adding
  indexing infrastructure.
- Search supported Markdown and plain-text files. Respect filesystem scope,
  implementation directories, symlinks, encoding and explicit size limits.
  Expose excluded/limited results instead of implying complete coverage.
- Return paths, snippets and source locations in bounded batches. Replace
  stale queries, show progress/no-results/errors, and label the text-only scope.
- Open results at the match. Revalidate locations against current contents;
  handle changed, moved and deleted files and disclose disk-versus-draft scope.

Acceptance: find a phrase without knowing its filename, open the right match,
edit/save, and find the new phrase. Exercise Chinese, duplicate filenames,
rapid queries, cancellation, external writes and large folders.

## 4. Recover one document safely

Implemented. Text version inspection offers exclusive Save before/after as a
copy, including recovery of deleted historical text. Native macOS development
acceptance on 2026-09-06 verified old/new copies, preservation of another file's
unsaved draft, native text paste, undo/redo, save, rename plus maintained Wiki
link navigation, literal `![[...]]` preservation, Move to Trash and Finder Put
Back with identical recovered bytes. Real Graft integration tests recover old
and deleted notes without reverting another file's newer work. Existing tests
cover skipped link-maintenance reporting and exclusive-copy overwrite refusal.
The native audit also found and fixed first-load diff-view blanking caused by
late Vite optimization of the diff worker dependency; React is deduplicated and
all Pierre entry points are prebuilt before the first window loads.

- Verify undo, system Trash recovery, historical preview/copy and existing
  restore operations using a disposable folder.
- Ensure an old note can be recovered without reverting unrelated newer work;
  historical copy or Save as is sufficient for the initial implementation.
- Verify rename/move link maintenance, skipped-file reporting, and preservation
  of literal embed syntax. Complete native typing/paste acceptance still absent
  from the earlier Markdown UI checks.

Acceptance: recover a deleted file and an earlier note while another file's
newer edits remain unchanged. Protect dirty drafts during recovery.

## 5. Freeze and accept one candidate

- Resolve the Intel external-rename Runtime invalidation gate; distinguish
  product races from test timing without weakening lifecycle assertions.
- Require source, packaged and release checks to pass for the same commit.
- Exercise supported platforms, an actual previous-version upgrade, restart
  and binary rollback with representative disposable Spaces.
- Update delivery documentation with current evidence and remaining limits.

Final scenario: without signing in, create a note and import a table, save and
quit, reopen, find the note by a phrase, rename it, follow its maintained link,
edit it, recover a mistake, and reopen with all expected content intact.

Complete each step with focused tests and a native UI acceptance before moving
to the next. Do not label this plan or the current source commit a verified 1.0.
