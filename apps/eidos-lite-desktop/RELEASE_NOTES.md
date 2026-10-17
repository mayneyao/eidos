Eidos Lite 0.24.2 brings end-to-end encrypted cloud Sync to macOS and Linux. Connect your Space across computers with a Sync password. Local files and local version history remain available offline.

## What's new

### End-to-end encrypted cloud Sync

Sign in with an account that has Sync access, open **Sync → Cloud Sync**, set a **Sync password**, and choose **Enable Sync**. Lite encrypts file contents, paths, saved version messages and branch names on your device before upload. Use the same password when opening the cloud Space on another supported computer.

Your Sync password is separate from your account password. Keep it in your password manager: Eidos cannot recover it or decrypt your cloud copy for you. Encryption protects the cloud copy; local files remain readable. Windows and mobile clients cannot open these encrypted cloud Spaces.

### Keep a file open beside your table

Choose **Open in sidebar** from a file row's menu to read or edit the file alongside the table. Lite opens the preview with your configured file editor or File View.

### Reorder table row actions

Open a table's row menu, hold **Option** on macOS or **Alt** on Windows/Linux, and drag its actions into the order you prefer. Lite keeps this order across tables. **Restore default order** returns to the original arrangement.

## Improvements

- **Startup**: Lite opens its Welcome screen with less work in the background. Plugin details and embedded table editors load when you open them.
- **Sync setup**: Review the upload's file count, size and exclusions in a simpler panel, with password settings and clear retry actions nearby. Supported hidden files, large files and filenames containing words such as “secret” no longer need an extra confirmation.
- **Account settings**: Sync access, storage and password controls now follow the compact layout used by the other settings pages.

## Bug fixes

- **File browsing**: Expanded folders reload their contents after a background refresh invalidates the directory cache, so files remain accessible without closing and reopening the folder.
- **Markdown editing**: Clicking below the final block moves the caret without marking the file as modified. Saving before you type leaves the original Markdown intact, without adding an empty line.
- **Update checks**: An older release is no longer offered as an update to the version you are running. The floating update action also lines up with the other footer controls.
