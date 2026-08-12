## What's new

### See Sync progress while files move

First upload, download, clone, and later Sync runs now show transferred bytes,
total size when the service provides it, current speed, and an estimated time
remaining. When a total is not available, Lite shows an honest indeterminate
state instead of a made-up percentage.

### Reliable first Sync across platforms

Connecting a Space no longer stops because different SQLite versions encode the
same database differently. Lite compares the logical database state before it
decides that a freshly cloned Space has unexpected Local changes.

No migration is required.
