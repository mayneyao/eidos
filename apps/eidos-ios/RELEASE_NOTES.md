# Eidos iOS 0.1.0

An early TestFlight build for iPhone and iPad running iOS 17 or later.

- Browse local Spaces and edit Markdown and Eidos File tables offline.
- Open records on dedicated pages, edit fields, and switch table views.
- Use compatible file-view and table-view plugins.
- Import files through the system share sheet.
- Pair with Eidos Lite on the local network to download and synchronize Spaces.

## What to test

Use a copy of a Space. Check local editing, reopening saved files, record fields,
file import, and synchronization with a compatible Desktop build.

Local-network synchronization requires the Desktop connection-handling fix;
updating iOS alone does not deliver that fix. Concurrent edits to the same file
may require choosing a version on Desktop. Keep the app open during initial
downloads. Production account sign-in and hosted sync have not completed
end-to-end acceptance testing for this release.

When reporting a problem, include the app build number, iOS version, and steps
to reproduce. Avoid attaching private Space contents to public issues.
