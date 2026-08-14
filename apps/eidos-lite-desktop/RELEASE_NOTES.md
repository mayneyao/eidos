## What's new

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

No migration is required.
