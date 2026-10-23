# @eidos.space/plugin-sandbox

Node/Electron host SDK for persistent plugin backgrounds running in a separate Rust + QuickJS process. Guest code uses Worker-style messages, timers, fetch, WebSocket, and host-granted BLE GATT APIs. It has no Node module loader, filesystem API, or Electron access.

The package is private to the monorepo and independent of Eidos services. A trusted Node host selects the bundled entry module, grants permissions, and owns the instance lifecycle. Eidos Lite integrates it through the plugin API 3.4 `background` declaration; see the complete [Lite page and Cmd+K example](examples/lite-background/README.md). Installed backgrounds start on demand after native host approval.

For host-controlled device selection, see the [complete Lite BLE example](examples/lite-bluetooth/README.md).
For file Views sharing one connection, see [WebSocket Workbench](examples/lite-file-websocket/README.md), including a local Python echo server.
The Node SDK exports `scanBluetoothDevices(absoluteBinaryPath, signal?)` for
trusted host code. It runs a bounded native discovery process and returns
device IDs, display names, and advertised service UUIDs. Discovery does not
grant or connect devices: the host must show its own picker and obtain approval
before constructing `permissions.bluetooth`. Lite supplies that flow through
`ctx.capabilities.background.requestDevice()`.

## Build

From the monorepo root (Node >=22.12 and Rust installed):

```sh
pnpm install --frozen-lockfile
pnpm --filter @eidos.space/plugin-sandbox build
pnpm --filter @eidos.space/plugin-sandbox build:native
pnpm --filter @eidos.space/plugin-sandbox example
```

`build:native` builds `eidos-plugin-sandbox-cli` using the root Cargo workspace/lockfile and copies the current platform's executable into `bin/<platform>-<arch>/plugin-sandbox` (`.exe` on Windows). The SDK uses that exact path by default. Binary artifacts are ignored by Git. No install script downloads or compiles executables automatically.

A host that packages the binary elsewhere supplies an absolute `binaryPath`, for example Electron's unpacked application resources. Do not put the executable inside ASAR. Only the current macOS arm64 binary has been built and tested; other operating systems need their native prerequisites and acceptance testing. Linux BLE builds require the BlueZ/D-Bus development libraries.

## Start and manage backgrounds

Inside a workspace consumer, declare `"@eidos.space/plugin-sandbox": "workspace:*"` and import from the package:

```ts
import { BackgroundManager } from "@eidos.space/plugin-sandbox"

const backgrounds = new BackgroundManager()
const background = await backgrounds.start("space-123:com.example.counter", {
  entry: "/absolute/path/to/bundled-background.mjs",
  permissions: {
    network: { origins: ["wss://events.example.com"] },
  },
  limits: { memoryMb: 64, turnBudgetMs: 100, maxDurationMs: 0 },
  onMessage: (message) => console.log("plugin", message),
  onLog: (line) => console.log(line),
  onError: (error) => console.error(error),
  onExit: (exit) => console.log(exit.reason, exit.code),
})

await background.postMessage({ method: "increment", requestId: 1, amount: 2 })
// A Page View or cmdk handler can retrieve the same process:
await backgrounds.get("space-123:com.example.counter")?.postMessage({
  method: "status",
  requestId: 2,
})

// Plugin disabled/uninstalled or its grants changed:
await backgrounds.stop("space-123:com.example.counter")
// Space or application shutdown:
await backgrounds.dispose()
```

Guest module (bundle dependencies first; SDK imports are host-only):

```js
let count = 0
onmessage = ({ data }) => {
  if (data.method === "increment") count += data.amount ?? 1
  postMessage({ requestId: data.requestId, count })
}
```

The complete runnable pair is [node-background.mjs](examples/node-background.mjs) and [background-plugin.mjs](examples/background-plugin.mjs). It starts a background, correlates command replies, observes a heartbeat without a view, reads the retained state, and stops/disposes the process in `finally`.

For a single process, use `await startBackground(options)`; it has the same options plus an optional `AbortSignal`. Aborting before/during startup rejects the start; aborting after startup stops the process. The manager owns cancellation for its instances.

## Lifecycle contract

- `start()` resolves after the module and top-level await initialize successfully. Configure `onMessage` before starting to receive messages emitted during initialization. The module must finish initialization before the host sends commands.
- `background.state`: `starting`, `running`, `stopping`, `exited`. `pid` is the native child PID; `ready` is the initialization Promise; `exited` always resolves with `{code, signal, reason, error?}`.
- `postMessage()` writes a JSON message with bounded buffering. Resolution confirms writing to the child's stdin, not guest execution or side-effect completion. Use application request IDs/replies when acknowledgment is needed, as in the example.
- Register additional listeners using `onMessage(listener)` / `onLog(listener)`; each returns an unsubscribe function. Callbacks should be synchronous; handle async work/rejections explicitly. Callback exceptions are reported to the optional `onError` callback without breaking cleanup.
- One manager key means one process. Concurrent/duplicate starts reject rather than silently replace its code or permissions. Include a space/session identifier in the key if grants differ by space.
- `stop()` is idempotent and awaits exit and temporary-policy cleanup. It sends a host control frame, independent of the guest's message handler. After `stopTimeoutMs` (default 5 seconds), it escalates to SIGTERM, then SIGKILL after another second if necessary. A force-killed process cannot guarantee asynchronous BLE cleanup.
- `dispose()` prevents new starts and waits for starting/running instances to stop. Connect it to the host's actual disable/uninstall/space-close/app-quit lifecycle. The SDK does not register global process signal handlers or restart failed plugins automatically.
- Node owns the stdin pipe. Closing it—including a Node crash—stops an SDK-mode background, even if it has active connections. Direct CLI mode keeps its earlier EOF semantics.
- Default SDK total duration is **0** (resident); standalone CLI default remains 30 seconds. Startup timeout defaults to 30 seconds. JS heap/turn defaults remain 64 MiB / 100ms. Messages are JSON, not structured clone; input wire frames are limited to 1 MiB and pending SDK input to 4 MiB.

## Host permissions and Bluetooth

Permissions are host configuration, not a plugin self-authorization mechanism. Never pass renderer input or an unreviewed manifest directly as grants. Each instance snapshots its configuration before startup. Permissions cannot be expanded at runtime; stop and create a new instance for changed grants.

```ts
const background = await backgrounds.start("demo.bluetooth", {
  entry: "/absolute/path/to/bluetooth.mjs",
  bluetoothMock: true, // Explicit simulation; remove for a real adapter/device.
  permissions: {
    bluetooth: {
      devices: [
        {
          id: "mock-battery",
          name: "Demo Battery",
          services: [{ uuid: "battery_service", read: true, notify: true }],
        },
      ],
    },
  },
  onMessage: (message) => console.log(message),
})
await background.postMessage({ type: "connect", id: "mock-battery" })
```

Run the complete SDK Bluetooth example from the monorepo root:

```sh
node packages/plugin-sandbox/examples/node-bluetooth.mjs
```

The SDK writes Bluetooth grants to a private temporary directory/file and removes it after child exit, including startup failures. The guest sees only authorized records via `navigator.bluetooth.getDevices()`; Rust rechecks exact device/service/operation grants. No grants means no device access. Mock mode uses the same policy path. Real device IDs come from the host-only `plugin-sandbox bluetooth-scan` command; see [Bluetooth guide](docs/bluetooth.md).

HTTP(S)/WS(S) are denied by default. Grant exact origins with `permissions.network.origins`; private/reserved destinations require `allowPrivateAddresses: true` as well. Redirects are rechecked and resolved IPs are pinned by the Rust broker. See [runtime API and limits](docs/runtime.md).

This is a capability-controlled runtime with a process boundary, **not an OS-level sandbox**. It does not protect against native engine vulnerabilities. BLE means GATT, not A2DP audio routing. Worker APIs are supported subsets, not full browser conformance.

## Layout and protocol

```text
packages/plugin-sandbox       Node SDK, examples, developer docs, integration tests
          │ spawn + private control protocol (stdin/stdout)
apps/plugin-sandbox           plugin-sandbox CLI deliverable
          │
crates/eidos-plugin-sandbox   QuickJS event loop + Rust network/Bluetooth brokers
```

In SDK mode (`run ... --listen --control-protocol`), host input is `{"type":"message","data":...}` or `{"type":"stop"}`. Output is `{"type":"ready","protocol":1}` or `{"type":"message","data":...}`. Only Rust emits the ready frame; guest `postMessage` data is always nested. Logs/diagnostics stay on stderr. This internal transport is versioned separately from the plugin's application messages. The SDK rejects incompatible frames and startup failures. Do not write to the child process directly.

The Rust library exposes a process-scoped blocking runner used by the CLI; it is not a reentrant in-process embedding API. Node backgrounds use one OS process per instance.

## Validation

```sh
pnpm --filter @eidos.space/plugin-sandbox typecheck
pnpm --filter @eidos.space/plugin-sandbox test
cargo test -p eidos-plugin-sandbox --locked
cargo clippy -p eidos-plugin-sandbox -p eidos-plugin-sandbox-cli --all-targets --locked -- -D warnings
```

SDK tests launch the real native binary. Build it first, or set the test/example environment variable `EIDOS_PLUGIN_SANDBOX_BINARY` to an explicit binary path. The SDK itself does not read this environment variable. Existing CLI acceptance suites are retained under `tests/`. BLE tests use explicit simulation and do not prove real hardware or OS permission behavior.
