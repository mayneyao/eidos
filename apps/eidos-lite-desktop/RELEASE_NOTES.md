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

No migration is required.

## Release note correction

Corrected on August 17, 2026, to remove changes already documented in Eidos
Lite 0.1.10.
