## What's new

### Follow records with a file preview

When a file is open in the sidebar, clicking a record in a table view updates that preview while keeping your place in the main view. The selected record stays in view across Grid, Gallery, Kanban, Calendar and Feed layouts.

### Attach files to Markdown notes

Type `/` and choose **Attach file** to copy a file into the note's `assets/` folder and insert a relative link. Drag files from the Space Explorer into a note to reference them at the drop position; images appear inline. This works in Rich text and Source, in the main editor and file sidebar.

Type `[[` to find existing Space files and choose a link or an image where supported. Candidate paths remain readable for Chinese and other non-ASCII filenames.

### Two-state checkboxes for new fields

New Checkbox fields use checked or unchecked values, with unchecked as the default. Clearing cells or pasting blank values leaves them unchecked. Converting a field to Checkbox previews how many empty values will become unchecked and asks for confirmation before changing them.

Existing nullable Checkbox fields and their empty values remain unchanged. No automatic data conversion runs when you open a file.

## Improvements

- **Saving notes**: Save status appears beside each file title. Cmd/Ctrl+S saves the last text document you used after focus moves to Explorer; when two notes are open, click the intended note or its Save button to select the target.
- **Moving files**: Dragging several files into a folder keeps the Explorer tree consistent while the move completes, including when part of a batch fails.

## Bug fixes

- **Conflict resolution**: Table and field changes are reviewed before row conflicts. Undoing a choice refreshes the review so subsequent choices use the current merge state.
- **Image blocks**: The image placeholder opens the image chooser and remains usable after cancellation or an import error. Imported images remain available to file references.
- **Editor focus**: Updates in one pane no longer take focus from the Markdown editor in the other pane, and switching editing modes places focus in the destination editor.
