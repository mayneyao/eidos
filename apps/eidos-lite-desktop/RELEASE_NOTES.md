## What's new

### Eidos system metadata merges automatically

Concurrent updates to supported `eidos__*` system tables now use deterministic
Eidos-owned merge rules instead of appearing as raw SQLite conflicts. Routine
metadata changes no longer require a manual Local or Hosted choice.

### Safer collaboration between macOS and Windows

Graft now hands immutable Base, Local, and Hosted snapshots to the Eidos
Runtime, preserves the merge across restarts, and accepts the validated result
under exact repository-state tokens. Ordinary user tables keep Graft's normal
three-way behavior.

### Conflicts only when a decision is genuinely needed

Lite reports a domain conflict only when a system-table change is structurally
unsafe or cannot be validated. Successful automatic decisions are retained as
merge audit data without interrupting Sync, and an interrupted final handoff
remains retryable.

No migration is required.
