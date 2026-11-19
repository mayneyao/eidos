# Eidos iOS 0.4.0

Build 8 requires iOS 17 or later. Use a copy of your Space when testing.

## What's new

- Open tables with relative date filters from Eidos Lite 0.35.1. Saved views
  such as **Past 7 days** and **This week** follow the calendar in the
  configured time zone.
- Date and Datetime fields can start with the current date or time when you
  create a record. These values remain editable. New records also inherit
  field values when the active view's filters determine them. Update the apps
  that edit the same file before enabling the new date features.
- Connect to an encrypted repository on a compatible self-hosted Graft server
  from Sync → Custom server. Access the repository with your server access key
  and unlock it with the Space's sync password.

## What to test

Update from TestFlight build 7 and confirm your existing Spaces and files are
still available. Open a table with Date and Datetime fields, switch between
relative date views, then create a record. Check its defaults, change a date,
save, and reopen the file offline.

If you use self-hosted Sync, try a test repository over HTTPS. Confirm a
correct sync password opens the encrypted repository and a wrong password
leaves the local copy unchanged.

This TestFlight build is not intended for distribution in France.
