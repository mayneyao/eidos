# Eidos Android 0.3.0

This update fixes initial LAN pairing when a computer advertises an unreachable
VPN or virtual-network address. Android 9 or newer is required.

## Bug fixes

- Pairing tries alternative local-network addresses and verifies the computer's
  certificate before sending pairing credentials. Older codes can recover through
  local-network discovery. Connection failures give actionable guidance.
- Deleting a favorite also removes its entry from the favorites list.

## Improvements

- The shared Eidos File editor adds column-header filtering, clearer filter
  editing and consistent record context menus. File previews retain loaded
  images while checking for changes.

## Install

Download `eidos-android-0.3.0.apk` and verify it against `SHA256SUMS`. Install over
the previous stable APK to retain local data. The APK supports ARM64 and x86-64;
the development app remains separate. Distribution uses GitHub APKs, not Google Play.

## LAN pairing

Update Eidos Lite to 0.29.1 and generate a fresh code in Device connection.
Keep both devices on the same local network and allow Eidos Lite through the
computer's firewall. Keep the phone in the foreground during transfers.
The address recovery fix was tested on an Android emulator and a Pixel 6a;
physical-camera scanning and a Windows computer were not part of those tests.
