# `@eidos.space/legacy-space-migration`

Standalone migration runtime for exporting a legacy database-backed Eidos
Space into a file-based Space.

The default entry contains data types and deterministic migration planning. It
does not depend on Eidos core, the renderer, or a SQLite implementation.

The optional `@eidos.space/legacy-space-migration/better-sqlite3` entry inspects
legacy `.eidos/db.sqlite3` databases through a read-only connection. Export is
deliberately a separate phase so callers can show and approve the complete plan
before creating target files.
