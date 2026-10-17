# Encrypted Sync operations and delivery

This runbook covers the `encrypted-remote-v1` profile used by Eidos Lite and the
Graft Remote Worker. It describes the candidate's configuration and acceptance
requirements. It is not a record of a production deployment. Record the exact
client artifact, Worker version, dependency provenance, and completed checks
for each rollout.

## Components and supported clients

- Eidos Lite owns account sign-in, password input, operating-system secure
  storage, local file/runtime coordination, and user-visible recovery.
- The native Graft E2EE implementation owns encryption, authenticated reads,
  publication, exact reference updates, and retained recovery state.
- The Remote Worker owns account authorization, repository provisioning,
  encrypted identity, quotas, transport, and persistence. It does not receive
  the sync password or decryption keys.
- The account Worker owns OAuth, stable device registration, revocation, and
  the versioned `sync_access` grant. An account reset cannot recover E2EE keys.

The encrypted client is supported by E2EE-capable macOS and Linux Lite builds.
Windows, mobile, browser clients, and a Graft binary built without E2EE are not
equivalent clients. Existing ordinary remotes remain a separate supported
profile. A missing encryption module or capability must stop the encrypted
operation; it must not retry over plaintext transport.

Use the lockfile, `verify:graft-release`, and the immutable workflow source to
identify the published registry dependencies and their integrity. Package
version strings alone do not distinguish a workspace archive from a public
registry package with the same version. Final release proof must use the release
workflow's published dependency artifacts without local native path overrides,
as required by the Lite release runbook.

## Environment configuration

The account origin and remote origin must be one matched environment:

| Setting                           | Production                              | Staging                                         |
| --------------------------------- | --------------------------------------- | ----------------------------------------------- |
| Worker                            | `eidos-graft-remote`                    | `eidos-graft-remote-staging`                    |
| `PUBLIC_REMOTE_ORIGIN`            | `https://sync.eidos.space`              | `https://sync-staging.eidos.space`              |
| `AUTH_USERINFO_URL`               | `https://eidos.space/api/sync/userinfo` | `https://staging.eidos.space/api/sync/userinfo` |
| `EIDOS_ACCOUNT` service           | `eidos-space`                           | `eidos-space-staging`                           |
| `GRAFT_OBJECTS` bucket            | `eidos-graft-remote-objects`            | `eidos-graft-remote-staging-objects`            |
| `SYNC_ACCESS_ENFORCEMENT`         | `enforce`                               | `enforce`                                       |
| `SYNC_QUOTA_ENFORCEMENT` template | `shadow`                                | `enforce`                                       |

`SYNC_ENCRYPTED_CREATION=enabled` permits new encrypted provisioning.
`disabled` pauses that provisioning without disabling reads or writes for
existing encrypted repositories. The checked-in production and staging
configurations use `enabled`; account access enforcement remains required.
Verify the production canary below for every rollout. It is a rollout control, not permission to
turn encrypted repositories into ordinary ones. Keep account access enforcement
enabled independently of this switch. Production quota enforcement moves from
`shadow` to `enforce` only after R2 usage reconciliation and alert verification.

All four SQLite Durable Object bindings are required: `GRAFT_REPOSITORIES`,
`GRAFT_DIRECTORY`, `GRAFT_USAGE`, and `GRAFT_ACTIVITY`. Preserve their identities,
the R2 bucket, and the account's stable subject mapping across deployments.
There is no server-side encryption-password environment variable to configure.
Never add sync passwords, account bearer tokens, or root keys to Wrangler vars.

Provision an encrypted repository through the authenticated management endpoint
using `{"display_name":"Personal Space","encryption":"encrypted-remote-v1"}`.
The server allocates and retains the profile and random repository UUID. Clients
must validate the returned descriptor and bind it to the authenticated account,
remote URL, and their local host state. Repeated provisioning must preserve that
identity; a profile conflict must fail. Ordinary and encrypted objects must not
share a repository profile.

## Data and security boundaries

The encrypted contents include files, SQLite snapshots, paths, branch names,
commit messages, and authoritative indexes. Account identity, cloud display
name, repository UUID/profile, object sizes and counts, access timing, and
opaque version ancestry/ref-routing relationships remain visible. The service
can authorize and meter a repository without reading its contents.

This profile does not provide author signatures, complete reference rollback
or fork detection, global freshness, service availability, or erasure of copies
already delivered. Do not advertise hidden activity or server-assisted password
recovery. Local files, working databases, and decrypted caches remain plaintext.

Lite stores remembered password ciphertext outside the Space, bound to the
environment, account, remote identity, and local path. Unsupported or weak
Linux secure-storage backends must use session-only unlocking. Do not treat
unsigned development Keychain behavior as proof for signed applications.
Changing the default password in Lite Settings affects new Spaces only.
Native SDK password rotation is not a delivered Lite per-Space UI action, and
changing a password does not revoke a device that already holds the root key.

Immutable encrypted bytes, including history and abandoned successful uploads,
consume quota. Transactional metadata is treated separately by the quota adapter.
Quota reservation must cover ordinary, bundled, and multipart paths. An
uncertain persisted upload must not be released as though it never existed.
Removing a file from the latest version does not immediately reclaim its history.

Do not put an expiration rule on the backend's encrypted object or staging
prefixes. A completed published object can still live under a staging prefix.
Garbage collection needs verified reachability and accounting reconciliation;
prefix names, age, or a failed final CAS are not sufficient deletion evidence.
Back up R2 objects and Durable Object state as a coordinated repository state.
Restoring objects without their exact profile, refs, and visibility metadata can
leave a repository unreadable.

## Preserve an ordinary origin and its history

Lite does not convert a connected ordinary remote in place and does not offer
a one-click history migration. A normal Recovery Space copies current files;
it is not a complete-history migration. Use a controlled migration with the
matching E2EE-enabled Graft SDK/CLI for a history-preserving copy:

1. Finish and checkpoint local edits. Stop writes on all participating devices,
   close Lite and other SQLite/file writers, and retain a backup of the source.
2. Copy the entire source into a new folder, including `.graft` and its complete
   local history. Verify ordinary-file hashes, database readability, refs, and
   history against the source. Do not edit the source's origin or metadata.
3. Provision a **new** encrypted cloud repository. Allocate a new private host
   state directory outside both folders. Use a separately retained password
   and the exact new descriptor returned by the service.
4. From the copied repository, prepare an explicit migration plan with all
   required refs, their mappings, and target HEAD. Publish the retained plan,
   independently restore every selected ref and its reachable history into a
   fresh directory, and then perform the native fenced cutover on the copy.
   The SDK exposes `prepareEncryptedMigration`, `resumeEncryptedMigration`,
   `verifyEncryptedMigration`, and `cutoverEncryptedMigration` for this purpose.
5. Require `host-cutover-confirmed`, verify the copied folder's new origin and
   upstreams, and verify that the original folder's config, refs, history, and
   files are unchanged. Keep the migration journal and verification copy.
6. Open the new cloud Space independently on each device with its password.
   Verify current files and saved history before resuming edits. Keep the old
   connection and backup until every device has switched.

A failed or uncertain migration resumes the retained plan. Do not erase its
private state to retry with newly generated keys. Cutover is local to the
participating host; it does not revoke offline devices or modify their origins.
If the copied repository's config already points at a different remote, use the
migration operation rather than deleting or hand-editing that origin.

Before the first new write, rollback means reopening the intact original.
After new edits reach the encrypted copy, first preserve and reconcile those
edits; reverting a server or pointing clients at the old origin will not carry
them back. No rollback procedure should overwrite the only current copy.

## Rollout and rollback

1. Record immutable client/SDK/Worker inputs and a baseline encrypted repository
   that can be restored with the candidate. Complete the checks below in staging.
2. Deploy the E2EE-capable Worker before offering new encrypted client
   connections. Existing ordinary repositories must still pass their regression
   smoke. Keep new provisioning disabled during an infrastructure-only rollout
   when the client delivery is not ready.
3. Enable encrypted provisioning, test one dedicated production canary with
   synthetic data, then release the verified client artifacts. Record active
   Cloudflare version IDs and actual installed-client evidence; a dry run or
   a successful build is not deployment proof.
4. Observe provisioning failures, authentication failures, quota denials,
   storage errors, reference contention, transfer latency, and restore failures.
   Diagnose with safe error codes and request IDs. Do not log password bytes,
   bearer credentials, decrypted filenames/content, or private host state.

For an incident, disable **new encrypted provisioning** first. Keep existing
encrypted reads/writes available when safe. If necessary roll back to a known
E2EE-capable Worker version that can read the current stored schema. An older
plain-only Worker or client is not a compatible encrypted-data rollback.
Preserve R2, Durable Objects, private recovery state, and secure-storage records.
Never clear or downgrade a profile to make an old client accept it.

Account/device revocation is enforced through the account boundary, with the
documented five-second burst-cache bound. Revoking account access does not erase
downloaded plaintext or keys held by that device. A lost trusted device may
require a new root and separately coordinated migration, not merely a default
password change.

## Required release evidence

Run service type generation/checks, its Workers-runtime tests, and explicit
production and staging dry runs. Run Lite typecheck, focused native E2EE tests,
the complete Lite suite, performance checks, a production build, and packaged
smoke with the exact published native dependency. Use the
[Lite release procedure](../../eidos-lite-desktop/docs/RELEASE-RUNBOOK.md) for
signing, notarization, updater routes, and installed-artifact proof.

For each supported platform, retain evidence of:

- first setup through the actual password UI, initial upload, and independent
  restore with matching files and query results;
- a second isolated client, edits in both directions, restart without retyping
  when secure storage is available, and a session-only storage case;
- wrong-password rejection and successful retry in the same process;
- simultaneous updates, an explicit divergent merge, offline work, interrupted
  initialization/upload, restart recovery, and utility-process failure;
- a large multipart attachment, measured cold/warm transfer timings, quota
  rejection without a published partial ref, and retry after allowance changes;
- old ordinary repository compatibility, history-preserving copy migration,
  independently restored history, and a rollback rehearsal;
- macOS screen lock (including startup while already locked), system sleep,
  sign-out, account/device revocation, and app update without exposing secrets
  or falsely reporting synced files. Linux does not receive the screen-lock
  events used by Lite; do not claim that locking its screen clears the Sync
  session. Verify Linux quit/sign-out and supported sleep behavior separately;
- plaintext/credential scans of server objects, logs, and reports; independent
  security review of the cryptographic implementation and trust boundary.

Same-machine profiles prove independent host state, processes, and local copies;
they do not prove another operating system, another physical machine, a second
device registration, or another network path. Keep those limits in the release
record. Mark every gate **passed**, **failed**, or **not run**, with the exact
artifact and evidence path. Do not replace missing platform or packaged evidence
with unit-test counts, screenshots, or a local source build.
