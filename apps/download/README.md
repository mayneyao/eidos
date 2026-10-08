# Eidos downloads

The Worker serves CLI installers and redirects platform downloads to GitHub
Release assets. Each product retains its own release namespace.

| Entry point                                          | Download                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------- |
| `/mac?arch=arm64` or `arch=x64`                      | Latest stable Eidos Lite DMG                                  |
| `/win?arch=x64`                                      | Latest stable Eidos Lite installer                            |
| `/linux?arch=x64&format=deb` or `format=appimage`    | Latest stable Eidos Lite package; `arch=arm64` also supported |
| `/android?channel=beta`                              | Latest Android APK, including prereleases                     |
| `/android` or `/android?channel=stable`              | Latest stable Android APK; returns 404 until one is published |
| `/cli/install.sh`, `/cli/install.ps1`, `/cli/latest` | CLI installers and stable version marker                      |

Android downloads select the highest semantic version with a matching
`eidos-android-<version>.apk` asset from non-draft `android-v<version>` releases.
The Beta channel accepts alpha, beta, RC, and stable versions; the stable channel
accepts only stable releases. Tag suffixes must agree with GitHub's prerelease
flag. An incomplete release without its matching APK is skipped.

The Android route scans up to 10 pages of 100 releases so intervening Lite and
CLI releases do not hide Android downloads. It returns 503 rather than select
from an incomplete list if that bound is reached. Redirects are cached for
60 seconds; lookup failures are not cached. The published APK bundles its
supported architectures, so the route does not accept an `arch` parameter.

Run `pnpm --filter download test` and `pnpm --filter download typecheck` from
the repository root. Deploy the Worker before deploying website links to a
new download route.
