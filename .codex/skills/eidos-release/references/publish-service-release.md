# Eidos Publish deployment

Use this runbook to deploy the hosted Publish surface backed by
`apps/eidos-publish`, its Container Runtime, and its static Serve UI.

## Establish the deployment boundary

Publish is not only a Worker:

- `apps/eidos-publish` owns the control Worker, Workflow, R2/SQLite Durable
  Object contracts, Gateway, bindings, and Container configuration.
- `apps/cli/qjs-host/ui` is served directly as the Worker's static UI.
- the Container Dockerfile builds the current CLI workspace into `eidos` and
  `eidos-publish-supervisor`; the CLI's embedded QuickJS Runtime and Serve UI
  are therefore Container inputs too.
- production `*.eidos.ink/*` ingress is owned by `apps/eidos-file-relay`, which
  forwards non-Relay hosts to Publish.
- the sibling eidos.space account service owns authentication, entitlements,
  private-viewer exchange, summaries, and its reciprocal service binding.

A CLI tag, npm package publication, Lite release, or Web deployment does not
deploy Publish. Publish must be assessed and proven independently even when it
uses the same source commit.

## Prove the current baseline

Record the source and active staging/production deployments before building:

```bash
git status --short --branch
git rev-list --left-right --count dev...origin/dev
git rev-parse HEAD
pnpm --filter @eidos.space/publish-service exec wrangler deployments list --env staging --json
pnpm --filter @eidos.space/publish-service exec wrangler deployments list --env="" --json
```

Require the active deployment to be at 100%. Its deployment message must
contain the source commit SHA. If an older deployment lacks provenance, report
the baseline as unproven and use the last independently evidenced source as a
conservative comparison point. Do not present a timestamp-based guess as an
exact deployed commit. A new proven deployment may establish the baseline for
future assessments.

Inspect the diff across every Publish input, not only `apps/eidos-publish`:

```bash
git diff --stat <baseline>..HEAD -- \
  apps/eidos-publish apps/eidos-file-relay apps/cli \
  packages/eidos-file packages/eidos-file-ui packages/eidos-file-serve
```

Separate direct Worker changes from generated UI, Runtime/Container, Relay, and
account-service changes in the deployment plan.

## Refresh generated inputs when authorized

Only refresh committed generated inputs during release preparation, not during
a report-only impact assessment.

When the QuickJS Runtime source changed and Publish should consume it:

```bash
pnpm --filter @eidos.space/eidos-file build:quickjs
```

When shared UI or Serve UI source changed and Publish should consume it:

```bash
pnpm --filter @eidos.space/eidos-file-serve build
```

Review `apps/cli/qjs-host/bundle` and `apps/cli/qjs-host/ui` after generation.
Require every referenced asset to be tracked and reject unrelated generated
churn. Commit and push source plus generated outputs before deployment. Never
deploy a dirty local bundle whose bytes cannot be reconstructed from the
reported commit.

## Run local and staging gates

Start with the gates owned by each changed boundary. For a full Publish
deployment run:

```bash
pnpm install --frozen-lockfile
pnpm --filter @eidos.space/eidos-file test
pnpm --filter @eidos.space/eidos-file typecheck
pnpm --filter @eidos.space/eidos-file-ui test
pnpm --filter @eidos.space/eidos-file-ui typecheck
pnpm --filter @eidos.space/eidos-file-serve test
pnpm --filter @eidos.space/eidos-file-serve typecheck
pnpm --filter @eidos.space/eidos-file-serve build
node --test apps/cli/release.test.mjs
cd apps/cli
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
cd ../..
pnpm --filter @eidos.space/publish-service check
pnpm --filter @eidos.space/publish-service test
pnpm --filter @eidos.space/publish-service dry-run:staging
pnpm --filter @eidos.space/publish-service dry-run:production
pnpm --filter @eidos.space/publish-service container:build
git diff --check
```

When Relay or its Publish binding changed, also run:

```bash
pnpm --filter @eidos.space/eidos-file-relay check
pnpm --filter @eidos.space/eidos-file-relay test
pnpm --filter @eidos.space/eidos-file-relay dry-run:staging
pnpm --filter @eidos.space/eidos-file-relay dry-run
```

Do not silently accept Wrangler warnings about unexpected configuration,
missing Durable Object migrations, bindings, compatibility, assets, or
Containers. Resolve them or establish why they are valid before production.
Never weaken Worker, Container, or protocol tests to make deployment proceed.

Require a clean, pushed commit before deploying staging. Use a commit-bearing
message and record the emitted version ID:

```bash
pnpm --filter @eidos.space/publish-service exec wrangler deploy \
  --env staging \
  --message "Deploy <short-sha>: <summary>"
```

Query staging deployments again and require the emitted version at 100%.
Exercise the changed paths against controlled staging publications, not
user-owned data. A full-risk deployment covers:

- public, password, and private viewing;
- publish, activation, rollback, and downgrade behavior;
- fresh Container cold start and read-only Runtime enforcement;
- static Serve UI assets and changed UI flows;
- attachment and Form collection paths when affected;
- multipart, large-source, or Graft delta paths when affected;
- cross-Tenant sharing and isolation.

Miniflare tests and a local Docker build do not substitute for the real
Container and service-binding staging gates.

## Deploy production with provenance

Require the exact validated commit on `origin/dev` unless the user explicitly
chooses another source. Record the previous production version ID, then deploy
the same commit and purpose used for staging:

```bash
pnpm --filter @eidos.space/publish-service exec wrangler deploy \
  --env="" \
  --message "Deploy <short-sha>: <summary>"
```

For compatible contract changes, deploy Publish before a Relay or eidos.space
consumer that depends on the new behavior. For incompatible changes, design an
explicit backward-compatible rollout instead of assuming simultaneous deploys.
Do not mutate the sibling eidos.space project or deploy Relay unless the user
placed those surfaces in scope.

If production verification fails, stop and report both version IDs and the
failing evidence. Do not repeatedly redeploy, roll back, or alter production
data without the authority required for that action.

## Prove the public result

Do not claim success from Wrangler's exit code alone. Verify:

- the new production version is active at 100% and its message contains the
  exact Git commit;
- the public control origin and a controlled `*.eidos.ink` publication route
  reach the intended Worker/Relay path;
- the public static UI hash or a release-specific marker matches the committed
  `apps/cli/qjs-host/ui` output;
- a fresh Container starts the committed Runtime/Supervisor and serves a
  read-only publication;
- the changed public/password/private, attachment, Form, rollback, or lifecycle
  flows pass as applicable;
- Worker and Container logs show no new errors, binding failures, or failed
  requests during the smoke;
- any coordinated Relay or account deployment is active and its contract is
  compatible.

Report the deployed commit, previous and new staging/production version IDs,
public URLs, generated input hashes or markers, local/staging/production gates,
Container and viewer proof, coordinated surfaces, unresolved warnings, and
final branch/worktree state.
