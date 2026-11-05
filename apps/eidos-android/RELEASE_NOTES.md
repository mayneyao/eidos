# Eidos Android 0.4.0

This update adds automatic checks for committed LAN updates and restores native
scroll indicators in the embedded editors. Android 9 or newer is required.

## What's new

### Automatic committed updates from paired computers

Downloaded Spaces check for committed updates from their paired computer after
launch, on returning to the app, and while the foreground is idle. Android also
schedules background checks. The computer must be online on the same local
network and run a compatible Eidos Lite version with automatic-update support.

Only clean, fast-forward updates are applied. Unsaved drafts, open editors or
plugin pages, local changes, conflicts and independent phone commits defer the
update. Automatic checks never create a checkpoint, merge histories or upload
phone changes. Use manual Sync to send changes from the phone.

## Improvements

- Embedded Markdown, table and plugin views use Android WebView scroll indicators,
  with colors that follow light and dark mode and no reserved desktop scrollbar
  gutter. Touch scrolling remains available in nested editor panels.

## Bug fixes

- Closing table row search restores grid keyboard focus, so keyboard navigation
  can continue after leaving search. Search-result jumps retain their destination.

## Install and testing scope

Download `eidos-android-0.4.0.apk` and verify it against `SHA256SUMS`. Install over
the previous stable APK to retain local data. Signed GitHub APKs support ARM64
and x86-64; Google Play distribution is not configured.

This release was checked with Android emulators, including an in-place upgrade
from the public 0.3.1 APK, offline editing and the affected editor and LAN flows.
Controlled background-worker and locked-screen tests do not prove natural
15-minute scheduling, Doze behavior or manufacturer battery policies. Android
may delay or stop background work; updates are not guaranteed to arrive
immediately. Keep the app open during initial downloads and manual transfers.
Physical devices and a full TalkBack pass were outside this round's scope.
