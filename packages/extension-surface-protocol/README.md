# `@eidos.space/extension-surface-protocol`

Host-owned text-document state and a serializable `MessagePort` protocol for
sandboxed Eidos extension UI surfaces.

Version 1 deliberately supports text documents only. It defines:

- immutable initialization snapshots and monotonic in-memory revisions;
- bounded UTF-16 offset edits against an exact base revision;
- shared undo/redo with minimal inverse edits for multiple views;
- bounded, single-use compare-and-swap save tokens so an older autosave cannot
  erase newer input;
- dirty state owned by the host rather than reported by an iframe;
- external-change detection with explicit host-owned reload/overwrite
  resolution;
- strict parsing for every message crossing from an untrusted surface.

The package contains no React, Electron, iframe, filesystem, Graft, or editor
implementation. A Desktop host and an extension UI can share the protocol
without sharing process authority. Binary editors, arbitrary full-file writes,
and conflict resolution chosen by extension code are outside version 1.

Version 1 fixes the transport limits at 128 edits, 256 Ki UTF-16 code units
changed per batch, and 512 Ki UTF-16 code units per document. Callers may lower
these limits but cannot raise them. A surface with an unsupported protocol or
missing capability must stop using that feature and let the host fall back to a
native editor.
