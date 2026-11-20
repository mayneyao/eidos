# Eidos Android 0.9.1

## Open files with newer formulas

Android opens Eidos Files that already contain an unavailable formula such
as `TODAY()` in **Read only** mode. You can switch tables and read the
original records. If a saved view depends on an unavailable formula, choose
**Browse records** to see the stored values.

Android disables editing for these files and blocks attachment imports
before any files are copied into the Space.

## Install and testing scope

Download `eidos-android-0.9.1.apk` and verify it against `SHA256SUMS`. Install
over 0.9.0 to retain local data. The APK supports ARM64 and x86-64 and requires
Android 9 or later.

The upgrade test covers offline browsing of a file containing `TODAY()`,
blocked attachment imports, and saving and reopening an ordinary Eidos File.
