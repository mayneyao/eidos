# Eidos Android 0.1.0-beta.1

The first Android beta for early testers. Android 9 or newer is required.

- Browse local Spaces and edit Markdown and Eidos File tables offline.
- Open records as full pages, edit fields with mobile controls, and switch between table and gallery views.
- Install compatible plugins, including table views and file viewers.
- Pair with Eidos Lite over a local network to download and synchronize Spaces.

## Install

Download `eidos-android-0.1.0-beta.1.apk` below and allow installation from your browser or file manager. The APK supports ARM64 phones and x86-64 devices. `SHA256SUMS` contains its checksum.

This beta uses the application ID `space.eidos.android`. It installs alongside the development app (`space.eidos.android.dev`); development app data is not automatically copied. Future releases signed with the same key can update this beta in place.

## Testing scope and limitations

Start with a copy of a Space. This is an early beta, not a stable release.

- Local-network sync needs a compatible Eidos Lite build. Older desktop builds can fail while receiving an upload; the desktop connection-handling fix is separate from this Android release. Updating Android alone does not fix that desktop issue.
- Concurrent edits to the same Eidos file can require choosing a version on Desktop before synchronization can finish.
- Background synchronization can be interrupted by Android battery management. Keep the app open during initial downloads.
- Production account sign-in and hosted synchronization have not yet completed end-to-end release acceptance testing.

When reporting a problem, include the app version, Android version, reproduction steps, and whether it occurred offline or during synchronization. Do not attach private Space contents to a public issue.
