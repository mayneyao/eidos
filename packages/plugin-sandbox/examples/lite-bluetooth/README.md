# BLE battery background in Eidos Lite

This example uses a BLE peripheral exposing Battery Service (0x180F) and Battery
Level (0x2A19). It does not stream audio to Bluetooth speakers.

Run `pnpm dev:eidos-lite` from the repository root. In the plugin manager,
install this directory's `plugin.json` as a development plugin and enable it
in the current Space. No device ID or permission file needs to be edited.

1. Open **Bluetooth Battery** and click **选择设备** (Choose device), or run
   **蓝牙电量：选择并连接设备** in Cmd+K.
2. Lite's device picker scans automatically when opened. Allow OS Bluetooth access if
   prompted. Put the device into advertising mode.
3. Select a device row and click **Connect** to authorize that device. Use **Scan again**
   to retry without closing the picker; cancel at any time to grant nothing.
4. The host starts a fresh background with access to that selected device's GATT
   services. The page/action sends a connect message; the worker calls
   `navigator.bluetooth.getDevices()`, `gatt.connect()`, then reads and
   optionally subscribes to Battery Level.
5. Close the page. The connection remains alive. Run **蓝牙电量：查看连接与电量** in Cmd+K to inspect it. Reopen the page and click **恢复后台状态**
   (Resume background status) to subscribe to the current run.
6. **蓝牙电量：断开并停止后台**, disabling/uninstalling/updating the
   plugin, closing/switching the Space or exiting Lite stops the background and
   revokes the device grant. Device loss emits `gattserverdisconnected`; this
   example does not silently reconnect.

## Connection feedback

Search for “蓝牙电量” in Cmd+K. The commands are **蓝牙电量：打开面板**
(Open panel), **蓝牙电量：选择并连接设备** (Choose and connect),
**蓝牙电量：查看连接与电量** (Connection and battery status), and
**蓝牙电量：断开并停止后台** (Disconnect and stop).
Opening the panel does not start the background, scan, or connect. Use its
resume-status button to inspect an existing background connection.

The picker grants access; selecting a device does not mean it is connected.
The page keeps the device name and progress visible through connection,
Battery Service discovery, and the first battery read. It shows success and
a percentage only after the read succeeds.

Failures retain the device and error details with retry and change-device
actions. Cancelling an in-flight connection stops the background and revokes
the device grant; late replies cannot overwrite the cancelled state.
Unexpected disconnection hides the stale battery value and offers a manual
retry. Cancelling device selection preserves an existing connection.
Opening the page does not automatically start a background.

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

The manifest uses `bluetooth: true` for user-selected device access. To restrict
it to Battery Service, use `bluetooth: { services: [{ uuid: "battery_service" }] }`.
Omitted operation fields allow all supported operations; specifying any of
`read`, `write`, or `notify` makes omitted operations denied. The example code
only reads and subscribes. The manifest cannot declare device IDs or select by a name supplied by plugin code. The
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
