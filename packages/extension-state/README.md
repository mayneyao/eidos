# `@eidos.space/extension-state`

Local, private trust state for Eidos file-based extensions. The package defines
snapshot-bound trust, enablement, and capability grants, plus an optional
`better-sqlite3` adapter for `.eidos/state/extensions.sqlite3`.

Tracked extension source and this local state deliberately remain separate.
Changing package content or requested permissions creates a different snapshot
and cannot inherit trust or enablement from an older snapshot.
