# Manual Sync benchmarks

These diagnostics are opt-in and excluded from execution by default. They use
the real Graft SDK and Runtime. The policy and staging tests replace Electron's
utility process with a Node child process: measurements exclude renderer IPC,
UI responsiveness, account discovery, and actual utility-process startup.

## Prepare an isolated copy

Close the source Space before copying so SQLite files and Graft history are
consistent. Do not use a live database or a directory containing symbolic links.
From the repository root:

```sh
pnpm --filter @eidos.space/eidos-lite-desktop build
export EIDOS_SYNC_PERF_DIRECTORY="$(node apps/eidos-lite-desktop/scripts/prepare-sync-benchmark.mjs /path/to/closed-space)"
```

The command creates a private `eidos-sync-bench-*` directory under the system
temporary directory, with two copies (`source`, `local`) and an ownership marker.
The benchmark validates the real path, marker and absence of symlinks before
opening a copy. All generated workers, user data, clones and JSON results remain
in this directory. Copying preserves local history; use a sanitized fixture if
the source contains private data. The scripts never upload the original Space,
but staging tests upload the copied contents and history.

For row-editing tests, choose one existing record with a writable text field:

```sh
export EIDOS_SYNC_PERF_FILE=benchmark.eidos  # relative to the Space
export EIDOS_SYNC_PERF_TABLE=Records
export EIDOS_SYNC_PERF_FIELD=Name
```

Defaults are shown above. Install the `eidos` CLI on PATH. The first row returned
by `eidos context` is modified with revision checking. These tests do not create
the schema or record; prepare it before copying.

## Run one experiment at a time

Use a fresh copy for independent experiments. Do not enable multiple tests
against the same directory concurrently.

| Enable variable (`=1`)      | Test file under `src/main/graft/`         | Measurement / effects                                                                                                                 |
| --------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `EIDOS_SYNC_PERF_BASELINE`  | `sync-performance.manual.test.ts`         | Local open, five status/working-changes/history reads; `baseline.json`                                                                |
| `EIDOS_SYNC_POLICY_PERF`    | `sync-policy-performance.manual.test.ts`  | One warmup + five merge-policy reads, table discovery validation; `policy-results.json`                                               |
| `EIDOS_SYNC_CAUSE`          | `sync-root-cause.manual.test.ts`          | Compare upstream projection with identical history; temporarily edits copied config and restores it in `finally`; `status-cause.json` |
| `EIDOS_SYNC_PERF_STAGING`   | `sync-performance-staging.manual.test.ts` | Push, clone, conflicting row edits, plan, resolve, complete and upload; `staging-results.json`, `validation.json`                     |
| `EIDOS_SYNC_TRANSFER_TRACE` | `sync-transfer-trace.manual.test.ts`      | Five row edits/commits/pushes; `transfer-results.json`                                                                                |

Example, from the repository root:

```sh
EIDOS_SYNC_PERF_BASELINE=1 pnpm --filter @eidos.space/eidos-lite-desktop test src/main/graft/sync-performance.manual.test.ts
```

The root-cause suite additionally supports `EIDOS_SYNC_CAUSE_HTTP=1` for a
staging clone, `EIDOS_SYNC_CAUSE_LOCAL_PUSH=1` for a filesystem remote/clone,
and `EIDOS_SYNC_CAUSE_STALE=1` to replace the copied origin during that local
diagnosis. Neither local variant contacts the hosted remote.

## Staging authentication and experiment state

Create a dedicated, disposable repository on `https://sync-staging.eidos.space`.
Its final URL path segment must be a `perf-*` repository name. Production URLs,
embedded credentials and query parameters are rejected. Provide an existing
short-lived staging device token in a private JSON file outside the repository:

```json
{
  "token": "<staging device token>",
  "remote": "https://sync-staging.eidos.space/<account>/perf-example"
}
```

Set `EIDOS_SYNC_PERF_AUTH_FILE` to that file and restrict its filesystem permissions
to the owner (for example `chmod 600`). Use the actual repository URL returned by
staging, not the illustrative URL above. Never commit the credential file or raw
diagnostic logs. Results contain timings, counts and SDK telemetry; validation
output and diagnostic logs can contain fixture paths or values, so review them
before sharing. Timing records never include command arguments or bearer tokens.

For the full staging test, use an empty remote. `source` must have committed
Graft history, or set `EIDOS_SYNC_PERF_FRESH=1` to initialize/stage/commit it.
The initial `local` copy is preserved as `local-before-clone`, then replaced with
a fresh clone. Re-running from scratch requires a fresh prepared directory and
empty remote. `EIDOS_SYNC_PERF_RESUME=1` reuses an existing clone;
`EIDOS_SYNC_PERF_ADVANCE_SOURCE=1` pulls the source first;
`EIDOS_SYNC_PERF_HOST_ONLY=1` skips constructing divergence;
`EIDOS_SYNC_PERF_PLAN_ONLY=1` stops before applying the merge.
These advanced switches require an already prepared matching state; the test
asserts a three-way plan and real row conflict rather than silently timing an
unrelated operation. The transfer test requires an initialized copy whose branch
can push to the chosen remote; it fetches once before the five samples.

## Compare and clean up

Record the commit, Graft SDK version, staging deployment, fixture size/history,
network conditions and flags alongside results. Compare equivalent warm/cold
states with at least five samples and report the median. The full conflict test
is a scenario trace, not a statistically stable benchmark by itself; repeat it
with fresh fixtures/remotes for end-to-end comparisons. Do not add overlapping
phase durations to infer user-visible waiting time.

Results and copies are deliberately retained after success or failure. Remove
only the printed benchmark directory after review; revoke the staging device
token, delete its local credential file and delete the dedicated staging
repository through account management. Do not delete the source Space.
