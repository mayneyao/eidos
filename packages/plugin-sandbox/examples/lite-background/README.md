# Background Counter in Eidos Lite

Requires a Lite build with plugin API 3.4.0. Run `pnpm dev:eidos-lite`
from the repository root; this also builds the sandbox executable.
In the plugin manager, install this directory's `plugin.json` as a development
plugin and enable it in the current Space.

1. Open **Background Counter** from navigation and approve the native startup
   dialog. Click Increment.
2. Close the page. Run **Increment background counter** in Cmd+K.
3. Reopen the page: the counter is preserved. A page subscription also receives
   messages caused by Cmd+K while the page remains open.
4. Run **Stop background counter**. The next request asks to start again and
   creates a fresh counter. Disable or uninstall the plugin to revoke execution.

The host owns one background per window, Space and plugin. State is in memory,
not durable across stop, update, Space close or app restart. Permission approval
applies to a single run; updates and subsequent starts require confirmation.
All messages are JSON. `request(data)` sends `{requestId, data}`; the Worker
replies with the same requestId and its result in data. Replies time out after
30 seconds. `postMessage(data)` and `onMessage(listener)` carry raw messages.

For networking declare exact HTTPS/WSS origins in
`background.networkOrigins`, then use `fetch` or `WebSocket` in the Worker.
The host's startup dialog lists these origins. Browser networking grants are
separate. Private addresses, filesystem access and Eidos capabilities are not
granted. Bluetooth requires separate host device selection; see
[the BLE example](../lite-bluetooth/README.md).

Subscriptions end with their page or action scope, and belong to a particular
background run; subscribe again after explicitly stopping and restarting it.
