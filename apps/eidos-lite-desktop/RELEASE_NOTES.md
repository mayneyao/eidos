## What's new

### Resolve Local and Hosted changes safely

Eidos Lite can now review diverged Sync histories instead of asking you to
overwrite one side. The Sync panel shows the files that need attention and
opens a dedicated merge workspace for comparing Base, Local, and Hosted
versions.

Text files can be reviewed side by side, edited as a result, and resolved with
either version. Eidos files expose their tables as child changes, with
table-, row-, and field-level choices for data conflicts. Compatible table
structure changes are merged automatically; incompatible changes stay visible
and preserve whole-file Local and Hosted recovery choices.

Merge progress is durable. You can close and reopen a Space, continue resolving
remaining items, retry stale analysis safely, or abort and return to the
unchanged Local history. Eidos validates every affected `.eidos` file before a
merge commit is completed.

### Preview Markdown and HTML files

Markdown and HTML files can now be previewed directly in Eidos Lite while still
keeping their source available for editing and history review.

No migration is required. Existing Spaces remain ordinary folders and all
Local and Hosted versions are retained until you explicitly complete or abort
a reviewed merge.
