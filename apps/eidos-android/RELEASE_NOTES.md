# Eidos Android 0.6.0

Move files and folders between existing directories in your Space using a native
touch interface. Android 9 or newer is required. Refs #401.

## Move files and folders

Open an item's **…** menu, or long-press its row, and choose **Move to…**.
Browse folders, then tap **Move here**. Choose **Space root** to move back to
the root directory. The action is also available from an open document's menu;
pending edits are saved before choosing a destination.

- Move ordinary files, Markdown, `.eidos` files and complete nested folders.
- Favorites, recent files and open document paths follow the moved item.
- Existing names and unfinished recovery drafts block the move. Cancel keeps
  the item in place. Files are never overwritten.
- Moving works offline without signing in. The next local checkpoint and Sync
  include the resulting paths.

Relative links and attachment paths inside documents stay unchanged. Moving an
individual file can break those references. Moving a whole folder with its
attachments preserves relationships within that folder; references crossing its
boundary may still need adjustment. The destination picker shows this guidance.

## Install and testing scope

Download `eidos-android-0.6.0.apk` and verify it against `SHA256SUMS`. Install over
the previous stable APK to retain local data. Signed GitHub APKs support ARM64
and x86-64. Distribution uses GitHub APKs; Google Play is not configured.

Device checks cover Android 13 emulator file moves, cancellation, name conflicts,
draft and permission errors, nested attachments, local history and editor
save/reopen behavior. The release APK also receives a 16 KB page-size emulator
smoke and an in-place upgrade check from the public 0.5.0 APK before acceptance.
Physical-device testing and a full TalkBack pass are outside this release's
verification scope.
