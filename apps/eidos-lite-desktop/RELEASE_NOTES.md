## What's new

### Undo deleted table records

Deleting one or more records from a table now participates in the normal Undo
and Redo history. Undo restores the deleted records and affected Relation links,
while switching to a different table query or schema safely clears history that
no longer applies.

### Cleaner Space sidebar

The persistent Settings action now blends into the Space sidebar without an
extra divider.

No migration is required.
