## What's new

### Keep open files stable during version operations

Restoring History and creating automatic checkpoints now coordinate open-file
reads with Runtime restarts. Busy workspaces can keep several Eidos Files open
without intermittent closed-Runtime errors while version operations finish.

No migration is required.
