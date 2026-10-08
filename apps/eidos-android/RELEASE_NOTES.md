# Eidos Android 0.1.0

The first stable APK channel for Eidos on Android. This release updates the shared editor and streamlines plugin installation and search. Android 9 or newer is required.

## Improvements

- Newly installed plugins become available in the Space where you approved installation, without a second enable step. Other Spaces retain their existing permissions.
- File search and plugin search use consistent native controls.
- Device transfers display localized progress descriptions.

## Bug fixes

- Empty checked and unchecked Markdown tasks remain tasks after saving and reopening. Nested lists and lists with blank lines preserve their checked states.

## Install

Download `eidos-android-0.1.0.apk` and verify it against `SHA256SUMS`. The APK supports ARM64 and x86-64. It uses the same application ID and signing identity as the beta, so install it over the beta to retain local data. The separate development app is not migrated.

## Compatibility and scope

Use Eidos Lite 0.22.0 or later for the current phone-pairing and local-network sharing flow. Each device keeps a local copy for offline editing. Review conflicting changes on Desktop, and keep the app open during initial transfers. Mobile cloud account and hosted-sync entry points are not included in this release. Google Play distribution is not available.
