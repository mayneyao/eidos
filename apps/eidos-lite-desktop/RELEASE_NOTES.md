## What's new

### Filter directly from column headers

Open a column's menu and choose **Filter by this field** to set its condition directly. For example, select `mp4` in the `extension` column to find videos. Other conditions in the View are preserved, and you can continue editing the complete filter from the toolbar.

### Remember Sync passwords on Windows

Windows now supports saving Sync passwords in system secure storage, so connected encrypted Spaces can unlock automatically after restarting Lite.

### Check for updates from Help

Choose **Check for updates** in the sidebar Help menu. Progress, results and errors appear in the same menu, with a retry available if the check fails.

## Bug fixes

- **File properties**: Basic file information is available without Spark activation or an existing file-metadata catalog. Property windows open on the same display as their Space window, including on Windows with multiple monitors.
- **Recent files**: Opening **Files** from **Recent files** now reopens the Space-wide file manager instead of incorrectly reporting that the file is unavailable.
- **Sync reconnection**: Device-history caches reconnect after a restart. Saved account-access errors are rechecked against the current account before they continue to block Sync.
- **Sync history errors**: Missing history data now offers a retry instead of incorrectly reporting that the entire cloud Space is unavailable. Local files and saved versions stay in place.
- **Local changes**: Files edited during a status check are no longer shown as unchanged after restarting Lite or disconnecting Sync.
- **Grid selection**: Filtering and sorting clear old row and cell selections while preserving keyboard focus, preventing an old selection from pointing to a different record.
