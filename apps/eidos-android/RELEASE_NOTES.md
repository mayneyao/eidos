# Eidos Android 0.2.1

This update fixes the language of new Eidos files and improves connections to
paired computers and Markdown editing. Android 9 or newer is required.

## Improvements

- Paired computers are detected sooner after returning to the app or changing
  networks. Saved addresses and local-network discovery are checked in parallel,
  and the first verified connection is used.

## Bug fixes

- New Eidos files use the selected app language for their default table and
  field names. English creates Records, Title and Notes. Existing table and field
  names remain unchanged when switching languages. Fixes #327.
- Tapping below the last Markdown block places the caret at the end without
  marking an unchanged document as edited or saving an extra blank line. Typing,
  Enter and undo continue to use normal editing history.

## Install

Download `eidos-android-0.2.1.apk` and verify it against `SHA256SUMS`. The APK
supports ARM64 and x86-64. Install it over the previous stable APK to retain local
data; the signing identity and application ID are unchanged. The development
app remains separate.

## Compatibility and scope

Device sync requires the paired computer and phone to be on the same local
network with device sync enabled in Eidos Lite. Keep the app in the foreground
during transfers. Distribution uses the GitHub APK channel; Google Play
publication is not configured.
