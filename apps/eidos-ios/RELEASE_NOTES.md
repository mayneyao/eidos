# Eidos iOS 0.1.0

Build 4 updates the shared Markdown editor and plugin installation flow for iPhone and iPad running iOS 17 or later.

## Improvements

- Plugins become available in the Space where installation was approved, without a separate enable step. Existing permissions in other Spaces are preserved.
- Device transfers display localized progress descriptions.

## Bug fixes

- Empty checked and unchecked Markdown tasks retain their state after saving and reopening, including nested lists and lists with blank lines.

## What to test

Create a Markdown checklist with an empty final task, save it, navigate away and reopen it, then repeat after relaunching. Install a compatible plugin and verify it is available in the current Space. Pair with Eidos Lite 0.22.0 or later and check local-network transfers, offline edits and reconnection.

Conflicting edits are reviewed on Desktop. Keep the app open during initial transfers. Mobile cloud account and hosted-sync entry points are not included. This is a TestFlight build, not an App Store release.
