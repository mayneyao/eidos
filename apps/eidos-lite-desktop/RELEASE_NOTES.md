## What's new

### Publish reliably from macOS

The macOS installer now includes the dedicated Eidos Publish engine used by
Eidos Lite. Publishing and collecting no longer fail with an unavailable-engine
message after installation, and packaged release checks now execute the bundled
engine before an installer can be published.

### Keep cloned Spaces unchanged

Validation after cloning is now read-only. Opening a Space cloned from another
device no longer rewrites valid Eidos Files or makes every file appear modified
before the user changes anything.

No migration is required.
