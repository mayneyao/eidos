# Lite minimum usable loop

Status: planned; implementation and release acceptance remain pending.

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

- Provide Cmd/Ctrl+F, match count, previous/next and Escape.
- Support literal Chinese/English queries in Source and Rich text modes.
- Define matching over visible text in Rich text mode and source in Source
  mode; decorations must not alter Markdown or its undo history.
- Share document-location/reveal handling with workspace search.

Acceptance: opening, navigating and closing Find changes no document bytes;
edits refresh matches, and off-screen matches become visible.

## 3. Search workspace text

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
