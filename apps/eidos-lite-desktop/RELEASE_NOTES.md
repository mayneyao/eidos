## What's new

### More consistent file and record menus

Record menus now share the same actions across table views, with group destinations collected under a Move to submenu. When an attachment and a file action refer to the same file, the menu shows one Open with default application action.

### Steadier file thumbnails

Opening a file in its default application no longer clears the table's thumbnails during file refresh. Visible images stay in place while Lite checks for changes, and updated images replace them after loading.

### Plugins that keep working in the background

Plugins can now keep a background instance running after you close their page or finish a command. Views and commands share that instance, so a connection or an ongoing task can continue without keeping a panel open.

Plugins can request permission to start automatically when you open a Space and to receive file-open events. This enables tools such as an enhanced recent-file history that records visits while you work. Enable and authorize each plugin in the Space where you want it to run.

### Bluetooth devices and shared connections

Plugins can connect to BLE GATT devices through Lite's device picker and retain the connection in the background. Choose a device, then follow the connection status in the plugin. Bluetooth access requires your approval; this supports device services such as battery readings, not Bluetooth audio playback.

### Network access for plugins

Plugin views, commands and backgrounds can use a consistent fetch API, including streamed responses and cancellation. Backgrounds can also maintain WebSocket connections shared by multiple views. Network access requires your approval and remains subject to host restrictions. Existing credential connections and network APIs remain available.
