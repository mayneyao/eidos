# eidos-plugin-sandbox

Private Rust library for the process-scoped QuickJS plugin runner. Owns the event loop, resource limits, and network/BLE capability brokers. It does not implement Eidos File semantics and does not depend on the canonical File Runtime.

The CLI lives in `apps/plugin-sandbox`; Node host APIs and examples live in `packages/plugin-sandbox`. Use the root Cargo workspace and lockfile. `run(RunOptions)` is a blocking process-scoped entry point with stdio ownership, not a reentrant embedding API; Node hosts should use a separate process per background.

QuickJS isolation and host capability checks do not constitute an OS-level security sandbox.
