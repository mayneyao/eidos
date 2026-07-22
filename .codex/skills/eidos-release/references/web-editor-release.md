# Web Editor Release Runbook

Use this runbook to deploy `apps/eidos-file-web` to `https://editor.eidos.space`.

## Establish the release boundary

Treat the Web editor as a manual Cloudflare Workers deployment. No GitHub workflow currently deploys it, and a Desktop `v*` tag does not update it.

The production build consumes source directly from:

- `apps/eidos-file-web`
- `packages/eidos-file`
- `packages/eidos-file-ui`

Inspect `apps/eidos-file-web/wrangler.jsonc` and require the Worker name `editor-eidos-space`, custom domain `editor.eidos.space`, and static asset directory `./dist` to remain intentional.

Before release, record:

```bash
git status --short --branch
git rev-list --left-right --count dev...origin/dev
git rev-parse HEAD
pnpm exec wrangler deployments list --config apps/eidos-file-web/wrangler.jsonc --json
```

Preserve unrelated worktree changes. Commit and push only the intended Web/release-process changes. Require the deployed source commit to exist on `origin/dev` unless the user explicitly requests another branch.

## Run pre-deploy gates

Run package tests and type checks from the dependency boundary upward:

```bash
pnpm --filter @eidos.space/eidos-file test
pnpm --filter @eidos.space/eidos-file typecheck
pnpm --filter @eidos.space/eidos-file-ui test
pnpm --filter @eidos.space/eidos-file-ui typecheck
pnpm --filter @eidos.space/eidos-file-web test
pnpm --filter @eidos.space/eidos-file-web typecheck
pnpm build:eidos-file-web
```

Run focused Chromium E2E coverage for changed high-risk flows. For Relation changes, require both the runtime-data-source empty-array regression and the readable Relation metadata E2E. Expand to the full browser matrix when shared browser/runtime behavior changed.

Inspect `apps/eidos-file-web/dist` and verify that `index.html`, hashed JS/CSS, SQLite WASM, fixtures/templates, `manifest.webmanifest`, `sw.js`, and `pwa-update-policy.js` exist. Do not deploy a stale pre-existing `dist` directory after a failed build.

## Deploy with commit provenance

Deploy the freshly built current source with a message containing the short commit SHA and purpose:

```bash
pnpm --filter @eidos.space/eidos-file-web exec wrangler deploy --message "Deploy <short-sha>: <summary>"
```

Record the emitted Worker version ID. Then query deployments again and require a new deployment at 100% whose version ID matches the command output.

If Wrangler succeeds but the active deployment does not change, do not report success. Inspect rollout state before retrying.

## Verify production independently

Fetch the public origin with cache bypass after deployment:

```bash
curl -fsS -H 'Cache-Control: no-cache' "https://editor.eidos.space/?verify=<version-id>"
curl -fsS -H 'Cache-Control: no-cache' "https://editor.eidos.space/sw.js?verify=<version-id>"
```

Resolve the hashed main JS/CSS from the fetched HTML. Require them to return HTTP 200 and verify release-specific markers in the new bundle. For a bug fix, check both that obsolete markers are absent and new behavior markers are present.

Run a production browser smoke that opens a bundled template and exercises the changed user flow. For Relation releases:

- show record titles instead of UUIDs;
- show the related table name while keeping technical IDs collapsed;
- clear an existing Relation and confirm the save succeeds without `Unable to save record`;
- reload or reopen the file and confirm the Relation remains empty.

Check console errors and failed network requests. Do not mutate user-owned files; use a bundled template or a temporary browser-local copy.

## Account for PWA caching

The app uses prompt-based service-worker updates. A new deployment updates the origin immediately, while an already-open installed PWA may continue running its old worker until the update prompt is accepted.

Verify that the new `sw.js` references the new hashed assets. In the handoff, tell users with an open editor to accept the update prompt or hard-refresh after saving their work. Do not interpret an old already-open tab as evidence that Cloudflare failed to deploy.

## Report proof

Report:

- deployed Git commit and remote branch proof;
- previous and new Cloudflare deployment/version IDs and timestamps;
- Wrangler command success;
- public HTML bundle hash and service-worker evidence;
- production user-flow result;
- tests, type checks, build, and any intentionally skipped browser matrix;
- unrelated worktree changes left untouched.
