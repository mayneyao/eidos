# Eidos iOS 0.5.0

Build 9 requires iOS 17 or later. Use a copy of your Space when testing.

## What's new

- Use `TODAY()` in a Formula field to calculate with today's local date.
- Use Eidos in Brazilian Portuguese, Japanese, or Korean.
- Open images in Markdown notes that use `../` to reach an attachment in
  the same Space.

## What to test

Update from the available TestFlight build and check that your local Spaces
remain available. Add a Formula field with `TODAY()`. Save, close and reopen
the file offline, and verify the date. Use a test repository to sync the file
between updated clients and finish a merge after changes on both devices.

Update the apps that edit or sync the same Space before adding the formula.
An older editor may open the file read-only or be unable to finish a sync merge.

This TestFlight build is not intended for distribution in France.
