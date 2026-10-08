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
- **Plugin SDK/tools:** each npm version and the matching `plugin-packages-v*`
  tag; templates are shipped inside plugin-tools.
- **Registry plugins:** the current `eidos-space/registry` commit and every
  `plugins.registry.json` entry's version, source repository, tag, asset and
  checksum. These are separate baselines from the SDK and host releases.
- **Eidos Lite:** the latest published `lite-v*` Release, not merely the highest
  local tag.
- **Standalone CLI:** the latest published `cli-v*` Release and `apps/cli/LATEST`
  for stable delivery.
- **Android:** the latest published `android-v*` Release and its APK's
  `versionName`, `versionCode`, signing identity and source commit. A local tag
  or workflow artifact from a manual run is not the public baseline.
- **iOS:** the version/build actually available to the intended TestFlight
  group (or App Store channel if configured), with its source commit. Local
  `project.yml`, an archive, or an upload still processing is not a delivered
  baseline. If commit provenance is unavailable, record it as unknown.
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
└── build:quickjs -> packages/eidos-file/generated/quickjs/eidos-runtime.js
    ├── CLI binary -> standalone CLI, Lite Publish engine, Publish Container
    └── crates/eidos-mobile-host -> Android JNI and iOS static library

packages/markdown
├── Lite and editor.eidos.space source builds
├── packages/eidos-file-serve -> CLI and Publish generated UI
├── apps/eidos-android/web -> APK bundled WebView editor
└── apps/eidos-ios/web -> iOS app bundled WKWebView editor

packages/eidos-file-ui
├── public @eidos.space/eidos-file-ui package
├── Lite source build
├── editor.eidos.space source build
├── Android WebView and iOS WKWebView source builds
└── packages/eidos-file-serve build -> packages/eidos-file-serve/generated/ui
    ├── standalone CLI embedded Serve UI
    └── Publish static assets and Publish Container UI

packages/eidos-file-serve
├── editor.eidos.space client and shared host behavior
├── Android and iOS shared Runtime client / record editor imports
└── generated packages/eidos-file-serve/generated/ui -> CLI and Publish

packages/mobile-plugin-host -> Android and iOS embedded plugin hosts
packages/plugin-runtime -> consuming Lite, Serve/Web, Android and iOS hosts

crates/eidos-runtime-host -> CLI, Android, iOS
crates/eidos-publish -> CLI, Android, iOS
crates/eidos-mobile-host -> Android, iOS

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
- Lite packaging builds the CLI from the root Rust workspace and copies the resulting
  `eidos` binary as its Publish engine; it does not consume a CLI GitHub Release.
- Publish serves the committed CLI Serve UI as Worker assets and builds the
  CLI from the root Rust workspace into its Container image.
- Android and iOS each run their own Vite source build. Check their
  `web/vite.config.ts`, entry points and native resource configuration; they
  do not fetch the live Web editor or consume the generated Serve UI wholesale.
  Android packages `app/build/editor-assets/editor`; iOS packages `build/editor`.
  Both are generated app resources, not standalone deployments.

During assessment, mark generated freshness as **unproven** when relevant source
changed but the committed output cannot be shown to match. Refresh generated
files only after release preparation is authorized. Treat the resulting diff as
evidence that a consumer changes, not as a separate user-facing feature.

Shared Rust library changes in `crates/` affect their consumers. Root
`Cargo.toml` or `Cargo.lock` changes require checking CLI and mobile builds;
app versions and release tags remain independent.

## Classify candidates semantically

Paths establish ownership; observable behavior decides whether to ship.

| Changed boundary                                                                                                  | Candidate surfaces                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plugin SDK, manifest, runtime or host plugin contracts                                                            | SDK/tools; consuming Lite, CLI, Web, Android and iOS hosts; all registry plugins and templates require the [plugin API release gate](plugin-api-release.md)    |
| `packages/markdown/**`                                                                                            | Lite, Web, Android and iOS for consumed editor behavior; CLI and Publish when Serve UI is affected                                                             |
| `packages/eidos-file/**`                                                                                          | packages; Lite and Web; Android/iOS via imported code or bundled QuickJS Runtime; CLI, Lite Publish, and Publish when the QuickJS/CLI Runtime path is affected |
| `packages/eidos-file-ui/**`                                                                                       | packages; Lite, Web, Android and iOS; CLI and Publish when Serve UI is affected                                                                                |
| `packages/eidos-file-serve/**`                                                                                    | Web; Android/iOS for imported client and record UI changes; CLI and Publish after Serve UI regeneration                                                        |
| `packages/mobile-plugin-host/**`                                                                                  | Android and iOS                                                                                                                                                |
| `crates/eidos-mobile-host/**`                                                                                     | Android and iOS, respecting JNI-only / FFI-only paths                                                                                                          |
| `crates/eidos-runtime-host/**`, `crates/eidos-publish/**`, root Cargo inputs or mobile native preparation/patches | CLI and consuming hosts; Android/iOS native artifacts and their isolated patched builds                                                                        |
| `apps/eidos-android/**`                                                                                           | Android; iOS if a shared native patch/build input changes                                                                                                      |
| `apps/eidos-ios/**`                                                                                               | iOS                                                                                                                                                            |
| `apps/eidos-lite-desktop/**`                                                                                      | Lite; `apps/download` when updater routing changes                                                                                                             |
| `apps/eidos-file-web/**`                                                                                          | Web only unless it changes a shared contract elsewhere                                                                                                         |
| `apps/cli/**` or `skills/eidos/**`                                                                                | CLI; Publish when Container/Serve/publish behavior changes; Lite when its bundled Publish engine changes                                                       |
| `apps/eidos-publish/**`                                                                                           | Publish; Relay or eidos.space when a binding, route, auth, or entitlement contract changes                                                                     |
| `apps/eidos-file-relay/**`                                                                                        | Relay; Publish when public viewer forwarding or binding contracts change                                                                                       |
| `apps/download/**`                                                                                                | Download Worker; related Lite or CLI delivery verification                                                                                                     |

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
Android, iOS, CLI, Web, and Publish build from repository source or committed generated
artifacts and remain independently delivered. Conversely, a host may ship
shared source before the corresponding npm package version is published.

For a shared Markdown save/reopen fix, trace both mobile entry points to their
editor preset and compare each delivered build's source. Mark Android and iOS
**Required** when their shipped editor has the bug and the fix is intended for
those users, even if the diff touches only `packages/markdown`. If the baseline
is unproven, report the missing evidence; do not mark the platform unaffected.
Test-only or documentation-only changes do not force an app release. Assessing
release debt does not authorize uploading or distributing an app.

## Choose versions only after impact is known

For plugin API changes, include the registry/plugin adaptation matrix and
template validation in the release plan, even for compatible changes without
an API version bump. An affected published plugin or starter left unadapted is
an unresolved release dependency, not a follow-up after the host ships.

- For public packages, use patch for compatible fixes or artifact corrections,
  minor for compatible features/public API additions, and major for incompatible
  public contracts.
- For Lite and CLI, use patch for fixes, minor for user-visible compatible
  features, and major for incompatible workflows, formats, or required
  migrations. Use a prerelease when rollout risk warrants it.
- Android stable versions use `X.Y.Z`; prereleases use `X.Y.Z-<alpha|beta|rc>.N`.
  Monotonically increase `versionCode` across both channels. For iOS, choose the appropriate
  `MARKETING_VERSION` and a new `CURRENT_PROJECT_VERSION` for every upload.
  A shared fix need not give Android, iOS and Lite the same version number.
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

Keep separate Android and iOS rows, including version/build, distribution
channel and remaining device verification. A completed desktop release must
not hide a required mobile release that is still pending.
