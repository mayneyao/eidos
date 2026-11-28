# Eidos Android 0.11.1

## Faster repeat sync on the local network

Android reuses a recently verified desktop connection when you sync again. If the desktop address stops responding, Android looks it up again. A clean Space that matches the desktop can finish its sync check without fetching the same history again.

During an active transfer, the progress view shows the current transfer speed alongside the byte counts.

## Install

Download `eidos-android-0.11.1.apk` and check it against `SHA256SUMS`. Install it over 0.11.0 to keep your local Spaces.
