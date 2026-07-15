# @eidos.space/extension-installer

Host-side installation primitives for Eidos file-based extensions.

The package resolves a GitHub repository reference to an immutable commit,
downloads only that commit, validates the archive as reviewable package source,
stages it on the Space filesystem, and commits it with an atomic directory
swap. It never runs package-manager scripts or extension code.
