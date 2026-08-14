## What's new

### Cloud checkpoints stay visible in History

Version History now marks the last locally known Cloud checkpoint even when
Local and Cloud histories have diverged. Like a Git remote-tracking ref, this
uses the checkpoint recorded by the latest fetch or push and does not require
another network request.

### Conflict-free merges finish automatically

When Graft completes a reviewed three-way merge without any unresolved paths,
Lite now finalizes it immediately instead of opening an empty conflict workspace
showing zero conflicts. Interrupted conflict-free merges receive the same
recovery behavior, so Sync can continue to the next fetch or push.

### Upload progress uses the whole push

Uploads containing several Graft objects now establish the complete known
payload before sending the first object. The transferred value advances against
one stable total instead of repeatedly showing matching values such as `10/10`
and `20/20` while more requests are still waiting.

No migration is required.
