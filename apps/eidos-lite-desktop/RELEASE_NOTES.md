## What's new

### Sync fetches Hosted history in fewer requests

Lite and the Hosted Sync service now transfer reachable Graft objects through one
bundled fetch when the service supports it, while retaining compatibility with an
older service. Fast-forward pulls also avoid a redundant history scan. On the
retained 430.9 MiB staging Space, the median mixed-change fetch-and-pull workflow
improved from 10.78 seconds to 7.65 seconds across three rounds; actual results
depend on history size and network latency.

### Open files refresh after a pull

When Sync replaces an Eidos File, Markdown document, or other open file with its
Hosted version, Lite now invalidates the affected editor cache as part of the same
operation. The current tab shows the downloaded data immediately instead of
requiring you to close and reopen the file.

### Sync and Versions panels can be resized

Drag the boundary beside Sync or Versions to give detailed history, progress, and
merge information more room. The shared width is remembered, supports keyboard
adjustment, and can be reset by double-clicking the boundary.

No migration is required.
