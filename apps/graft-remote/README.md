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

## Upstream baseline

Wire behavior comes exclusively from the official packages at the current
tested eidos-space/graft tag, presently v0.8.1 at commit
89b90628a55bccd9f159462fe94046ddb7de6169:

- @eidos.space/graft-remote owns Remote v1 validation, status codes, range
  reads, conditional operations, pagination, and the Graft-Protocol: 1 header.
- @eidos.space/graft-remote-hono owns the Hono route adapter.
- @eidos.space/graft-remote-cloudflare owns the R2 and SQLite Durable Object
  backend.

Those packages are not present in the public npm registry, so their unmodified
workspace sources live under the version-independent vendor/graft path. The
exact upstream tag, commit, and package tree ids are recorded in UPSTREAM.md.
Eidos-specific code does not duplicate or version-gate the protocol. A newer
official tag replaces this snapshot and becomes the tested baseline after the
service checks and current CLI end-to-end test pass.

## API boundaries

Public service discovery:

    GET /.well-known/graft
    GET /healthz

Authenticated repository discovery and idempotent provisioning:

    GET /api/graft/repositories
    PUT /api/graft/repositories/:repository
    GET /api/graft/usage
    Authorization: Bearer <OAuth access token or Sync CLI key>

The create response contains the user's derived namespace and canonical
remote_url. Repository names follow the Remote v1 repository segment rules.
Deletion, rename, sharing, and organization ACL management are deliberately
outside this initial slice.

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
Eidos Desktop device. Both resolve to the same stable `sub` and narrow Sync
grant below. Sync derives an opaque, protocol-safe namespace from the first 96
bits of `sub`'s SHA-256 digest. The namespace is an identifier, not an
authorization secret.

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
  repository existence, the owner id, and the stable internal repository id.
  INSERT OR IGNORE makes concurrent provisioning idempotent.
- One official SQLite RepositoryDurableObject per repository stores mutable
  HEAD and refs/\*\*. CAS and CAD are single conditional SQL statements, so only
  one concurrent ref writer can win.
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

5. The account supports SQLite Durable Objects and all three exported classes
   are present in the dry-run bundle.
6. Workers logs/traces, R2 retention/backups, request-size limits, quotas, abuse
   controls, and alerts for auth 503, storage 500, CAS 409, and rate limiting
   are reviewed.
7. Keep `SYNC_QUOTA_ENFORCEMENT=shadow` until Usage DO totals have been
   reconciled with R2. Set it to `enforce` only after alerts and rollback are
   ready. Verify both declared-length and multipart-staged Graft client uploads
   in the target environment.

No Cloudflare credential is stored in source or Wrangler vars. The production
MVP is intended to run as the `eidos-graft-remote` Worker on
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
- Each object request currently validates its bearer token through the public
  userinfo endpoint. A same-account service binding or short, revocation-aware
  cache should be considered after measuring real push/clone traffic.
- The server-side stable-device registry and immediate revocation gate are
  implemented, but Desktop must persist one UUID and repeat registration after
  OAuth refresh. Dedicated Sync CLI keys avoid that dependency and have their
  own access mode, expiry, and immediate revocation lifecycle.
- Rate limits, repository deletion, and unreachable object garbage collection
  are not implemented. Until GC exists, unreachable immutable bytes continue
  to consume quota, matching the commercial definition.
- A single upload is still subject to the Cloudflare plan's incoming
  request-body limit even though the Worker streams it.
- Desktop must wire access-token refresh and GRAFT_REMOTE_TOKEN handoff to a
  Graft client compatible with the advertised protocol. Pure CLI operation is
  already covered by the dedicated-key smoke. The current tested client is
  v0.8.1; Desktop integration remains intentionally isolated here.
