# Android release

Read `apps/eidos-android/README.md`, `app/build.gradle.kts`, and
`.github/workflows/build-and-release-android.yml` before preparation; they own
the current build and delivery contract. Commands below run from the repo root.

## Inputs and release notes

- Establish the previous published Android Release, source SHA, APK version/code
  and signing certificate. Compare shared dependencies as well as Android files
  using [release-impact.md](release-impact.md).
- Increment `versionCode` beyond distributed builds and set `versionName` in
  `apps/eidos-android/app/build.gradle.kts`. Use `X.Y.Z` for stable or
  `X.Y.Z-<alpha|beta|rc>.N` for prereleases, with a matching
  `android-v<versionName>` tag. Stable tags must publish with GitHub's
  prerelease flag false; prerelease tags must set it true.
- Replace `apps/eidos-android/RELEASE_NOTES.md` with this Android delta. Its first
  line must be `# Eidos Android <versionName>`; the workflow requires more than
  200 trimmed characters. Describe actual fixes, installation, testing scope
  and relevant limitations, not repeated launch features or desktop-only work.
  Compare the previous three Android Release bodies (all available if fewer).
- The release-note preparation/audit scripts currently accept only `lite|cli`.
  Review Android notes directly; do not pass an unsupported `--surface android`
  or use a Lite baseline. The workflow publishes the committed notes via
  `gh release create --notes-file`.

## Validate and rebuild the bundled editor

Run focused tests for changed shared packages first. For Markdown behavior,
include a save/reopen regression through the mobile `eidosPreset`, then:

```bash
pnpm --filter @eidos.space/markdown test
pnpm --filter @eidos.space/eidos-file build
pnpm --filter @eidos.space/android-editor typecheck
pnpm --filter @eidos.space/android-editor build:web
apps/eidos-android/gradlew -p apps/eidos-android --no-daemon \
  :app:testDebugUnitTest :app:lintRelease :app:assembleRelease
```

The shared File build supplies declarations used by the editor typecheck.
Gradle's pre-build tasks rebuild the WebView editor, native JNI libraries and
bundled plugins. Source/native Runtime changes may also require refreshing
`build:quickjs`; follow the generated-artifact rules in the root `AGENTS.md`.
Use the existing isolated mobile native preparation and verified Graft patch,
not a different dependency checkout. A successful `build:web` verifies only
editor assets; it is not an APK build or a release.

Without configured signing, a local release APK may be unsigned. Publishing
uses the existing signing identity from workflow secrets; never replace the
key to make CI pass. Required secrets are `ANDROID_KEYSTORE_BASE64`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`.
Do not print or commit their values. Manual workflow dispatch builds and
validates an artifact without publishing a GitHub Release.

## Publish and prove delivery

After authorized preparation, commit and push the reviewed release inputs,
then create and push the immutable lightweight `android-v<versionName>` tag
at that exact remote commit. Monitor `build-and-release-android.yml` for the
tag SHA. It runs unit tests, release lint, editor typechecking, APK signature
verification and 16 KB ZIP alignment, then publishes a GitHub Release with
`eidos-android-<versionName>.apk` and `SHA256SUMS`. Google Play publication is
not configured; do not claim Play availability.

Verify `/android` selects the new stable APK and `/android?channel=beta`
selects the newest eligible APK. A prerelease must never enter the stable route.
Android Releases use `--latest=false` to preserve the monorepo's existing
GitHub Latest selection; download routing uses the Android tag namespace.

Download the published APK and checksum file, verify the checksum, certificate,
package ID `space.eidos.android`, versionName and versionCode. Byte-compare the
Release body with the notes at the tag. Install that APK on a test device and
check startup, offline editing, save/reopen and the affected flow. Where a
previous release is available, verify an in-place upgrade keeps local data and
uses the same signing identity. The debug ID `space.eidos.android.dev` is a
separate app; a debug install cannot prove a release upgrade.

For list serialization fixes, create checked and unchecked tasks including an
empty final item, save, leave and reopen the file, then relaunch and reopen it
again. Confirm text, nesting and checked states. Check the saved Markdown too.

Report tag/SHA, version/code, workflow URL, Release/APK URL, checksum and actual
device coverage. If device verification cannot run, state that gate remains
unverified; do not substitute compiled instrumentation tests for an executed
test. Keep any required iOS release visible as a separate delivery item.
