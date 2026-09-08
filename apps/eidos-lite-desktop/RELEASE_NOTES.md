## What's new

### Save selected files as a version

Select files in Changes to save related work together while leaving other edits for a later version. Choose a folder tree or a flat file list, with expandable tables inside Eidos Files, and keep reviewing differences without losing your selection.

### A clearer Sync workflow

Sync now shows how many versions are waiting to upload or receive, with separate actions to check, upload, and receive changes. Compatible changes merge automatically; conflicts stay in one workspace where you can review choices before completing the merge. Account management and logs are available from the account menu, with storage usage behind your account identity.

### Remember your interface size

Interface scaling is saved across windows so your preferred reading size follows you when opening another Space.

## Improvements

- **Sync performance**: Reduce repeated repository scans and object validation when checking upstream history and preparing merges. Table discovery runs in a private Runtime worker without evicting open editors.
- **Compact sidebars**: Sync controls remain accessible at narrow widths, and expanded tables align clearly beneath their files in the flat Changes list.
- **Markdown selection**: Avoid repeated scans when updating text selections.

## Bug fixes

- **Ignored folders**: Show ignored folders with muted styling and load their contents when expanded, while keeping them excluded from Sync.

No file-format migration is required.
