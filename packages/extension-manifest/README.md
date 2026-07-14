# `@eidos.space/extension-manifest`

Strict, non-executing validation for file-based Eidos extension packages.

The root export parses and validates `extension.json`, derives canonical IDs,
normalizes permissions, and calculates deterministic trust digests. The
`@eidos.space/extension-manifest/node` export inspects package directories and
discovers packages under a host-provided extensions root.

This package never compiles or executes extension code. It rejects symbolic
links, hard links, special files, path collisions, unsupported imports, missing
entrypoints, malformed manifests, and packages that exceed configured limits.
Electron, renderer APIs, Graft, SQLite, and runtime trust state are deliberately
outside this package.
