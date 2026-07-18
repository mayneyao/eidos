# External Eidos File consumer

This Vite application is the reference implementation for both public journeys:

- embed a browser-owned `EidosFileSession` and built-in Grid view;
- register a typed, non-trivial Timeline renderer through the public React API.

The manifest pins the public packages to `0.1.0`. `.npmrc` disables workspace
linking, and `verify:registry` rejects monorepo resolution. The release gate
copies this directory outside the repository, replaces the two exact registry
dependencies with candidate tarballs, then runs install, build, and test.

After the public release:

```bash
pnpm install --frozen-lockfile
pnpm verify:registry
pnpm test
pnpm build
```

The included sample file is opened in browser memory. Native file access is
used only after the user chooses **Open local .eidos**; imported-file browsers
fall back to saving a downloaded copy.
