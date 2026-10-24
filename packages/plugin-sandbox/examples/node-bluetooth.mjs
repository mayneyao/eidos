import { BackgroundManager } from "../dist/index.js"
import { fileURLToPath } from "node:url"
import { setTimeout as delay } from "node:timers/promises"

const manager = new BackgroundManager({
  binaryPath: process.env.EIDOS_PLUGIN_SANDBOX_BINARY,
})
try {
  const background = await manager.start("demo.bluetooth", {
    entry: fileURLToPath(new URL("./bluetooth.mjs", import.meta.url)),
    bluetoothMock: true,
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
    onError: (error) => console.error(error.message),
  })
  await background.postMessage({ type: "list" })
  await background.postMessage({ type: "connect", id: "mock-battery" })
  await delay(1500) // Receive mock battery notifications while no UI is attached.
  await background.postMessage({ type: "status" })
  // Host stop works even if the guest does not implement a stop message.
  await delay(100)
  await manager.stop("demo.bluetooth")
} finally {
  await manager.dispose()
}
