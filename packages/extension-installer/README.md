# @eidos.space/extension-installer

Host-side installation primitives for Eidos file-based extensions.

The package resolves a GitHub repository reference to an immutable commit,
selects either the repository root or a normalized monorepo package path,
validates the bounded archive as reviewable package source, stages it on the
Space filesystem, and commits it with an atomic directory swap. It records the
selected source location in the host-owned lock and never runs package-manager
scripts or extension code.
