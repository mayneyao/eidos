# BLE battery background in Eidos Lite

This example uses a BLE peripheral exposing Battery Service (0x180F) and Battery
Level (0x2A19). It does not stream audio to Bluetooth speakers.

Run `pnpm dev:eidos-lite` from the repository root. In the plugin manager,
install this directory's `plugin.json` as a development plugin and enable it
in the current Space. No device ID or permission file needs to be edited.

1. Open **Bluetooth Battery** and click **Choose and connect**, or run
   **Bluetooth: choose and connect battery** in Cmd+K.
2. Confirm scanning in the native host dialog. Allow OS Bluetooth access if
   prompted. Put the device into advertising mode.
3. Select the device by its name and exact ID. Confirm the device, service
   operations and background lifetime in the final native dialog.
4. The host starts a fresh background with only that device's Battery Service
   read/notify grant. The page/action sends a connect message; the worker calls
   `navigator.bluetooth.getDevices()`, `gatt.connect()`, then reads and
   optionally subscribes to Battery Level.
5. Close the page. The connection remains alive. Run **Bluetooth: battery
   status** in Cmd+K to inspect it. Reopen the page and click **Status / resume
   notifications** to subscribe to the current run.
6. **Bluetooth: disconnect and stop**, disabling/uninstalling/updating the
   plugin, closing/switching the Space or exiting Lite stops the background and
   revokes the device grant. Device loss emits `gattserverdisconnected`; this
   example does not silently reconnect.

Cancellation before final confirmation leaves an existing background and
connection intact. Confirming a new device restarts the background, resets its
in-memory state and replaces its grants. Other open pages must resubscribe.
If starting or connecting the new device fails, the error is shown; the old
connection is not automatically restored. Grants are per window/Space/plugin
run, not persisted. `start()` alone never grants Bluetooth.

Host API:

```ts
const device = await ctx.capabilities.background!.requestDevice()
const result = await ctx.capabilities.background!.request({
  command: "connect",
  id: device.id,
})
```

The manifest declares required services and read/write/notify operations. It
cannot declare device IDs or select by a name supplied by plugin code. The
background receives no scanner or picker; its Web Bluetooth-style GATT API
sees only the host grant. An advertisement/name is not a cryptographic device
identity. Some devices do not advertise all services; choosing one does not
guarantee that Battery Service is available.

Native scanning uses the bundled sandbox executable and a 5-second scan.
The host bounds scan output, time and concurrent selection requests. Selection
has a five-minute deadline. Native dialogs may remain visible after a request
is cancelled, but their eventual response cannot grant permission.

macOS requires system Bluetooth permission (the packaged app includes the
usage descriptions); development launches may attribute this to Electron or
the terminal. Linux requires BlueZ, D-Bus and an active Bluetooth adapter.
Windows requires a supported BLE adapter. Automated acceptance uses the real
QuickJS process with an explicit mock BLE backend; real-device connection and
signed-package OS permission prompts require separate hardware acceptance.
