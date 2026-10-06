# Mobile LAN v1 acceptance checklist

Mobile LAN v1 provides an offline local Space on iOS and Android, with optional
foreground synchronization to an approved Eidos Lite desktop. Both hosts use the
canonical Eidos File Runtime and shared editors. A downloaded Space remains
usable without its computer or an account.

## Supported capabilities

| Capability        | iOS and Android contract                                                                                                                                                                                                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local Spaces      | Create and switch Spaces; restore selection; keep files, favorites, recent entries, drafts and plugin preferences scoped to the Space.                                                                                                                                                                                       |
| Files             | Browse and sort folders; create, rename, import, export, search, favorite and recover files from the private recycle bin. Folder transfers reject symlinks and live SQLite WAL files.                                                                                                                                        |
| Markdown          | Shared touch editor, automatic atomic saves, recovery drafts and relative attachment imports. Leaving the editor flushes writes and returns to the same folder.                                                                                                                                                              |
| Eidos File        | Canonical Runtime CRUD, schema and View configuration, built-in Views, records, attachments and private new-record drafts. Hosts do not define their own File semantics.                                                                                                                                                     |
| Plugins           | Native discovery and installation, verified package import, update and removal. Packages are device-wide; enablement and preferences are per Space. Compatible document/table/page Views, actions, settings and connections use the shared mobile host.                                                                      |
| Plugin boundaries | Host file operations remain permission-gated. Credentials and installed packages stay outside synchronized content. Mobile plugin themes are disabled.                                                                                                                                                                       |
| Navigation        | Persistent Files and Sync tabs, followed by enabled plugin pages. With more than two plugin pages, one remains direct and the rest appear in More. Editors hide the tabs until returning. Tab changes retain folder, pairing input and plugin state.                                                                         |
| Local versions    | A secondary entry in Sync provides checkpoints and the latest 50 versions. It requires no network and does not add a Versions tab.                                                                                                                                                                                           |
| Pairing           | Scan or paste a desktop invitation, pin its TLS certificate, and approve the phone on the desktop. iOS offers pairing-code fallback when the camera is unavailable or permission is denied. Address discovery cannot replace the pinned identity.                                                                            |
| First download    | Choose an offered desktop Space. Download into a separate directory and register it only after transfer and full Eidos File validation. Interrupted copies remain outside navigation and reuse the same destination on retry. Existing local Spaces are preserved.                                                           |
| Sync              | One foreground action, stage and transferred-byte feedback, stop/retry, availability, last confirmed success and disconnect. Returning to Files does not block navigation while a request is pending.                                                                                                                        |
| Conflicts         | Each phone publishes to its private incoming history. Desktop merges compatible changes and publishes reviewed history. True conflicts preserve the phone's files and lead to the complete desktop Sync merge workspace. After desktop resolution, the phone retries; edits made while waiting remain part of the next sync. |
| Disconnect        | Disconnect a Space or remove a paired computer without deleting local files or history.                                                                                                                                                                                                                                      |

Account login, cloud Sync and Publish have no mobile entry points in this
version. Background LAN scheduling, phone-to-phone sync and Internet relay are
outside this delivery. True LAN conflicts never open a mobile whole-file choice
screen. Failure, cancellation and pending review never update the success time.

## Verification

Verification recorded on 2026-10-05 uses the current checkout, Android API 36
with 16 KiB pages, and an iPhone 17 simulator. Desktop integration tests use real
Graft repositories and pinned TLS with disposable content. The opt-in fixture
runs canonical Runtime validation directly when Electron's utility process is
unavailable in the test runner.

| Gate                                        | Evidence and result                                                                                                                                                                                                                                                                                    |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Desktop protocol and UI routing             | 53 tests passed across peer service, object store, Sync panel and inspector. Includes per-device incoming stores, multiple offered Spaces, revocation, full merge status while signed out, and phone continuation after desktop review. Desktop TypeScript check and development package build passed. |
| Android standard build                      | Debug app and test APK, 30 JVM unit tests and Android lint passed. Both arm64 and x86_64 native libraries are built by the standard script.                                                                                                                                                            |
| iOS standard build                          | The standard simulator build, application and share extension passed.                                                                                                                                                                                                                                  |
| Real Android desktop round trip             | PeerSyncDeviceTest passed: isolated download, Markdown and binary assets, canonical database reopen, divergent edits, desktop conflict resolution and another phone edit made during review.                                                                                                           |
| Real iOS desktop round trip                 | ParityTests.testPeerRoundtripOverPinnedTLS passed with the same download, attachment, database and conflict-continuation contract. The phone remains outside native merge state.                                                                                                                       |
| iOS local, plugin and navigation regression | 14 native tests and 3 UI tests passed. Checks include hidden account/cloud actions, Space selection across relaunch, folder/editor return and unfinished pairing input across tabs.                                                                                                                    |
| iOS request cancellation and disconnect     | Both PeerLifecycleTests passed. A stalled request is cancelled and releases the storage queue; forgetting a computer retains the Space and file bytes.                                                                                                                                                 |
| Development application launch              | Eidos Lite was launched using pnpm dev:eidos-lite; its checkout and http://localhost:5179/ URL were verified. Android emulator and iOS simulator were booted with standard debug builds.                                                                                                               |

Android's selected on-device regression suite passed all 27 tests, covering
Sync, navigation, initial-download catalog isolation, request cancellation,
plugins, disabled themes, sorting, editor interaction, search and relative
attachment imports. Both mobile WebView entry points passed TypeScript checks.
The Android keyboard checks used a visible floating IME; docked-keyboard and
physical-device checks remain in the outstanding walkthroughs below.

Three additional iOS parity tests passed for folder-transfer isolation, global
search and untrusted-address rejection. Across the selected runs, 19 distinct
iOS native tests and 3 UI tests passed. After restricting phone access to
read-only reviewed history, desktop tests and both native peer round trips
passed again; phones can publish only to their own incoming history.

Native integration and selected UI tests establish these paths; they do not
establish complete touch or accessibility coverage. Android Compose tests also
write review screenshots into the test app's cache. iOS WebView accessibility
queries remain unreliable in this simulator, so the entire UI suite is not a
passing gate.

### Pairing and recovery follow-up

The follow-up on 2026-10-05 adds iOS QR scanning, matching manual-pairing labels,
camera fallback, additional-computer pairing and explicit availability refresh.
The camera and generated-QR tests use the same Core Image detector; recognized
codes must pass the normal invitation validation before pairing.

- iOS passed 9 native tests and 3 UI tests together: real desktop transfer and
  conflict continuation, service restart with a changed port, saved-credential
  recovery, real Bonjour discovery after a rejected candidate, request/discovery
  cancellation, QR recognition and rejection, camera fallback, retained input,
  selected Space after relaunch, and large-text landscape scanner navigation.
- Android passed 12 Sync/discovery/lifecycle/UI regression tests, including
  interrupted address probes and discovery, real Android NSD, large-text
  landscape pairing controls and returning to Files during a stalled request.
  A separate real-desktop round trip passed conflict continuation and retry
  after a service restart at its saved port, native Runtime reopen and fallback
  from an obsolete address to the computer's latest saved endpoint.
- Both standard native builds, Android's 30 unit tests and lint, and desktop
  TypeScript checks passed. Physical camera scanning is still unverified.

The Android changed-port desktop discovery walkthrough **failed**: the emulator
resolved a service published inside its virtual network, but did not discover
the host's restarted Bonjour service. Direct pinned TLS transfer to the desktop
worked. Keep this failed run as an outstanding gate; a passing self-published
NSD test does not establish desktop discovery. The emulator's virtual Wi-Fi and
host network are distinct; [Android's networking guide](https://developer.android.com/studio/run/emulator-networking-interconnect)
describes NSD between emulators, which does not establish host multicast
reachability. Repeat changed-address discovery with a physical Android device.

## Reproduce the core checks

```bash
pnpm build:eidos-android
cd apps/eidos-android
./gradlew :app:assembleDebugAndroidTest :app:testDebugUnitTest :app:lintDebug
cd ../..
bash apps/eidos-ios/scripts/build.sh iphonesimulator

cd apps/eidos-lite-desktop
node ../../scripts/run-electron-node.mjs ../../node_modules/vitest/vitest.mjs \
  run --config vitest.config.ts src/main/peer/peer-service.test.ts \
  src/main/peer/object-store.test.ts src/renderer/sync-panel.test.ts \
  src/renderer/sync-inspector.test.tsx
```

The opt-in peer fixture is
`apps/eidos-lite-desktop/src/main/peer/peer-service.android.manual.test.ts`.
Set `EIDOS_PEER_ANDROID_FIXTURE` to a private temporary JSON path and
`EIDOS_PEER_CONFLICT_FIXTURE=1`, then run it through the same Electron Node test
runner. Wait for the invitation file before copying it to the test device.
Android's `PeerSyncDeviceTest` reads `cache/peer-fixture.json` in the debug app.
Use `adb push` to stage the JSON under `/data/local/tmp`, then `adb shell run-as
space.eidos.android.dev cp` to copy it to that cache path. iOS's native LAN parity
test reads `/tmp/eidos-ios-peer-fixture.json`. Fixture credentials and all
transferred content are disposable; do not point this test at a personal Space.

Set `EIDOS_PEER_RECOVERY_FIXTURE=1` to extend the round trip with a three-second
service interruption and a changed port. Use `same-port` to test retry after an
ordinary service restart. The mobile test reopens its native Runtime, retains
the paired identity and token, and verifies edits made while disconnected.
Changed-port discovery remains required on a physical Android device.

Both platforms build Rust 1.99.0 against the same pinned Graft revision and
committed runtime patch. `scripts/prepare-mobile-native.mjs` prepares isolated,
ignored workspaces, checks dependency versions and checksums, and does not edit
Cargo's shared Git cache. Standard builds require the official upstream Git
source on the first run.

## Outstanding acceptance gates

- Complete changed-address desktop discovery on physical Android and both
  platforms' actual Wi-Fi switching/loss walkthroughs. Service restarts,
  interruption, request/discovery cancellation and native Runtime reopen are
  covered above; they do not establish every physical network transition.
- Verify actual camera QR pairing and denied-permission recovery on signed
  devices. Generated QR recognition and simulator camera fallback passed.
- Complete the remaining View/editor/plugin touch, rotation, large text,
  keyboard and VoiceOver/TalkBack walkthroughs. Verify actual system Photos and
  Files selection and incoming shares on signed devices.
- Install and run signed iOS and physical Android builds. No physical Android
  device was available in this run. The connected iPhone SE has Developer Mode,
  but both iOS development profiles have an empty App Groups entitlement.
  Assign `group.space.eidos.ios` to both `space.eidos.ios` and
  `space.eidos.ios.share` in the signing team, regenerate their profiles, then
  repeat installation. Keep the shared-container entitlement: the share inbox
  depends on it. The failed signing attempt installed no app on the phone.

This checklist records a simulator-verified implementation. It is not App Store
release approval, a distribution check or a claim that all device gates passed.
