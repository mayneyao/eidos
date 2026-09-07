## What's new

### Find text across your Space

Press **Cmd/Ctrl+Shift+F** to search saved text without leaving the sidebar.
Results are grouped by file with highlighted matches, case sensitivity,
whole-word matching, and regular expressions. Open a result at its matching
location while keeping the result list stable. **Cmd/Ctrl+F** opens a compact
Find bar inside the current document.

### Recover one document from History

The Versions sidebar now lets you switch between all saved versions and the
current document's history. Sparse history pages load automatically within a
bounded scan, and selected versions open in the main diff area. Restore a text
version or save either side as a copy from one compact toolbar. Before restoring,
Lite keeps sibling copies of the current file and any unsaved draft.

Document history requires Local versioning and follows the current path; it
does not include history from before a rename. Text recovery supports readable
historical versions up to 1 MiB.

### Keep unsaved text safe when closing

Closing a document or quitting now checks outstanding text drafts and offers
save, discard, or cancel. Changes detected on disk keep the draft available for
recovery instead of silently overwriting the external edit.

### Navigate large folders without losing your place

Quick Open now excludes dependency trees and common build output so large
repositories remain searchable, and reports indexing failures instead of an
empty result. Expanding folders no longer scrolls back to the open document.
Click the titlebar filename to reveal it in Explorer, right-click it for file
actions, or hold Alt while hovering to see its relative path.

### Review record properties with less movement

Expanded record titles occupy a consistent single line, and property labels
align with their values. Hover over a read-only field to copy its complete value,
including multiline formulas and record metadata.

No file-format migration is required.
