Eidos Lite 0.25.0 adds encrypted cloud Sync on Windows and lets you replace a cloud connection while keeping your local files and version history.

**Before downgrading:** After using encrypted Sync in this version, an older Lite release cannot resume that cloud connection on this computer. Reinstall 0.25.0 or later to resume Sync. Your local files and saved history are preserved.

## What's new

### Encrypted cloud Sync on Windows

Windows can now connect to an encrypted cloud Space and exchange changes with macOS and Linux. Sign in with Sync access, then open **Sync → Cloud Sync** and enter the Space's sync password. Windows uses the password for the current session and asks again after you restart; saving a default sync password is not available on Windows yet.

### Disconnect and reconnect in the same folder

Choose **Disconnect cloud sync** in the Sync panel to remove this computer's connection. The confirmation explains what is preserved: your local files, unsaved edits and Graft history stay in place, and the cloud copy is not deleted. This also works when the cloud repository has already been deleted or the service is unavailable.

Enable Sync again to create a new encrypted cloud repository from the same folder. You do not need to copy or rename your Space.

## Improvements

- **Encrypted Sync reliability**: Initial encrypted uploads keep the saved version selected when the connection began, including on retry. Stalled transfers now stop within a bounded timeout.

## Bug fixes

- **Windows plugin links**: The installed app registers plugin installation links when it starts, so a browser can open the matching installation page in Lite. Launch Lite once after installing or updating to register the link handler.
