## Improvements

- **File cell shortcuts**: Right-click a cell containing one file and choose **Open file** to open it directly, including read-only file entries.

## Bug fixes

- **CSV import**: Import a CSV as a new table in `files.eidos` without an extension error. Newly imported tables no longer show an incorrect “This table is no longer available in the file” message.
- **File metadata fields**: New custom fields use their field names as attribute keys, making values consistent with external tools. Metadata field renaming is now disabled; existing fields retain their stored values and mappings. Unsupported relations to or from virtual tables are excluded from field creation.
- **File cell actions**: Large local files, including videos, can be opened without the thumbnail size limit blocking the action. Read-only physical file entries no longer show a delete action.
- **Default file editors**: Plugins that declare file views now appear in **Settings → Files** alongside other compatible editors.
- **Update downloads**: Startup and manual update checks wait for you to choose **Download update**. The startup preference controls checking only, including for existing installations.
- **Creation location**: The Explorer **+** menu creates files and folders and imports files at the Space root, regardless of selection. The New File keyboard shortcut also uses the root; use a folder’s context menu to create inside it.
