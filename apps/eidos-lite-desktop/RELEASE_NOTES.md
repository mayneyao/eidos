Eidos Lite 0.24.0 is available on the stable channel. New end-to-end encrypted cloud connections remain disabled in production; installing this update does not enable them. Local files and local version history continue to work offline.

## What's new

### Keep a file open beside your table

Choose **Open in sidebar** from a file row's menu to read or edit the file alongside the table. Lite opens the preview with your configured file editor or File View.

### Reorder table row actions

Open a table's row menu, hold **Option** on macOS or **Alt** on Windows/Linux, and drag its actions into the order you prefer. Lite keeps this order across tables. **Restore default order** returns to the original arrangement.

## Improvements

- **Sync setup**: Review the upload's file count, size and exclusions in a simpler panel, with password settings and clear retry actions nearby. Supported hidden files, large files and filenames containing words such as “secret” no longer need an extra confirmation.
- **Account settings**: Sync access, storage and password controls now follow the compact layout used by the other settings pages.

## Bug fixes

- **Markdown editing**: Clicking below the final block moves the caret without marking the file as modified. Saving before you type leaves the original Markdown intact, without adding an empty line.
- **Update checks**: An older release is no longer offered as an update to the version you are running. The floating update action also lines up with the other footer controls.
