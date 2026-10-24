# plugin-sandbox CLI

Native deliverable for the plugin sandbox. Build from the repository root:

```sh
cargo build -p eidos-plugin-sandbox-cli --release --locked
./target/release/plugin-sandbox run packages/plugin-sandbox/examples/hello.mjs
```

For Node SDK use, `pnpm --filter @eidos.space/plugin-sandbox build:native` also copies the executable to the SDK's platform directory. See `packages/plugin-sandbox/README.md` for permissions, background lifecycle, examples, and validation.
