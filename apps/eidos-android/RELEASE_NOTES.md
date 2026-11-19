# Eidos Android 0.8.1

Moving a Markdown file to another folder now updates relative links to files
within its Space. Attachments stay in their original folders, and images load
when you open the moved document again. This also works for paths with spaces
and links that need to go up a folder.

Download `eidos-android-0.8.1.apk`, verify it against `SHA256SUMS`, and install
it over 0.8.0 to keep your local data. The APK supports ARM64 and x86-64 and
requires Android 9 or later.

Android 13 emulator tests covered moving and reopening a document with an
image, destination name conflicts, and recovery from a failed write.
