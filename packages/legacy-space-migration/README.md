# `@eidos.space/legacy-space-migration`

Standalone migration runtime for exporting a legacy database-backed Eidos
Space into a file-based Space.

The default entry contains data types and deterministic migration planning. It
does not depend on Eidos core, the renderer, or a SQLite implementation.

The optional `@eidos.space/legacy-space-migration/better-sqlite3` entry inspects
legacy `.eidos/db.sqlite3` databases through a read-only connection. Export is
deliberately a separate phase so callers can show and approve the complete plan
before creating target files.

```ts
import { planLegacySpaceMigration } from "@eidos.space/legacy-space-migration"
import {
  exportLegacySpace,
  inspectLegacySpace,
} from "@eidos.space/legacy-space-migration/better-sqlite3"

const snapshot = inspectLegacySpace("/path/to/legacy-space")
const plan = planLegacySpaceMigration(snapshot, {
  targetRoot: "/path/to/new-space",
})

// Present `plan` and its issues before starting the export.
const result = await exportLegacySpace(plan)
```

Export writes into a sibling staging directory and only renames it into place
after Markdown, Eidos File, asset, and count validation succeeds. A non-empty target
is never overwritten, and source database/asset fingerprints must still match
the inspected plan.
