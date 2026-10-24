// Run after building the SDK and native binary; see README.
import { BackgroundManager } from "../dist/index.js"
import { fileURLToPath } from "node:url"
import { setTimeout as delay } from "node:timers/promises"

const manager = new BackgroundManager({
  binaryPath: process.env.EIDOS_PLUGIN_SANDBOX_BINARY,
})
const replies = new Map()
let sequence = 0

try {
  const background = await manager.start("demo.counter", {
    entry: fileURLToPath(new URL("./background-plugin.mjs", import.meta.url)),
    // Host-selected grants. Omitted network/Bluetooth means no access.
    permissions: {},
    limits: { memoryMb: 32, turnBudgetMs: 100, maxDurationMs: 0 },
    onMessage(message) {
      if (
        message &&
        typeof message === "object" &&
        !Array.isArray(message) &&
        replies.has(message.requestId)
      ) {
        replies.get(message.requestId)(message)
      } else console.log("event:", message)
    },
    onLog: (line) => console.log("plugin log:", line),
    onError: (error) => console.error("background error:", error.message),
    onExit: (exit) => console.log("exit:", exit.reason, exit.code),
  })

  async function request(method, amount) {
    const requestId = ++sequence
    let timer
    const reply = new Promise((resolve, reject) => {
      replies.set(requestId, resolve)
      timer = setTimeout(() => reject(new Error("Reply timed out")), 2000)
    })
    // Attach the handler before writing so immediate replies cannot be lost.
    try {
      const [, result] = await Promise.all([
        background.postMessage({
          requestId,
          method,
          ...(amount === undefined ? {} : { amount }),
        }),
        reply,
      ])
      return result
    } finally {
      clearTimeout(timer)
      replies.delete(requestId)
    }
  }

  console.log("started:", background.pid, background.state)
  console.log("increment:", await request("increment", 2))
  await delay(1100) // No view is required to keep the plugin alive.
  console.log("status:", await request("status"))
  console.log("same instance:", manager.get("demo.counter") === background)
  await manager.stop("demo.counter")
  console.log("remaining:", manager.size)
} finally {
  // Electron app shutdown / space close / plugin disable should call this.
  await manager.dispose()
}
