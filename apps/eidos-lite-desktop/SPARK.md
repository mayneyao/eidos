# Spark feature authorization

`src/shared/spark.ts` owns stable feature IDs and the renderer-facing status.
`src/main/account/spark-service.ts` owns signed device authorization and the
environment-isolated offline cache. The preload exposes status, activation,
release and the official Spark page; account bearer tokens stay in the main
process. Add new feature IDs in both the account grant projection and the Lite
registry, and use `SparkService.require(feature)` at the host operation boundary.

The initial integration is `file-metadata`: new metadata catalogs, metadata
Runtime mutations and plugin metadata patches share a SpaceSession guard.
The Space-wide catalog lives at `.eidos/files.eidos`. Explorer and folder
**Manage files** actions open the same catalog with a directory scope. The
creation guard runs before the catalog is written; a denied first open shows
Spark activation guidance instead of missing-file recovery.
Ordinary local files and existing metadata reads do not require Spark. The
canonical File Runtime and open format remain independent of commercial policy.

Purchases deliver a one-time CDK to the purchaser's account page. The purchaser
can give the code to another person. Redemption binds the license to the
recipient's account; only that account can activate devices. Lite opens
`/account/spark` for code redemption and order management. Buying alone does not
enable features. Existing account-bound licenses keep their owner. Personal
licenses allow three devices. New devices activate automatically at sign-in or
refresh when a seat is available. Explicitly released devices require manual
reactivation, so background refresh cannot reclaim a remotely released seat.
The account page lists owned activations and can release inaccessible computers.

The account service issues grants only for the new purchase plan. Legacy Spark
licenses are not upgraded implicitly. The main process checks Ed25519 signatures,
issuer, audience, device ID and expiration. Spark derives its device ID from the
operating system machine identifier (hashed before transmission) and falls back
to the Eidos device identity only when no stable machine identifier exists.
Account registration sends this identity as `sparkHardwareId`, separately from
the Sync installation UUID. The account service binds it to the authenticated
OAuth token and signs that value into Spark certificates. Registration and
verification share one cached resolver in the account session. Existing signed-in
profiles register this binding on their first token use after restart. Existing
new-Spark UUID activations move to the machine binding without consuming another
seat or restoring an explicitly released activation.
A valid cache survives sign-out and offline restart. An expired cache enables no
features; a large backward clock change disables an offline grant until Spark is
refreshed online. Server-confirmed loss of authorization clears the cache, but a
certificate issued to a different account is preserved for that owner instead of
being deleted by the current sign-in. Updates poll every 30 minutes and can be
refreshed in Settings. Expired grants attempt refresh at use time. The server
determines the lease duration; Lite does not invent an offline allowance.
Updated clients opt into certificate version 2. A perpetual purchase without a
license expiry gets a signed v2 grant with `offlinePolicy: "perpetual"` and
`expiresAt: null`. Version 1 grants remain bounded and compatible with older
clients. Remote release or revocation takes effect at the old device's next
online check; indefinite offline use cannot also promise immediate remote
revocation. A copied profile that also copies a valid v2 cache can keep that
device grant valid offline; the machine-ID binding prevents the common
profile-only copy, but it is not hardware attestation.

Builds require `EIDOS_LITE_SPARK_PUBLIC_KEY_STAGING` or
`EIDOS_LITE_SPARK_PUBLIC_KEY_PRODUCTION` (base64 SPKI DER). The staging pin is a
reviewed fallback; production never falls back to the committed pin, so release
builds must supply the GitHub Actions variable. An absent or mismatched key
cannot enable Spark. Packaged apps ignore account-origin overrides. Local
testing uses `EIDOS_LITE_ACCOUNT_ORIGIN` with an HTTPS test tunnel and a separate
development profile; account credentials and leases are isolated by origin.

## Signing key configuration and release gates

`spark-public-keys.json` contains public SPKI DER keys encoded as base64. Public
keys are distributable; private keys must never enter this repository or a Lite
build. The staging public key is pinned in this file, so a normal staging build
needs no local override. The corresponding account Worker holds the Ed25519
private key in its `LICENSE_PRIVATE_KEY` secret for staging (base64 PKCS8 DER).
Production Spark uses a separate `SPARK_SIGNING_PRIVATE_KEY` secret and refuses
to fall back to the legacy `LICENSE_PRIVATE_KEY`. Existing legacy signing keys
and issued licenses must remain unchanged.

The production public key is pinned separately. Production builds require
`EIDOS_LITE_SPARK_PUBLIC_KEY_PRODUCTION` from the GitHub Actions repository
variable of the same name and never fall back to the committed pin. Configuring
this variable does not deploy the account service or enable sales. Never copy
the staging private key into production. An empty or missing production
variable fails the build instead of silently using a pin.

Private key backups stay outside version control. The local account checkout
keeps the production pair in its ignored `.wrangler/production/spark-signing-key.json`
with mode `0600`. Use `wrangler versions secret put SPARK_SIGNING_PRIVATE_KEY`
to prepare an undeployed version; ordinary `wrangler secret put` deploys
immediately and must not be used for preparation. Before and after preparation,
compare production deployments to confirm traffic did not change. The prepared
secret version contains the existing service code, so it does not itself ship
the new Spark signing implementation. A later reviewed release must include
both the new code and the prepared secret; keep checkout closed until sales
are explicitly authorized.

Production signing preparation was verified on 2026-10-19: the repository pin
and GitHub Actions variable match the independent pair, and the private key is
stored in an undeployed Worker version. The deployed production version and
legacy signing bindings remain unchanged. Local checks exercise the actual
account signer and Lite verifier using this pair with an in-memory license
fixture; they do not issue a real production license or call Live checkout.

Every Vite build validates that its key is an Ed25519 public key. Production
rejects missing keys and both the pinned and overridden staging public key.
`dist-electron/spark-key-build-policy.json` records the environment, public key
and SHA-256 fingerprint. Build and packaging verification checks this record
against configuration and checks that the Electron JavaScript contains the same
public key; stale builds and missing manifests fail before packaging.

Release packaged smoke also requires
`EIDOS_LITE_SPARK_TEST_CERTIFICATE` (the JSON `{payload, signature}` certificate)
as a repository secret. The certificate must be signed by the production
`SPARK_SIGNING_PRIVATE_KEY`, is verified against the packaged public key, and
must declare the production issuer and audience. The release workflow sets
`EIDOS_LITE_SPARK_REQUIRE_SIGNED_TEST_CERTIFICATE=1`, so an unconfigured or
mismatched production signing pair fails the release instead of shipping a key
that cannot activate purchases. The certificate contains no private key and is
never embedded in the application.

For an independent staging account service, set
`EIDOS_LITE_SPARK_PUBLIC_KEY_STAGING` in the environment before starting or
building Lite. Packaged Lite uses its compiled key; it cannot replace it with a
runtime environment override. Changing a signing key invalidates previously
issued certificates unless the old key remains supported. Current certificates
have no key ID or key ring, so do not rotate the signing key without a migration
plan for offline installations.

Run the cross-repository integration from the repository root:

```sh
node scripts/run-electron-node.mjs scripts/spark-local-integration.mjs
```

It uses the sibling `eidos.space` checkout, or `EIDOS_SPARK_ACCOUNT_REPO`, actual
HTTP routes on loopback, an in-memory database, test OAuth device credentials
and a simulated signed payment. It makes no remote requests. See
`eidos.space/docs/spark-local-test.md` for real Creem Test Mode setup and the
remaining sales decisions. Native UI verification must follow `AGENTS.md`.
