# `@eidos.space/extension-runtime`

Host-owned runtime building blocks for Eidos file-based extensions:

- a fixed Rollup + Oxc compiler that consumes an already inspected in-memory
  package snapshot;
- the serializable host/worker protocol;
- trusted worker and sandbox-host bootstrap sources;
- a DOM surface compiler and fixed iframe bootstrap that transfers extension
  code as a Blob instead of interpolating it into HTML.

The compiler never reads a package directory, loads extension configuration,
installs dependencies, or executes package-manager lifecycle scripts.

`@eidos.space/extension-runtime/surface` exposes the browser-safe iframe host
and surface client. The fixed CSP denies ambient network APIs, object/frame
embedding, media, fonts, forms, and raw host access. A UI bundle receives only
the versioned document API supplied by the host.
