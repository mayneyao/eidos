## What's new

### Faster conflict resolution for large Eidos files

Choosing Local or Hosted values no longer rebuilds a large SQLite file after
every row, cell, or table decision. Lite records intermediate choices quickly,
then validates and reopens only the files that were actually materialized.

### See the real changes after a cross-platform merge

Version History now shows schema, table, and row changes when a merge result
matches the Local parent but differs from the Hosted parent. If the SQLite file
changed physically without a supported logical change, Lite says so instead of
presenting an empty first-version message.

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
