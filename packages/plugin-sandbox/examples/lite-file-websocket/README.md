# WebSocket Workbench

A read-only file View for testing saved WebSocket payloads. Each `.wsreq` file
is a request fixture. All Views in the same window, Space and plugin share one socket.

From the repository root:

```sh
node packages/plugin-tools/bin/eidos-plugin.mjs check packages/plugin-sandbox/examples/lite-file-websocket --target lite
# Terminal 1 (Python standard library only):
python3 packages/plugin-sandbox/examples/lite-file-websocket/server.py
# Terminal 2:
EIDOS_LITE_DEV_BACKGROUND_ORIGIN=ws://127.0.0.1:8787 pnpm dev:eidos-lite
```

Load this directory through Lite's development plugin settings. Enable it for
your Space and copy `samples/*.wsreq` into that Space. Open both files with
**WebSocket Workbench**, click **Send sample**, and approve network access.

The example uses the included loopback-only Python echo server.
Opening a file sends nothing; Send reads the current
document and uploads its text plus an opaque numeric request ID, without the path.
For production, update the endpoint in `background.ts` and exact public WSS origin in
`plugin.json`. Packaged Lite ignores the development environment variable and denies
local WS. Development grants must match the literal `127.0.0.1` origin and port,
and cannot be mixed with other origins. The host still asks for permission.
The server must echo the JSON
envelope `{ id, text }` unchanged.

## Verify connection reuse

The View shows a connection card: **本次建立了新 WebSocket** for the first
message, then **复用了已有 WebSocket** with a continuing message number. The
connection ID and creation time stay unchanged across file Views. These are
last-response diagnostics, not a live connection health monitor.

1. Send both files: responses contain their own text and the same `connection` ID.
2. Close one file and send the other. While the server keeps the connection alive,
   the ID stays the same. Reopen the first file and send again.
3. Run **WebSocket Workbench: stop shared connection** in CmdK. The next Send
   requests host permission again and starts a fresh run with a new connection ID.
4. Server disconnection fails pending requests. A later Send reconnects explicitly;
   previous messages are never automatically replayed.

## Data flow

`file View → document.read() → background.request({command, text}) → shared socket → echo → postMessage({requestId, data}) → originating View`

The host supplies request IDs. Separate numeric wire IDs route out-of-order echoes.
Concurrent connection attempts share a promise. Closing a View never calls stop.
No broadcast subscription or extra lifecycle API is necessary. This routes replies;
it does not isolate Views belonging to the same plugin.

Connection and echo each time out after eight seconds. Payloads are limited to
16,000 characters and 32 pending wire requests. Backgrounds end on Lite exit,
Space changes, disable or source reload; their state is not durable.
