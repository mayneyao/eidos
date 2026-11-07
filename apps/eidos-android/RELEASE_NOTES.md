# Eidos Android 0.5.0

Connect encrypted Spaces to your own Graft server without an Eidos account.
Android 9 or newer is required.

## What's new

### Custom-server Sync

Open **Sync → Custom server** and enter the same HTTPS server address and access
key used on your computer. Browse the server's encrypted Spaces, then use the
Space's sync password to download one or connect your current local Space.
You can also enable sync for a new Space and publish it to an empty repository.
Use **Sync now** to send and receive versions.

The server access key and sync password are encrypted locally with Android
Keystore. Saved connections survive restarting the app. Disconnecting removes
this phone's connection and credentials while keeping local files, version
history and the server copy.

Encrypted custom-server connections require HTTPS, except for a loopback server
on the same device. The advanced connection for plain Graft repositories remains
separate.

## Bug fixes

- **Folder export**: Folder export no longer gets silently skipped after
  returning from Android’s folder picker. Pending exports keep their original
  Space, preventing files from another Space from being exported.

## Install and testing scope

Download `eidos-android-0.5.0.apk` and verify it against `SHA256SUMS`. Install over
the previous stable APK to retain local data. Signed GitHub APKs support ARM64
and x86-64; Google Play distribution is not configured.

Custom-server testing covered encrypted transfers over real HTTPS, saved
credentials, the native configuration screens and reopening a saved file after
a complete app restart in an Android emulator. Physical devices, natural
background scheduling, Doze behavior and a full TalkBack pass were outside this
round's scope. Keep the app open during initial downloads and manual transfers.
