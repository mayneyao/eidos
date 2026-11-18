## What's new

### Relative dates across tables and Explorer

Use filters such as **Past 7 days** and **This week** in saved table views. The filters advance with the calendar and respect your configured time zone. Explorer also lets you filter by creation time, modification time, and file size.

Set a Date or Datetime field to default to the current date or time when you create a record. You can edit the result. New records also pick up field values when the active view's filters determine them.

Upgrade each client before using these features in a shared `.eidos` file. Older clients may reject the file, and standalone CLI 3.3.2 can insert records without applying the new defaults.

### Record properties and Gallery selection

Collapse properties to get to the record content, or add, edit, and reorder properties directly on the record. In Gallery, draw a box to select multiple cards. Record edits and deletions share undo and redo history across views.

### File actions in Explorer

Cut, copy, and paste files from Explorer. Click an empty area before pasting to put files at the Space root. On macOS, copied files can also be pasted into Finder and apps that accept system file copies. Drag the active file's title into the built-in terminal to insert its path.

### Relative links in notes and record content

Use standard relative Markdown links and images to reference files within the Space from a Markdown note or an expanded record's Content. When you move a note or its target within the Space using Lite, supported references update so they keep pointing to that file.

## Improvements

### Searchable Settings

Search for a setting by name or keyword and open its section from the results. Resize the settings sidebar to fit longer labels.

### Large file collections

Jumping to distant rows in a sorted Files grid does less background work. Moving several files together now scans for link updates once per batch.

### Field creation and visibility

Selecting a type fills in a field name when the name is blank. Field visibility changes stay in the current menu. Set the default for hiding system properties in Settings and override it for a table from the Fields menu.

## Bug fixes

### File name collisions

Cut and paste and Rename preserve both files when the destination already has the same name.

### Record layout and focus

Read-only properties align with editable properties, and saving a property keeps the open record and editor in place. After deleting Grid rows, Undo works without clicking back into the grid.
