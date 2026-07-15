# `@eidos.space/extension-runtime`

Host-owned runtime building blocks for Eidos file-based extensions:

- a fixed Rollup + Oxc compiler that consumes an already inspected in-memory
  package snapshot;
- the serializable host/worker protocol;
- trusted worker and sandbox-host bootstrap sources.

The compiler never reads a package directory, loads extension configuration,
installs dependencies, or executes package-manager lifecycle scripts.
