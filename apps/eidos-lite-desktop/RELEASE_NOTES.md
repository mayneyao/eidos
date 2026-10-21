Eidos Lite 0.26.0 adds a native File properties inspector, one file-metadata catalog shared across the Space, Spark device authorization for managed file metadata, and a list-like Grid layout option.

## What's new

### File properties

Inspect and edit a file's metadata without opening the file manager. The native **File properties** window shows the system file information and the custom properties configured for the Space. Changes save automatically, the current field keeps focus while saving, and a focused draft is committed before the window closes. Open it from a file's context menu.

Creating the Space file-metadata catalog and editing managed properties requires Spark activation on this computer. Existing files remain readable without an active license.

### File management across the Space

Explorer and folder **Manage files** now open the same Space-wide catalog at `.eidos/files.eidos` instead of a separate catalog for each folder. Folder entry points open the catalog scoped to that folder. The managed catalog participates in version history, checkpoints and restore, and the Fields control now supports ordering, hiding and showing properties.

### Ignore rules before versioning

The Versions setup panel shows a preflight summary of files, videos, large files and symlinks. **Build ignore rules** opens one builder for rule templates (videos, Node and build output, design files, archives, system files, temporary files), per-file exclusions for large files, and a raw `.graftignore`/`.gitignore` editor. The preflight excludes paths matched by the current rules; save once, then create the first version.

### Spark device authorization

Licensed accounts can activate this computer and release it later from **Settings → Account & Services**. Device authorization is bound to the machine, is verified locally from signed certificates, and keeps working offline until its authorization expires. When another account signs in, the original account's device certificate is preserved for its owner.

### List-like Grid

Grid views have a new **Show vertical lines** setting. Turn it off to hide column dividers, including in the header, for a cleaner list-like layout; horizontal row lines and row markers remain.

## Improvements

- **Help menu**: Feedback and Release notes are now available from one sidebar menu.
- **Version history**: The managed file catalog appears in checkpoints, file history and safe restore.
