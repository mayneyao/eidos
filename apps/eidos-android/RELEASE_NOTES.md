# Eidos Android 0.8.0

Open and edit tables that use the date features introduced in Eidos Lite
0.35.1. Android 9 or newer is required.

## Relative dates in saved views

Saved filters such as **Past 7 days** and **This week** move forward with the
calendar and use the configured time zone. You can open tables with these
filters and create records from the filtered view.

## Editable date defaults

A Date or Datetime field can start with the current date or time when you
create a record. You can edit the value afterward. New records also inherit
field values when the active view's filters determine them.

Update each client that edits a shared file before applying these features.
Older clients may reject files that require the new date rules.

## Install and testing scope

Download `eidos-android-0.8.0.apk` and verify it against `SHA256SUMS`. Install
over the previous stable APK to retain local data. The GitHub APK supports
ARM64 and x86-64.

The date workflow was exercised in an Android emulator, including legacy
records, relative views, creation defaults, and editing and reopening a
record. Release validation checks the signed APK and 16 KB alignment.
