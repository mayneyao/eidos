## What's new

### Sync recovers after local cleanup and reviewed merges

After you discard local edits to unblock Sync, the panel now clears the obsolete
warning and lets the current Hosted state be fetched. Reviewed merges also verify
their SQLite snapshots before creating the merge checkpoint and recover missing
snapshot data from the Hosted Space when possible. If neither copy has the data,
Sync stops retrying and offers the safe Hosted-clone recovery path instead.

### Record labels can be reassigned in Table settings

Each table now has a dedicated settings dialog for choosing the field used to
identify records in relations and cards. If the previous label field was deleted,
you can assign another eligible field from the table tab menu without editing every
field's configuration.

### Editor shortcuts are configurable and repeatable

The existing table, view, and cell-actions shortcuts now appear in Settings, where
they can be customized or cleared. Closing a keyboard-opened cell menu returns
focus to the Grid, so the same shortcut can be used repeatedly without clicking the
table again.

### Markdown previews can be copied

Rendered Markdown content can now be selected and copied with the normal platform
commands while links and other preview interactions continue to work.

No migration is required.
