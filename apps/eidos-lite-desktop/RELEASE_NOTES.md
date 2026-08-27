## What's new

### Keep Windows clones clean

Eidos Lite now treats SQLite page-header values rewritten by a Windows backup
snapshot as non-user changes. A Space checkpointed on macOS stays clean after
it is cloned to Windows, so Sync can continue without an empty checkpoint.
Derived Graft status caches rebuild automatically; files and history are
unchanged.

No migration is required.
