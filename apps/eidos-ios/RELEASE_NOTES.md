# Eidos iOS 0.3.0

Build 7 adds automatic downloads of committed desktop updates for paired local
Spaces. Requires iOS 17
or later. This build is intended for the existing TestFlight testing groups.

## What's new

- Paired Spaces check for committed desktop updates after launch or resume and
  while idle. With Eidos Lite 0.31.0 or later on the same local network, clean
  local history can advance automatically without opening an editor or taking
  focus. Save a desktop checkpoint to make pending desktop edits available.
- iOS background opportunities can perform the same download. iOS controls
  scheduling; updates are not immediate or guaranteed while suspended, offline,
  force-quit, or restricted by system permissions.
- Automatic downloads preserve local edits, recovery drafts and independent
  commits. Opening an editor cancels the automatic operation. Automatic downloads
  do not upload phone changes, create checkpoints, merge, or resolve conflicts;
  use manual Sync for those workflows.

## What to test

Update from the previous TestFlight build and confirm existing Spaces, notes,
attachments, favorites and local history remain available. Edit and reopen a
note while offline. Pair with Eidos Lite 0.31.0 or later, save a desktop
checkpoint, then return to the iOS app and check that a clean paired Space
receives it. Repeat with an unsaved recovery draft, an open editor, local file
changes and an independent local checkpoint; those changes must remain intact.

This iteration uses simulator validation. Actual system background wakeups,
locked-device file/Keychain protection and physical TestFlight installation are
outside that coverage. Simulator execution of the foreground catch-up and native
background task body does not establish natural BGProcessing scheduling.

This is a TestFlight build, not an App Store release. Apple processing and
external testing review are reported separately from archive and upload status.
This TestFlight build is not intended for distribution in France.
