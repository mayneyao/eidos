# Official Graft HTTP Remote packages

This version-independent directory contains the unmodified publishable
TypeScript packages from the current tested
[`eidos-space/graft`](https://github.com/eidos-space/graft) tag, `v0.8.1`.

- Annotated tag: `2beff61b71c215777335c58c1410ce64a25be28c`
- Commit: `89b90628a55bccd9f159462fe94046ddb7de6169`
- `packages/graft-remote` tree: `2a39d7d5845fd8283d1b8658cd9e01fd8b5e1217`
- `packages/graft-remote-hono` tree: `4231322ea9eccb281b28e0a9676828e57ebcdf55`
- `packages/graft-remote-cloudflare` tree: `9cb086af6a8c35f04b56254fe4f51833badaadd8`
- Packages: `@eidos.space/graft-remote`,
  `@eidos.space/graft-remote-hono`, and
  `@eidos.space/graft-remote-cloudflare`

The packages were added as a workspace dependency because version `0.1.0` was
not available from the public npm registry when this integration was created.
Eidos does not maintain a fork of the Remote v1 protocol here: host-specific
authentication, repository ACLs, discovery, and deployment composition live
in `apps/graft-remote`, while all wire behavior and Cloudflare object storage
remain owned by these upstream packages.

Before updating this directory, resolve the newest official semantic-version
tag from the upstream Git refs, compare it with this pinned commit, copy the
three package directories without local edits, and update the tag, commit, and
tree ids above. Then run the service check, Workers integration tests, Wrangler
dry-run, and an end-to-end operation with that tag's CLI as documented in
`apps/graft-remote/README.md`.
