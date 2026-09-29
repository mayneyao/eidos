# Plugin API, registry and template release

Use this gate for changes to public SDK types or names, manifest declarations,
capability paths, lifecycle, permissions, RPC semantics, or host plugin behavior.
It applies to additions and fixes as well as breaking changes, whether or not
`requires.pluginApi` changes. Assessment is read-only; preparation adapts source
and builds candidates; publication follows the user's authorized release scope.
Updating this skill alone does not authorize releases or registry publication.

## Inventory the consumers

Read the current [registry](https://github.com/eidos-space/registry), its
`README.md`, `CONTRIBUTING.md`, schema and validation workflow. Verify the remote
and revision of any local checkout rather than assuming a directory name is
authoritative. Use `plugins.registry.json`, not the retired extension catalog.

The registry stores metadata, not plugin source. Enumerate every entry and
follow its `repo`, `tag` and `asset` to the actual published package and source.
Do not substitute repository HEAD for the published baseline. Inventory every
starter in `packages/plugin-tools/templates/catalog.json`, including shared
`project.json`, copied source files, README and tests. Do not maintain a fixed
list of plugin IDs or template names in this skill.

Record a matrix in the release evidence:

| Plugin or template | Published baseline/source | APIs used and target hosts | Adaptation or unaffected reason | Candidate version/commit | Package and host verification | Publication/registry status |
| ------------------ | ------------------------- | -------------------------- | ------------------------------- | ------------------------ | ----------------------------- | --------------------------- |

Every registry entry and template needs a disposition. For compatible changes,
unchanged consumers still require verification; do not bump or rewrite them
without a reason. Theme plugins may be unaffected by executable API changes;
verify their separate contract rather than forcing the executable API version.
If source access or ownership prevents adaptation, report that entry as blocked
and keep the affected release gate open. Do not silently omit third-party plugins.

## Adapt source and generated projects

- Update affected plugins in their source repositories: imports, SDK/tool
  dependencies and lockfiles, manifest requirements, API calls, tests and usage
  docs. Follow `docs/migrations/eidos-plugins.md` and its Chinese counterpart.
  Preserve plugin/contribution IDs, stored settings, config namespaces and data.
  Do not merely raise `requires.pluginApi` or edit the registry compatibility text.
- Update every affected starter and shared template file. Generate fresh projects
  from the candidate tool package; checking only the `.txt` templates misses
  dependency resolution, packaging and generated-project failures.
- Keep implementation, normative specs, translations, public API docs and
  `skills/eidos` aligned. Migration guides live in `docs/migrations`, outside
  the documentation site. A registry plugin's release version is independent
  of SDK, plugin API, Lite and CLI version numbers.

## Validate the artifacts

Build required dependencies before compiler/template tests. Run builds that
clean `packages/eidos-file/dist` sequentially with those tests.

Run SDK/runtime tests and `pnpm --filter @eidos.space/plugin-tools test`; use
`EIDOS_PLUGIN_CLI` pointing to the candidate CLI for its integration checks.
The tools suite enumerates the starter catalog, compiles and packs generated
projects, and exercises table-action behavior. Also check each generated project
against its promised `lite` and/or `cli` targets using the candidate tools.

For each affected registry plugin, run its own tests, check and pack with the
candidate SDK/tools, then install the exact archive on the candidate host.
Exercise the changed APIs and the plugin's primary flow: mount/dispose, editing
and saving, queries/config, action writes/cancellation or credentialed requests
as applicable. Verify upgrades retain existing plugin state. Run CLI doctor and
Serve smoke for plugins claiming CLI support; do not assume Lite proves Serve.
Check clear rejection on unsupported hosts for breaking changes.

Repeat the create/check/pack/install path from published candidate npm packages
and downloadable host artifacts before promoting the stable release. Record
actual archive identity, checksum, host version and outcome, not just source
test results. A failing or untested affected plugin/template blocks completion.

## Coordinate delivery

Prepare adapted plugin archives and registry changes alongside SDK/tools and
host candidates, before the stable host cutover. Use
`.github/workflows/publish-plugin-packages.yml` in `plan` mode to inspect the
shared SDK/tools version; publish from the exact immutable
`plugin-packages-v<version>` tag through its `publish` mode. SDK publishes before
tools. Inspect npm dist-tag handling before any prerelease; never let a candidate
accidentally become `latest`.

Verify the actual public npm tarballs against the reviewed artifacts before
installing consumer dependencies. Version metadata and dist-tags can become
visible before the tarball download is available; retry propagation failures
without republishing the same version. Metadata visibility alone is not proof
that the authoring tools are installable.

Publish affected plugins as new immutable Releases in their own repositories.
Never overwrite an existing `.eidos-plugin` asset or move its distributed tag.
Download the uploaded archive and verify its SHA-256 and manifest identity.
Update the corresponding registry entry's `version`, `tag`, `asset`, `sha256`
and `compatibility` together. The plugin-tools `registry` command can draft the
entry; validate it using the registry repository's schema/workflow. A metadata
change without a migrated, verified archive does not count as adaptation.

Make compatible hosts and required SDK/tools available before switching the
public catalog to packages requiring them. The registry has one selected version
per entry, not separate prerelease channels: do not point it at unpublished host
requirements. Plan the host release and registry merge as one coordinated rollout,
with all plugin adaptations validated beforehand. Do not declare the plugin API
release complete until the required plugin Releases and registry changes are public.

Verify the public catalog revision and download/install through the marketplace,
accounting for cached catalog responses. Catalog updates normally require no
community website deployment. Report source commits, package/release URLs,
registry commit, template results and any unresolved consumer for the release.
