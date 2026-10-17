# Account repository management

The account website owns the signed-in UI and confirmation. The Sync Worker
owns repository state, object storage and usage. `SyncAccountEntrypoint` is a
private service binding: it has no public management route. The account Worker
supplies the verified session user ID; the Sync Worker derives that account's
namespace and checks ownership again. An active subscription is not required
to list or delete the account's stored repositories.

## Deletion lifecycle

1. Persist `deleting` in the directory before admitting further operations.
2. Drain admitted requests. Their leases renew while work runs. An abandoned
   lease expires after five minutes and receives a further five-minute grace
   before cleanup; a successful request releases its lease immediately.
3. Abort repository multipart uploads and erase repository metadata.
4. Delete the repository's R2 prefix in bounded pages, resuming through alarms.
5. Remove tracked immutable usage and reservations, then mark `deleted`.

Cleanup failures retain the tombstone and retry through an alarm. Account
status polling reports completion only after object cleanup and usage release.
Repeated deletion is idempotent. Opaque identity tombstones remain so stale
clients cannot recreate the same repository. Deletion is not an account-erasure
operation, a subscription cancellation or a command to erase downloaded copies.
Local files and local history are unchanged.

## Deployment and recovery

Deploy the Sync named entrypoint before the account service binding. Use separate
staging resources and disposable account-owned repositories for destructive
acceptance. Never delete a user's repository merely to test the production UI.
Verify the account session boundary, confirmation and cancellation, asynchronous
completion, protocol rejection and exact usage release. Tests cover request
draining, abandoned leases, restart recovery, multipart uploads, object paging,
neighbor isolation, ownership and idempotency.

The directory schema changes are additive. Keep a deletion-aware Sync version
as the rollback target once deletion is available: older implementations do not
honor lifecycle tombstones and must not be restored to serve repository traffic.
The account UI can roll back independently while keeping the deletion-aware
Sync Worker running. Do not remove tombstones, manually recreate repository
metadata or restore R2 objects as an incidental rollback operation.

Production encrypted creation is controlled separately by
`SYNC_ENCRYPTED_CREATION`. Pausing creation with `disabled` does not stop
repository deletion. Repository management must not change that rollout setting.
When updating the pinned Graft Remote package, verify the multipart maintenance
contract in `src/repository.ts` against that version before deployment.
