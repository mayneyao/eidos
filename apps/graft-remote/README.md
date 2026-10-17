# Eidos Graft Remote

This Worker hosts the Graft HTTP Remote v1 service for eidos.space. It is
deployed separately from edge-kit: Graft streams large immutable objects and
requires per-repository coordination that the general network helper does not.

The production repository URL is Git-like and contains no internal API prefix
or protocol version:

    https://sync.eidos.space/<namespace>/<repository>

The explicit graft+https form is also accepted by Graft clients. Never put a
credential in the URL; clients send either an eidos.space OAuth access token or
a dedicated Sync CLI key as a bearer token, normally through
GRAFT_REMOTE_TOKEN. CLI keys are independent of Desktop sessions and devices.

## Dependency and protocol baseline

Wire behavior comes from the upstream `eidos-space/graft` packages:

- @eidos.space/graft-remote owns Remote v1 validation, status codes, range
  reads, conditional operations, pagination, and the Graft-Protocol: 1 header.
- @eidos.space/graft-remote-hono owns the Hono route adapter.
- @eidos.space/graft-remote-cloudflare owns the R2 and SQLite Durable Object
  backend.

The package manifest pins all three Remote packages to registry version
`0.2.5`. Production deployment checks reject local overrides and require the
lockfile and installed dependency graph to resolve that exact cohort with
registry integrity. Eidos-specific code adapts account and quota policy and
does not reimplement the encrypted protocol. Release proof must identify the
resolved packages and their passed service/client compatibility checks.

The encrypted profile, server configuration, rollout controls, migration,
recovery, and production acceptance are documented in
[Encrypted Sync operations](./docs/ENCRYPTED-SYNC-OPERATIONS.md). This repository
can contain production-targeted source before that source has been deployed.

## API boundaries

Public service discovery:

    GET /.well-known/graft
    GET /healthz

Authenticated repository discovery and idempotent provisioning:

    GET /api/graft/repositories
    PUT /api/graft/repositories/:repository
    PATCH /api/graft/repositories/:repository
    GET /api/graft/usage
    Authorization: Bearer <OAuth access token or Sync CLI key>

The URL repository segment is a stable technical key and follows the Remote v1
repository segment rules. PUT remains compatible with bodyless clients and
accepts an optional `{"display_name":"Personal Space"}` JSON body. PATCH
updates only that display name; the technical key, internal repository id, and
canonical `remote_url` remain unchanged. Display names are trimmed,
NFC-normalized Unicode strings of 1–80 code points. They are user-visible
labels, so duplicates are allowed. Repository discovery lists newly created
Spaces first, using the technical key only as a stable tie-breaker. Deletion,
technical-key rename, sharing, and organization ACL management are
deliberately outside this initial slice.

Encrypted clients provision with
`{"display_name":"Personal Space","encryption":"encrypted-remote-v1"}`.
The server retains a fixed profile and UUID and returns the descriptor in
provisioning and discovery. Passwords and keys are never management API inputs.
An existing ordinary repository cannot be reclassified in place, and an
encrypted repository cannot be downgraded by a bodyless provisioning request.

Protocol traffic is rooted directly at the repository URL. A repository must
be provisioned before its descriptor or objects are accessible; an authorized
request for an absent repository returns 404.

## Authentication and authorization

The Worker validates bearer tokens with the first-party eidos.space Sync
userinfo endpoint identified by AUTH_USERINFO_URL. Worker-to-Worker traffic
uses the EIDOS_ACCOUNT service binding; the URL remains the public authority
published by discovery and the exact request URL seen by Identity. That endpoint accepts two
credential classes: a dedicated Sync CLI key with explicit read-only or
read-write permission, or a Better Auth OAuth token bound to an active, stable
Eidos Lite device. Both resolve to the same stable `sub` and narrow Sync
grant below. Sync derives an opaque, protocol-safe namespace from the first 96
bits of `sub`'s SHA-256 digest. The namespace is an identifier, not an
authorization secret.

Successful identity and repository-directory lookups use a process-local,
disposable five-second burst cache. Concurrent requests for the same bearer
fingerprint or owner-scoped repository share one authoritative lookup; errors
and missing repositories are never cached. The identity key stores only a
SHA-256 digest of the bearer and authority, caches are entry-bounded, and hits
do not extend expiry. OAuth expiry, device revocation, and entitlement changes
therefore have a maximum cache delay of five seconds rather than an unbounded
session lifetime.

The only commercial input Sync accepts is the versioned `sync_access` grant:

    {
      "version": 1,
      "revision": 3,
      "service": "eidos_sync",
      "access": "read_write",
      "quotaBytes": 10737418240,
      "deviceLimit": 0
    }

The parser rejects extra fields. In particular, plan, price, Credits, payment
provider, renewal, and billing-period data are not valid Sync inputs.
`deviceLimit: 0` means unlimited personal devices. The compatibility field is
not enforced by Sync; device registration and revocation belong to account
security, and rotating OAuth access tokens are never treated as device ids.

Authorization has two gates:

1. the URL namespace must equal the authenticated user's derived namespace;
2. the namespace directory must contain the requested repository with the same
   owner user id.

Missing, unregistered, revoked, or invalid credentials return 401 and a
WWW-Authenticate header. Cross-user namespace access returns 403. Repository
existence is checked before a backend is opened. OAuth token issuance, refresh,
device registration, CLI-key issuance, permissions, expiry, and revocation stay
owned by eidos.space. Desktop registers the same persisted device UUID after
OAuth token issuance or refresh; pure CLI users create a dedicated key on the
account page and do not register a Desktop device.

## Service responsibility boundary

| Service              | Owns                                                                                       | Does not own                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| eidos.space Bill     | Products, Creem, Credits, subscription lifecycle, refunds, and conversion to `sync_access` | Repository bytes, Graft protocol, or usage counters                                    |
| eidos.space Identity | OAuth/device validation, Sync CLI keys, and first-party delivery of `sync_access`          | Billing UI or Sync persistence                                                         |
| sync.eidos.space     | Repository ACLs, Remote v1, R2/DO persistence, measured usage, and grant/quota enforcement | Product catalog, prices, payment providers, Credits, renewals, or subscription periods |

Sync never queries Bill APIs or billing tables. Identity is the one-way trust
boundary: Bill publishes a capability-shaped grant; Sync consumes it without
knowing why it was granted. Access validation is side-effect free: a Graft
request must never charge Credits, create a subscription, or trigger renewal.

## Persistent data and concurrency

    request
      -> EIDOS_ACCOUNT service binding
         -> eidos.space Sync userinfo (Sync CLI key, or OAuth + active device)
      -> namespace RepositoryDirectoryDurableObject
      -> namespace SyncUsageDurableObject (account-wide bytes)
      -> official Remote v1 handler
         -> repository RepositoryDurableObject (HEAD and refs/**)
         -> R2 GRAFT_OBJECTS (immutable objects/store/logs/segments)

- One SQLite RepositoryDirectoryDurableObject per user namespace stores
  repository existence, the owner id, the stable internal repository id, and a
  mutable display name. Existing directory rows are backfilled from their
  technical name. INSERT OR IGNORE makes concurrent provisioning idempotent.
- One official SQLite RepositoryDurableObject per repository stores mutable
  HEAD and refs/\*\*. CAS and CAD are single conditional SQL statements, so only
  one concurrent ref writer can win. For encrypted repositories it also retains
  the fixed profile, encrypted reference values, and opaque routing/visibility
  state needed by the upstream adapter.
- R2 stores immutable bytes below a repository-prefixed key. The official
  backend streams bodies and uses If-None-Match: \* for create-only writes.
- One SQLite SyncUsageDurableObject per account namespace serializes byte
  reservations across every repository. Immutable uploads reserve their
  declared Content-Length before R2 writes. When a Graft client uses an
  unknown-length stream, the adapter stages it through fixed-size R2 multipart
  parts, reserves the measured size, then performs the same conditional final
  write and removes the staging object. Successful writes commit the actual
  stored size; create-only collisions reconcile from R2 metadata, and failures
  before persistence release reservations. An ambiguous post-persistence
  failure keeps its reservation and eventually counts it conservatively rather
  than risking quota undercount. Transactional HEAD/refs metadata is not
  counted. Unreachable immutable objects remain counted until a future verified
  garbage collector removes them.
- A successful mutation awaits the backing store. Storage exceptions become a
  non-leaking 500 protocol problem response; identity outages become 503.
  Every protocol response, including errors, carries Graft-Protocol: 1;
  unsupported versions return 426.
- SyncActivityDurableObject retains bounded account-level read, write, and
  management activity for the account service. It contains no decrypted file
  contents or sync passwords.

Failed final ref CAS operations can leave unreachable immutable objects in R2,
which is safe for repository visibility but requires a future garbage
collection policy.

## Local verification

From the repository root:

    pnpm install
    pnpm --filter @eidos.space/graft-remote-service types
    pnpm --filter @eidos.space/graft-remote-service check
    pnpm --filter @eidos.space/graft-remote-service test
    pnpm --filter @eidos.space/graft-remote-service exec wrangler deploy \
      --dry-run --outdir /tmp/eidos-graft-remote-worker

The Workers-runtime suite uses local SQLite Durable Objects and R2. It covers
discovery, authentication, version mismatch, missing repositories, cross-user
denial, provisioning, R2 create-only/range behavior, concurrent CAS, Durable
Object restart persistence, account-wide quota contention, missing streamed
upload lengths, usage reporting, and identity/storage failures.

For local protocol use, override PUBLIC_REMOTE_ORIGIN with the local Wrangler
origin and configure Graft with graft+http://127.0.0.1:8787. The production
configuration only advertises HTTPS.

To exercise the complete account boundary with a real current Graft CLI, keep
the local eidos.space identity service and this Worker running, then provide a
valid dedicated Sync CLI key (recommended for pure CLI use), or a first-party
Desktop OAuth token, without putting it in the remote URL:

    GRAFT_CLI_PATH=/absolute/path/to/graft \
    GRAFT_REMOTE_TOKEN='<Sync CLI key or Desktop OAuth token>' \
    pnpm --filter @eidos.space/graft-remote-service smoke:account-cli

The smoke idempotently provisions `graft-cli-e2e`, clones or bootstraps it,
commits a marker through the CLI, pushes it, clones into a second temporary
worktree, verifies the marker, and reads the account-wide usage summary. Its
output never includes the bearer token. Override `EIDOS_SYNC_ORIGIN` or
`EIDOS_SYNC_E2E_REPOSITORY` when needed.

## Deployment prerequisites

Do not deploy until all of these are confirmed in the target Cloudflare
account:

1. Apply `db/migrations/2026-07-27-sync-devices.sql` to the eidos.space D1
   database after the Better Auth OIDC schema exists.
2. AUTH_USERINFO_URL points to the production
   `https://eidos.space/api/sync/userinfo` endpoint. Desktop registers its
   stable UUID at `/api/sync/devices/register` after every token issuance or
   refresh; dedicated Sync CLI keys resolve without a Desktop binding. In both
   cases userinfo emits only `sub` plus the documented `sync_access` fields.
   The EIDOS_ACCOUNT service binding must target the `eidos-space` Worker.
3. PUBLIC_REMOTE_ORIGIN matches the sync.eidos.space custom domain.
4. The R2 buckets in wrangler.jsonc exist (or their names are changed):

   pnpm --filter @eidos.space/graft-remote-service exec wrangler r2 \
    bucket create eidos-graft-remote-objects
   pnpm --filter @eidos.space/graft-remote-service exec wrangler r2 \
    bucket create eidos-graft-remote-objects-preview

5. The account supports SQLite Durable Objects and all four exported classes
   are present in the dry-run bundle.
6. Workers logs/traces, R2 retention/backups, request-size limits, quotas, abuse
   controls, and alerts for auth 503, storage 500, CAS 409, and rate limiting
   are reviewed.
7. Keep `SYNC_QUOTA_ENFORCEMENT=shadow` until Usage DO totals have been
   reconciled with R2. Set it to `enforce` only after alerts and rollback are
   ready. Verify both declared-length and multipart-staged Graft client uploads
   in the target environment.
8. Set `SYNC_ENCRYPTED_CREATION` deliberately. `enabled` allows new encrypted
   provisioning; `disabled` pauses it while existing encrypted reads and writes
   remain available. Complete the encrypted delivery checks before enabling it
   for released clients. Retain an E2EE-capable rollback version.

No Cloudflare credential is stored in source or Wrangler vars. The production
configuration targets the `eidos-graft-remote` Worker on
`sync.eidos.space`; run this checklist before the first deployment and every
subsequent rollout.

## Staging environment

The `staging` Wrangler environment deploys a separate
`eidos-graft-remote-staging` Worker at `sync-staging.eidos.space`. It binds only
to `eidos-graft-remote-staging-objects`, its own SQLite Durable Object storage,
and the `eidos-space-staging` account Worker. Both access and quota enforcement
are enabled so staging exercises the commercial boundary rather than a shadow
configuration.

    pnpm --filter @eidos.space/graft-remote-service dry-run:staging
    pnpm --filter @eidos.space/graft-remote-service deploy:staging

Never omit `--env staging` from a staging deployment; the root Wrangler
configuration is production.

## Remaining operational risks

- Repository ownership currently depends on the OAuth provider's stable user
  id. An identity-id migration or reassignment needs an explicit directory
  migration before rollout or existing repository URLs will be stranded.
- Burst caching is isolate-local, so a cold isolate or a request routed to a
  different isolate still performs the authoritative account and directory
  lookups. `Server-Timing` must be monitored after rollout before considering
  a longer-lived repository capability; the five-second revocation bound must
  not be widened implicitly.
- The server-side stable-device registry and revocation gate are implemented
  with the documented five-second burst-cache bound, but Desktop must persist
  one UUID and repeat registration after OAuth refresh. Dedicated Sync CLI keys
  avoid that dependency and have the same bounded cache delay for access mode,
  expiry, and revocation changes.
- Rate limits, repository deletion, and unreachable object garbage collection
  are not implemented. Until GC exists, unreachable immutable bytes continue
  to consume quota, matching the commercial definition.
- A single upload is still subject to the Cloudflare plan's incoming
  request-body limit even though the Worker streams it.
- Desktop performs account refresh and scoped credential handoff through its
  trusted host. Validate the exact released native SDK and actual Desktop
  flows; a dedicated-key CLI smoke does not prove OAuth refresh, secure storage,
  UI recovery, or encrypted-client compatibility.
- Encrypted repositories need both R2 bytes and Durable Object profile/ref/
  visibility state. Do not expire objects based only on an adapter staging
  prefix. Password reset, quota adjustment, or deployment rollback cannot
  decrypt or convert existing encrypted data.
