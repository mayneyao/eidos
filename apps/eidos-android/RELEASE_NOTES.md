# Eidos Android 0.3.1

This update fixes installation and startup of compatible Marketplace plugins.
Android 9 or newer is required.

## Bug fixes

- Plugins with bundled translations now install successfully instead of failing
  with “Invalid plugin package envelope.” Plugin labels and guest pages receive
  the app language and the package's validated translations.
- Isolate plugin dependency variables from the host's mount arguments, fixing
  blank or failed plugin views such as Markmap after installation.
- Keep package checksums, permission review and per-Space enablement checks in
  place for both older packages and localized packages.

## Install and verify

Download `eidos-android-0.3.1.apk` and verify it against `SHA256SUMS`. Install over
the previous stable APK to retain local data. Distribution uses signed GitHub
APKs for ARM64 and x86-64, not Google Play.

The plugin fix was tested in an Android emulator with seven published packages,
including live Marketplace downloads, installation and opening Markmap against
a Markdown note. Physical-device plugin verification is not included in this
test coverage. Themes, background services, plugin storage and other capabilities
not implemented by the mobile host remain unsupported.
