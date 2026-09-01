## What's new

### Edit Markdown as a document

Markdown files and table Content fields can now use a rich-text editor while
Markdown remains the stored format. Headings, lists, checklists, links, code,
inline formatting, and tables round-trip through the editor; documents with
unsupported syntax stay in the source editor instead of being rewritten.

### Open records as focused content pages

A table can designate one Text field as its Content field. Those records open
in a centered page layout with compact properties, Markdown content, and
previous/next navigation, while ordinary tables continue to use the side
panel.

### Work with structured fields more consistently

Relation values can be filtered by their linked record and copied or pasted
within a Grid column. Field pickers now use one predictable type order, Integer
columns keep their header icon, and invalid reserved-field indexes are rejected
before they can make a file ambiguous.

### Keep attachment previews available across views

Gallery covers and Grid attachment cells now share host-issued preview leases.
Loaded thumbnails survive equivalent table refreshes, and a failed Gallery
preview no longer leaves the same attachment unusable after returning to Grid.

### Preserve editing history during local changes

Saving a Grid edit no longer makes the file watcher treat the same Runtime
write as an external replacement. Undo and redo history stays available for
local edits, while genuine changes from another process still refresh the open
Eidos File.

If you are updating directly from Eidos Lite 0.5.1 or earlier, review Formula
fields that use the former Eidos-only helpers. Use SQLite `IIF`, `IS NULL`,
`LOWER`, and `UPPER` in place of `IF`, `IS_NULL`, `LOWER_ASCII`, and
`UPPER_ASCII`; rewrite the former date helpers with SQLite date and time
functions.
