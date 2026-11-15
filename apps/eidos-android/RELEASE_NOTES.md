# Eidos Android 0.7.0

This update improves Checkbox fields and image editing. Android 9 or newer is
required.

## Checkbox fields

New Checkbox fields start unchecked and store checked or unchecked values.
Clearing a new Checkbox returns it to unchecked. Existing nullable Checkbox
fields and their empty cells remain unchanged.

Converting a column to Checkbox shows how many empty cells will become
unchecked and asks for confirmation. A changed column requires a fresh review
before the conversion can proceed.

## Editor fixes

- Tapping an empty image block opens Android's image picker. Canceling leaves
  the document unchanged.
- Tapping an existing image opens its touch controls. Save, Cancel and Android
  Back return to editing; image changes persist after leaving and reopening
  the document.
- The Custom server heading and description in Sync now follow the selected
  English interface language.
- The Save record button stays above share-form fields and can be tapped when
  saving shared text or attachments to a table.
- Checking or unchecking a Checkbox in a share form now saves correctly.

## Install and testing scope

Download `eidos-android-0.7.0.apk` and verify it against `SHA256SUMS`. Install over
the previous stable APK to retain local data. Signed GitHub APKs support ARM64
and x86-64. Google Play distribution is not configured.

Acceptance uses Android emulators for native Runtime writes, Checkbox creation
and conversion, image-picker and touch-editor exits, offline save/reopen, and
an in-place upgrade from the public 0.6.0 APK. Physical-device testing and a full
TalkBack pass are outside this release's verification scope.
