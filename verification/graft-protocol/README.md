# Installed Lite protocol acceptance

These fixtures come from the reviewed Graft progress source at
`/tmp/codex-graft-progress` (base
`bae54776ef1e66d314e69379425a82c63718c7ed`, reviewed patch SHA-256
`55da17bd3740fd10b2c87026306128c5207700a727d0207b76bfa137bfebbc5d`).
The TypeScript remote fixture is the already-built Graft remote package 0.2.5;
the server protocol is unchanged. Its license and Graft's dual licenses are
retained here.

Only the SDK import and launch comment were adapted. Invoke the **installed**
Lite executable with `ELECTRON_RUN_AS_NODE=1`, then the test path and its actual
Resources directory. `createRequire` resolves `@eidos.space/graft` through that
app's `app.asar/package.json`. Both SDK/native runtime overrides are forbidden.
The loader is not redirected to a test addon after packaging.

The encrypted fixture checks 18 operations across aggregate, object and
multipart modes. The plain fixture checks five operations. They use only a
loopback protocol service and synthetic credentials. Byte plans, intermediate
events, cancellation/retry and final data are asserted. This proves the
installed SDK's network behavior; packaged window startup and rendered UI
remain separate acceptance checks.
