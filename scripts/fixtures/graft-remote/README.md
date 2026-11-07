# Official Graft service for native tests

The mobile encrypted Sync Cargo test starts the published
`@eidos.space/graft-remote` protocol engine, pinned to **0.2.6** with its own npm
lockfile. This package has no runtime dependencies. The in-memory backend and
Bearer credential are disposable loopback test data.

With Node.js 20 or newer, prepare this fixture explicitly from the repository
root before running the workspace Cargo tests:

```sh
npm ci --prefix scripts/fixtures/graft-remote --ignore-scripts --no-audit --no-fund
node scripts/fixtures/mobile-custom-sync-server.mjs --check
cargo test --workspace --locked --features eidos-mobile-host/ffi
```

This installation is independent of the desktop application and the root pnpm
workspace. `pnpm install` alone does not prepare this fixture. The Cargo test
does not install packages, download a server, or skip itself when preparation is
missing. CLI CI gates must explicitly prepare this package before running the
same Cargo command.

The `--check` command validates the fixture-owned package version, module
resolution and exports. It does not start a listener or access the network.
Without `--check`, the existing entry point starts a server on a random
`127.0.0.1` port and prints its ready JSON. The Rust test starts and stops only
its own child process. Existing Android/iOS commands can keep using
`scripts/fixtures/mobile-custom-sync-server.mjs` after this preparation.
