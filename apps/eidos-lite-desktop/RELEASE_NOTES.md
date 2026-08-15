## What's new

### Sync fast-forwards after one fetch

Pulling Hosted changes now fetches the remote checkpoint once, verifies an
immutable fast-forward plan, and applies that fetched plan directly. Lite no
longer starts a second remote fetch inside pull, while any snapshot bytes still
needed during materialization continue to report concrete download progress.

### First-version table history stays inspectable

When reviewing the first saved version of an Eidos File, switching between
tables no longer mistakes Graft's internal root marker for a Space checkpoint.
Each table can now be opened without an `Invalid Space checkpoint` error.

### Attachments can be previewed safely

Images can now be previewed inside Eidos Lite through a Host-issued attachment
lease. Other attachment types show trusted file metadata and explicit Open or
Show in Folder actions, and activation failures remain visible in the preview.

### Tables and views are easier to navigate by keyboard

Table and view tabs can now be cycled from anywhere outside a text editor. The
shortcuts work without focusing the tab strip first and preserve native typing
and editing key combinations.

### New rows stay put while you edit

A newly appended row now remains under its active editor while sorting,
filtering, or background page loading changes the surrounding result set. Lite
applies the deferred refresh after editing ends, without duplicating the row or
moving focus unexpectedly.

### Cloud checkpoints stay visible in History

Version History now marks the last locally known Cloud checkpoint even when
Local and Cloud histories have diverged. Like a Git remote-tracking ref, this
uses the checkpoint recorded by the latest fetch or push and does not require
another network request.

### Conflict-free merges finish automatically

When Graft completes a reviewed three-way merge without any unresolved paths,
Lite now finalizes it immediately instead of opening an empty conflict workspace
showing zero conflicts. Interrupted conflict-free merges receive the same
recovery behavior, so Sync can continue to the next fetch or push.

### Large Eidos File merges are much faster

Merge analysis now targets changed SQLite pages and reuses proven snapshots
instead of repeatedly scanning and copying an entire large Eidos File. On the
retained 417 MiB macOS fixture, warmed merge lifecycle P95 improved from 42.34
seconds to 1.56 seconds; a fresh process completed in 2.93 seconds. Windows and
Linux receive the same sparse WAL import path, while macOS additionally uses an
APFS copy-on-write seed when available.

Row edits on very large Eidos Files now return their committed values through
an exact primary-key lookup instead of running the general paged query and row
count path. On the same local one-million-row fixture, update P95 improved from
86.8 ms to 29.3 ms and insert P95 from 149.5 ms to 31.5 ms; delete P95 was 28.7
ms.

No migration is required.
