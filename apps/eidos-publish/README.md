# Eidos Publish Service

This Cloudflare application publishes immutable Eidos Source Bundles through
the existing Eidos Runtime. It does not project user tables into Durable
Object SQLite and it does not implement a second Eidos query engine.

The service is currently a preview implementation and deliberately publishes
no EP conformance labels until the complete test families have shipped.

## Architecture

```text
eidos publish
  -> authenticated control Worker
  -> immutable Source Bundle in R2
  -> one versioned Cloudflare Workflow
  -> one stable shared Container shard for the Tenant
  -> Runtime Supervisor
  -> bounded eidos serve <version-local-copy> --publish processes

viewer
  -> wildcard Gateway + static Serve UI
  -> short-lived host/Version/target-bound Runtime ticket
  -> streaming read-only proxy
  -> sleeping or running shared Runtime shard
```

- `eidos.space` owns accounts, Publish CLI keys, subscriptions, one-time
  private-viewer authorization, account dashboard summaries, and the
  versioned `publish_access` grant.
- one SQLite Durable Object owns each Tenant's publications, immutable Version
  state, activation pointer, usage, idempotency, and retention;
- one Handle Durable Object serializes each normalized Publish handle claim and
  resolves only after the Tenant has activated the same expiring claim ID;
- R2 owns canonical manifests plus tenant-scoped, SHA-256-addressed source and
  attachment objects; Version metadata references those immutable objects;
- Workflows validate, prepare, probe, refresh activation entitlements, and
  atomically activate;
- Tenant IDs are deterministically assigned to a bounded pool of Container
  shards. Every active Publish tenant uses the same image and Runtime path;
- each Container runs a small trusted Supervisor that streams and verifies the
  exact R2 source, starts one `eidos serve --publish` child per active Version,
  and evicts idle children with LRU when process or disk limits are reached;
- each shard also enforces one aggregate request-concurrency ceiling, so a
  hot Version cannot create unbounded work for its shared neighbors;
- the Gateway serves the UI without waking a Container, meters and rate-limits
  Runtime access before wake, and never exposes Container or R2 credentials.

The Worker streams R2 bytes directly to the Supervisor without granting the
Container object-store or Internet credentials. Container cold-start,
Version-local download, and port readiness use a source-size-aware 60–900
second budget (4 MiB/s plus bootstrap allowance). Runtime Workflow steps use a
20-minute timeout, within Cloudflare's 30-minute step limit.

The publication URL is:

```text
https://{public-site-id-or-publish-handle}.eidos.ink/{publication-slug}
```

## Source and upload contract

The installed Driver accepts one `application/vnd.eidos+sqlite3` entrypoint and
the relative File-field attachments it references. The manifest is canonical
JSON and every object byte count and SHA-256 is verified.

- objects up to 95 MiB use a streamed create-only R2 `put`;
- larger objects use explicit 64 MiB client parts and R2 multipart upload;
- interrupted multipart completion is reconciled from the immutable R2
  object, and an incomplete session can be explicitly aborted;
- the client uploads only objects reported as pending; equal content is stored
  once per Tenant across File entries, paths, slugs, and Versions;
- a Version enters the Workflow only after every referenced object is ready;
- every mutation has an idempotency key; unequal reuse is rejected before a
  direct upload body is read;
- `eidos publish` derives stable operation keys, so rerunning after an
  interrupted process resumes the same immutable Version;
- the Worker never buffers a complete source body.

Published attachment resolution is intercepted by the Gateway before the
Container. It maps a Runtime File-entry ID to the active Version's immutable R2
object, applies the Publication's public/password/private authorization, and
streams GET/HEAD/Range responses with `nosniff`, same-origin isolation, and a
safe inline-image allowlist. Shared Containers mount only the `.eidos`
entrypoint and never copy attachment bytes into their local cache.

## Public, password, and private viewing

Public publications can request a Runtime ticket immediately. Private
publications use this handoff:

1. the canonical publication host redirects to the account host;
2. the signed-in account host creates a two-minute, one-time, audience-bound
   code and stores only its digest;
3. the publication host exchanges it through a service binding;
4. the publication host sets a five-minute `__Host-` HttpOnly cookie without a
   `Domain` attribute;
5. the Runtime ticket is independently bound to host, Tenant, Publication,
   active Version, target digest, access policy revision, visibility, and
   expiry.

Publish can also protect an individual Publication with a password. The
CLI prompts without echo (or reads `EIDOS_PUBLISH_PASSWORD` for automation),
and sends the password only to the control Worker over HTTPS. Tenant SQLite
stores a unique salt and a versioned six-round PBKDF2-HMAC-SHA256 verifier
(100,000 iterations per sequential round, 600,000 total), post-hashed with an
environment-specific pepper; plaintext passwords are never retained. The
public Gateway rate-limits verification per client and
Publication, then issues a 12-hour host-only `__Host-` HttpOnly cookie. The
cookie is bound to the Publication and access revision, so changing or
removing the password invalidates every prior password session immediately.

Viewer and Runtime responses apply CSP, frame denial, `nosniff`, referrer, and
cross-origin resource policies. Proxy requests strip cookies, public
authorization, Cloudflare/internal, and hop-by-hop headers.

## Budget and lifecycle

Tenant SQLite stores only bounded control records. Runtime starts and reserved
idle seconds are atomically checked before a build or cold start. Replays do
not reserve twice. Runtime sessions and requests have per-client and
per-Publication rate windows plus Free/Pro concurrency leases. The Gateway
allows only the read-only Runtime endpoints used by the UI and bounds request
and result bytes. Three consecutive cold-start failures open a bounded circuit
breaker.

Activation and rollback use the same Tenant transaction. Unknown Workflow
activation outcomes are reconciled from the pointer and activation event.
Current Versions cannot be deleted. A Tenant alarm retires non-current
versions only after the rollback grace window and current retention policy,
then explicitly deletes known R2 keys and unregisters the Version from its
shared shard. It never destroys a shared shard for one Version. Legacy
per-Version Containers are destroyed when their old target descriptor is
retired. Interrupted deletions remain retryable from `deleting`; failure and
lifecycle audit events retain the job, actor, request, step, code,
retryability, and time. A missing or mismatched R2 source marks the serving
target unhealthy and blocks new sessions.

## Configuration

Generated binding types live in `worker-configuration.d.ts`. The production
and staging Worker configurations declare R2, service, Workflow, Container,
Static Assets, and SQLite Durable Object bindings. `RUNTIME_SHARD_COUNT` is a
pool-generation routing input, while `RUNTIME_MAX_ACTIVE_VERSIONS`,
`RUNTIME_MAX_CACHE_BYTES`, and `RUNTIME_MAX_INFLIGHT_REQUESTS` bound each
shard. Changing the shard count is a cold cache migration, not a data
migration, because R2 remains authoritative.

Set these with the Cloudflare secret store in both the Publish and account
services; never add their values to Wrangler vars or source control:

```text
RUNTIME_TICKET_SECRET
PUBLISH_VIEWER_EXCHANGE_SECRET
PUBLISH_SERVICE_SECRET
PUBLISH_PASSWORD_PEPPER
PUBLISH_PASSWORD_SESSION_SECRET
```

`PUBLISH_VIEWER_EXCHANGE_SECRET` authorizes one-time private viewer exchanges.
`PUBLISH_SERVICE_SECRET` authorizes current-entitlement refreshes and the
account-summary service call. The same named service secret must match in both
Workers. `PUBLISH_PASSWORD_PEPPER` protects stored password verifiers, while
`PUBLISH_PASSWORD_SESSION_SECRET` signs browser password sessions. Use
independent random values of at least 32 bytes for each purpose.

Before the first environment deploy:

1. create the environment's declared R2 bucket and apply the additive
   eidos.space Publish entitlement/viewer migration;
2. configure the five secrets in the appropriate services;
3. deploy the Publish Worker once so the `eidos-space` service binding can
   target it (account-dependent calls remain closed until the next step);
4. deploy eidos.space with internal userinfo, private exchange, account
   summary, and the reciprocal `EIDOS_PUBLISH` service binding;
5. run public, password, private, downgrade, multipart, rollback, and
   cold-start staging smoke tests before enabling wildcard production traffic.

## Local verification

From the repository root:

```bash
pnpm --filter @eidos.space/publish-service check
pnpm --filter @eidos.space/publish-service test
pnpm --filter @eidos.space/eidos-file-serve test
pnpm --filter @eidos.space/publish-service dry-run:staging
pnpm --filter @eidos.space/publish-service dry-run:production
pnpm --filter @eidos.space/publish-service container:build
```

The Cloudflare test pool uses `ORCHESTRATION_MODE=control-only-test`: it proves
the control, R2, Gateway, Handle, private-session, quota, and retention
contracts without pretending that Miniflare starts a real Container. A real
Docker build and local Runtime smoke cover the Supervisor, multiple
Version-scoped `eidos serve` children, LRU capacity, Publish/read manifest,
semantic validation, non-root user, read-only sources, and mutation rejection.
The deployed staging cold-start, cross-Tenant sharing, isolation, and
large-source suites remain deployment gates.
