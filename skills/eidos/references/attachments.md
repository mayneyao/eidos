# Eidos attachment workflows

## Contents

- [Storage model](#storage-model)
- [Import local files](#import-local-files)
- [Attach existing relative files](#attach-existing-relative-files)
- [Replace or detach entries](#replace-or-detach-entries)
- [Verify attachments](#verify-attachments)
- [Failure and recovery rules](#failure-and-recovery-rules)

## Storage model

A File Field stores canonical metadata, not file bytes. Each entry contains a
UUIDv7 `id`, display `name`, verified `mediaType`, decimal-string `size`, and a
`uri`. A relative URI resolves from the directory containing the `.eidos`
file. The managed local convention is `assets/<portable-name>` next to that
file.

The SQLite revision and external bytes cannot share a filesystem transaction.
The attachment commands therefore stage copied bytes first, update the row in
a revision-checked SQLite transaction, expose staged files immediately before
commit, and clean both stages and visible files if the command fails. A process
crash may still leave an unreferenced stage or asset; `attachment verify`
reports both without deleting them.

Do not construct File entries, guess sizes or media types, generate IDs, or
resolve relative URIs in shell code when a high-level attachment command
covers the operation.

## Import local files

First read a compact context containing the target File Field. Keep the Row ID
and revision returned by that read:

```bash
eidos --json context library.eidos Books --fields Title,Cover --limit 50
```

Copy one external source into the managed `assets/` folder and append its new
entry to one cell:

```bash
eidos --json attachment import library.eidos \
  --table Books \
  --row 019... \
  --field Cover \
  --source /absolute/path/cover.png \
  --expected-revision 12
```

Repeat `--source` for up to 64 files. The command rejects symlink sources,
non-files, files above 256 MiB, unsafe roots, non-File fields, missing rows,
and stale revisions. Name collisions receive portable suffixes such as
`cover (2).png`. The JSON result contains the committed File entries and the
local paths that were copied.

If a supplied source is already an ordinary file inside this `.eidos` file's
managed `assets/` folder, `import` attaches it in place and returns
`copied:false`.

## Attach existing relative files

Use `attach` only when the bytes already exist below the directory containing
the `.eidos` file and must not be copied:

```bash
eidos --json attachment attach library.eidos \
  --table Books \
  --row 019... \
  --field Cover \
  --uri assets/existing.png \
  --expected-revision 13
```

Repeat `--uri` to attach several existing files atomically. URIs are
normalized and must be contained relative paths without a scheme, query, or
fragment. Every path component is checked; missing files, path traversal,
encoded separators, and symlinks fail before the row commits.

Do not use `attach` for an arbitrary path outside the File directory. Use
`import` for that case.

## Replace or detach entries

Add `--replace` to `import` or `attach` only when every existing entry in the
selected cell should be replaced in the same revision:

```bash
eidos --json attachment import library.eidos \
  --table Books --row 019... --field Cover \
  --source /absolute/path/new-cover.png \
  --expected-revision 14 \
  --replace
```

The result lists old entries under `detached`. Their physical files are not
deleted.

Remove exact entries by the IDs returned from `context`, `query`, `import`, or
`attach`:

```bash
eidos --json attachment detach library.eidos \
  --table Books --row 019... --field Cover \
  --entry 019... \
  --expected-revision 15
```

Repeat `--entry` for an atomic multi-entry detach, or use `--all`. Missing IDs
fail instead of silently broadening the request. Detach never deletes bytes;
the result sets `physicalFilesRetained:true`.

## Verify attachments

Scan every stored File Field and the managed `assets/` tree:

```bash
eidos --json attachment verify library.eidos --diagnostics-limit 100
```

Verification checks local URI containment, symlink boundaries, file
existence, byte count, detected media type, conflicting reuse of an entry ID
or path, and unreferenced managed assets. Inline Data URLs and `https:` entries
are counted but no network request is made.

The command exits nonzero when `valid:false`. Orphaned assets and crash-left
stage files are warnings, so they do not make otherwise valid references fail.
Do not delete reported orphans automatically. Confirm that no other document,
non-Eidos workflow, or pending recovery needs them before any explicit cleanup.

## Failure and recovery rules

- Do not automatically retry `stale-revision`. Reload the target row and
  decide whether append, replace, or detach still matches the user's intent.
- If import fails, trust the command's rollback. Run `attachment verify` when
  the process crashed or the outcome is uncertain.
- Never repair a File entry with raw SQLite. Re-import the source, attach a
  verified existing file, or detach the broken entry through the CLI.
- Do not run attachment mutations while Eidos Lite, Eidos File Web, or another
  writer such as `eidos serve` has the same File open during the alpha.
- Keep the `.eidos` file and its relative assets together when moving or
  copying a Space.
