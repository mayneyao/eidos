# iOS / TestFlight release

Read `apps/eidos-ios/README.md`, `project.yml`, `web/vite.config.ts` and
`scripts/build.sh` before preparation. The generated `.xcodeproj` is ignored;
`project.yml` owns project configuration. No iOS GitHub tag publisher is
configured. Commands below run from the repository root.

## Inputs, versions and notes

Identify the build actually available to the intended TestFlight group, its
marketing version, build number and source commit. Inspect App Store Connect
and release evidence; local project settings alone do not prove what testers
have. Record unknown provenance explicitly. Assess shared Markdown, UI,
Runtime and mobile-plugin-host changes against this build using
[release-impact.md](release-impact.md).

Set `MARKETING_VERSION` and increase `CURRENT_PROJECT_VERSION` in `project.yml`
for every upload. App and share extension inherit the same values; keep them
aligned. Replace `apps/eidos-ios/RELEASE_NOTES.md` with the candidate's delta
and testing instructions, including build number when the marketing version
is reused. Compare the previous three distributed iOS builds' notes (all
available if fewer). Do not describe a repeated launch feature as new.

The release-note scripts accept only `lite|cli`, so review iOS notes directly
against its own distributed builds. Do not invent an `ios-v*` tag, workflow or
`--surface ios` helper contract. Distinguish TestFlight distribution from an
App Store release; publishing to the store is a separate scope.

## App Store Connect declaration without attachments

For routine Eidos iOS releases, use the App Store Connect path that requires
no encryption attachment. CCATS and French encryption declarations are outside
this workflow. Record the exact build and intended distribution channel and
storefronts. The current rollout excludes the French App Store. Check the
intended scope before answering the France question.

For the existing Graft encrypted remote protocol, use the developer's
classification of the shipped public algorithms and protocol. Check the
candidate's app, share extension, locked Graft SDK, native library and bundled
dependencies against that assessment. Record XChaCha20-Poly1305 for repository
encryption, Argon2id for password-based key derivation and Rustls if bundled
for transport. Use the published Graft protocol at the locked SDK commit and
the [archived XChaCha IRTF draft](https://datatracker.ietf.org/doc/draft-irtf-cfrg-xchacha/).
Record reproducible evidence of any change to the encryption footprint.

For a matching candidate whose assessment supports the industry-standard
category, select only **Standard encryption algorithms implemented outside
the Apple operating system** or the equivalent wording in App Store Connect.
Bundling an implementation outside the OS is covered by that answer.
Select the Apple OS-only answer only for a build that limits all encryption
to Apple's system implementations. See
[Apple's materials table](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption/)
and the [EAR definition](https://www.bis.gov/regulations/ear/772), which also
considers publication by other means.

When the build is already uploaded, use that build's TestFlight compliance
questionnaire. If the form requests an attachment, first verify the category,
the France answer and whether a previous draft preselected an additional
algorithm category. Correct answers supported by the candidate's assessment.
Save when the reviewed answers permit the attachment-free path. If the
correct answers still require an attachment, leave the declaration pending
and report the build, selected answers and requested file. File submission
requires a separate release decision. A questionnaire correction alone can
use the existing build. Rebuild only when the binary or its metadata needs
to change.

Use `ITSAppUsesNonExemptEncryption=NO` in `project.yml` only when the reviewed
build qualifies for that declaration, including its third-party libraries.
Otherwise answer the questionnaire in App Store Connect and verify the exact
build's compliance state before TestFlight distribution. See
[Apple's plist guidance](https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption)
and
[TestFlight compliance instructions](https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-export-compliance-information-for-beta-builds).

## Validate and rebuild resources

For a Markdown fix, run its shared package tests, including the mobile preset
round trip. Then validate each iOS resource build:

```bash
pnpm --filter @eidos.space/markdown test
pnpm --filter @eidos.space/eidos-file build
pnpm --filter @eidos.space/ios-editor typecheck
pnpm --filter @eidos.space/ios-editor build:web
bash apps/eidos-ios/scripts/build.sh iphonesimulator
xcodebuild -project apps/eidos-ios/EidosIOS.xcodeproj -scheme EidosIOS \
  -destination 'platform=iOS Simulator,id=<available-simulator-uuid>' \
  -derivedDataPath apps/eidos-ios/build/DerivedData test
```

Choose an installed simulator rather than hard-coding a machine's UUID. The
README documents existing XCUITest accessibility limitations: report actual
failures and run the affected native/WebView checks on a device when necessary;
never claim the whole suite passed based on compilation or a selected test.
For Rust/Runtime changes also run the README's native test gates and refresh
QuickJS when required. Keep the isolated, verified mobile Graft patch pipeline.

## Archive and upload

Prepare the `aarch64-apple-ios` native library and freshly built WKWebView assets
using the existing `scripts/build.sh iphoneos` path with the configured Apple
team. That script ends in a Debug build; it is preparation, not a distribution
archive. Generate the project from `project.yml`, then archive `EidosIOS` with
Release configuration and `generic/platform=iOS`. Use the actual development
team and automatic signing for both app and share extension, including the
`group.space.eidos.ios` App Group. Verify the archive's version/build, bundled
editor and privacy manifests against the reviewed source commit.

Export with the `app-store-connect` method and upload via Xcode Organizer or
`xcodebuild -exportArchive` with an upload destination and the authorized signing
configuration. Keep credentials in the keychain or secure secrets. If signing,
App Store Connect access or a required toolchain is unavailable, finish the
independent preparation and report the specific remaining step; do not replace
the release archive with an ad-hoc or simulator build.

## Prove tester availability

Record the uploaded build's App Store Connect identity and source provenance.
Verify Apple processing completion, the exact build's export-compliance status
and declaration, TestFlight group assignment and tester availability. Record the
specific missing document or review status when compliance is still pending.
External testers may require Beta App Review. An archive or accepted upload is
not proof of available distribution.

Install the candidate from TestFlight on a physical device and verify startup,
offline editing, save/reopen and changed flows. For shared list fixes, check
empty/checked/nested tasks after saving, navigating away, and relaunching.
Verify upgrade data retention; cover the share extension if it changed.

Report source SHA, marketing version/build, archive/upload evidence,
processing/review status, tester channel/link where available and actual
device coverage. Keep built, uploaded, processing and available states separate.
An Android APK release does not satisfy the iOS delivery requirement.
