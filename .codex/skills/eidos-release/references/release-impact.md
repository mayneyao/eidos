# Release impact assessment

Use this reference to decide which Eidos surfaces a change set needs to ship.
Assessment is read-only unless the user also asks to prepare or publish a
release. Do not bump versions, refresh committed generated assets, tag, or
deploy merely to answer what needs shipping.

## Establish one baseline per surface

Never compare every surface with the repository's latest tag. Record the exact
public baseline for each candidate:

- **Eidos File packages:** the npm versions and matching
  `eidos-file-packages-v*` tag.
- **Eidos Lite:** the latest published `lite-v*` Release, not merely the highest
  local tag.
- **Standalone CLI:** the latest published `cli-v*` Release and `apps/cli/LATEST`
  for stable delivery.
- **Eidos File Web:** the active 100% Cloudflare deployment for
  `editor.eidos.space` and the Git commit recorded in its deployment message.
- **Eidos Publish:** the active 100% production deployment and the Git commit in
  its deployment message. A deployment without a commit SHA has an unproven
  baseline; report that uncertainty instead of inventing an exact diff.

Supporting deployments have their own baselines. Inspect them only when the
change set crosses their boundary:

- `apps/download` owns Lite update and CLI installer routing.
- `apps/eidos-file-relay` owns Relay and the production `*.eidos.ink/*` ingress
  that forwards Publish viewer hosts.
- the sibling eidos.space account service owns Publish authentication,
  entitlement, private-viewer exchange, and reciprocal service bindings.

## Follow source into artifacts and consumers

Use this graph as a candidate generator, not as an automatic release command:

```text
packages/eidos-file
├── public @eidos.space/eidos-file package
├── Lite source build
├── editor.eidos.space source build
└── build:quickjs -> apps/cli/qjs-host/bundle/eidos-runtime.js
    └── CLI binary -> standalone CLI, Lite Publish engine, Publish Container

packages/eidos-file-ui
├── public @eidos.space/eidos-file-ui package
├── Lite source build
├── editor.eidos.space source build
└── packages/eidos-file-serve build -> apps/cli/qjs-host/ui
    ├── standalone CLI embedded Serve UI
    └── Publish static assets and Publish Container UI

packages/eidos-file-serve
├── editor.eidos.space client and shared host behavior
└── generated apps/cli/qjs-host/ui -> CLI and Publish

apps/cli
├── standalone CLI release
├── Lite platform-specific bundled Publish engine
└── Publish Container eidos + eidos-publish-supervisor

apps/eidos-publish -> Publish Worker, Workflow, storage, Gateway, and Container configuration
apps/eidos-file-relay -> Relay plus production Publish wildcard ingress
```

The generated boundaries matter:

- `packages/eidos-file build:quickjs` writes the committed CLI Runtime bundle.
- `packages/eidos-file-serve build` writes the committed CLI Serve UI.
- Lite packaging builds the current CLI workspace and copies the resulting
  `eidos` binary as its Publish engine; it does not consume a CLI GitHub Release.
- Publish serves the committed CLI Serve UI as Worker assets and builds the
  current CLI workspace into its Container image.

During assessment, mark generated freshness as **unproven** when relevant source
changed but the committed output cannot be shown to match. Refresh generated
files only after release preparation is authorized. Treat the resulting diff as
evidence that a consumer changes, not as a separate user-facing feature.

## Classify candidates semantically

Paths establish ownership; observable behavior decides whether to ship.

| Changed boundary                   | Candidate surfaces                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/eidos-file/**`           | packages; Lite and Web; CLI, Lite Publish, and Publish when the QuickJS/CLI Runtime path is affected     |
| `packages/eidos-file-ui/**`        | packages; Lite and Web; CLI and Publish when Serve UI is affected                                        |
| `packages/eidos-file-serve/**`     | Web; CLI and Publish after Serve UI regeneration                                                         |
| `apps/eidos-lite-desktop/**`       | Lite; `apps/download` when updater routing changes                                                       |
| `apps/eidos-file-web/**`           | Web only unless it changes a shared contract elsewhere                                                   |
| `apps/cli/**` or `skills/eidos/**` | CLI; Publish when Container/Serve/publish behavior changes; Lite when its bundled Publish engine changes |
| `apps/eidos-publish/**`            | Publish; Relay or eidos.space when a binding, route, auth, or entitlement contract changes               |
| `apps/eidos-file-relay/**`         | Relay; Publish when public viewer forwarding or binding contracts change                                 |
| `apps/download/**`                 | Download Worker; related Lite or CLI delivery verification                                               |

For every candidate, answer:

1. Is the change absent from that surface's public baseline?
2. Does it alter user-visible behavior, a public API/type, packaged bytes that
   matter operationally, or a delivery/service contract?
3. Does that surface actually consume the changed source or refreshed artifact?
4. Is the user asking to deliver it now, or only to report release debt?

Classify each surface as:

- **Required:** the public surface lacks an intended observable or contractual
  change.
- **Conditional:** the dependency crosses the surface, but generated freshness,
  adapter support, rollout intent, or contract relevance still needs proof.
- **Already shipped:** its public baseline contains the change.
- **Not needed:** only tests, internal refactoring, surface-external docs, or an
  unused path changed.

Do not infer that publishing the npm cohort updates first-party hosts. Lite,
CLI, Web, and Publish build from repository source or committed generated
artifacts and remain independently delivered. Conversely, a host may ship
shared source before the corresponding npm package version is published.

## Choose versions only after impact is known

- For public packages, use patch for compatible fixes or artifact corrections,
  minor for compatible features/public API additions, and major for incompatible
  public contracts.
- For Lite and CLI, use patch for fixes, minor for user-visible compatible
  features, and major for incompatible workflows, formats, or required
  migrations. Use a prerelease when rollout risk warrants it.
- Web and Publish use deployment/version IDs rather than synchronized SemVer.

Never synchronize version numbers across surfaces for convenience.

## Report the plan before execution

Return an evidence table with at least:

| Surface | Public baseline | Evidence since baseline | Decision | Next action |
| ------- | --------------- | ----------------------- | -------- | ----------- |

Call out generated artifacts, supporting deployments, unknown provenance, and
cross-repository dependencies explicitly. If multiple surfaces are required,
plan them together but execute and prove them one at a time with their own
runbooks.
