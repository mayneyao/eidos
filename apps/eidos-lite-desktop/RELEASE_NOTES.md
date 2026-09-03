## What's new

### Paste images into Markdown files

Paste clipboard images while editing a `.md` or `.markdown` file in either
Source or Rich text mode. Eidos Lite stores verified image bytes in an `assets`
folder beside the document and inserts a portable relative reference. Existing
relative images render again after reopening the document, and the image files
participate in the Space's ordinary History and Sync.

### Choose how each Markdown file opens

The Markdown file editor preference now applies only to ordinary Markdown
files. **Open** uses that default, while **Open with** lets you choose Source or
Rich text for one opening. Table Content fields consistently use the Rich text
editor and no longer change when the file preference changes.

### Edit richer Markdown without losing its source

The Rich text editor now supports Eidos Flavored Markdown constructs including
frontmatter, footnotes, inline and display mathematics, reference links, safe
HTML, images, and highlighted text. Block insertion, reordering, selection,
local editors for complex syntax, and lightweight code highlighting make these
documents easier to work with while untouched manual wrapping and spacing stay
intact.

### Render and validate field values faithfully

Lookup lists keep their typed structure and row references resolve to record
labels. Integer aggregates retain exact integer values, Rating rejects
fractions, URL validation is consistent across writes, and pasted Select or
Multi-select values are not discarded merely because they are not yet in the
option catalog.

### Discard local changes with less waiting

Discarding changes no longer reclassifies the whole Space before returning or
reloads every cached Eidos File. Eidos Lite restores the selected paths,
publishes the exact pending snapshot, refreshes only affected files, and
finishes the remaining status work in the background.

### Release Eidos File handles reliably

Closing an Eidos File now waits for its isolated Runtime process to exit before
the close operation finishes. Windows can rename, move, or replace the file
immediately afterward without encountering a lingering SQLite file lock.

No migration is required.
