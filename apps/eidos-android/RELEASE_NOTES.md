# Eidos Android 0.10.0

## Use today's date in a formula

Add a Formula field with `TODAY()` to show the current calendar date and
use it in calculations such as `DATE(TODAY(), '+1 day')` for tomorrow.
The value follows the editor's time zone and refreshes when you return to
the app after the date changes.

Update the apps that edit or sync the same Space before adding the formula.
An older editor may open the file read-only or be unable to finish a sync merge.
If you sync a Space with iOS, wait for an iOS update that supports `TODAY()`
before adding it to files in that Space.

## Install

Download `eidos-android-0.10.0.apk` and verify it against
`SHA256SUMS`. Install it over 0.9.1 to retain local data.
The APK supports ARM64 and x86-64 and requires Android 9 or later.
