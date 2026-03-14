import { parentPort, workerData } from "worker_threads"
import type { SyncConfig } from "@/packages/sync"
import { FileSynchronizer } from "@/packages/sync"

if (!parentPort) {
  throw new Error("Must be run as a worker thread")
}

let synchronizer: FileSynchronizer | null = null

function log(level: string, ...args: any[]) {
  parentPort?.postMessage({
    type: "log",
    level,
    message: args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" "),
  })
}

const consoleOverride = {
  log: (...args: any[]) => log("info", ...args),
  warn: (...args: any[]) => log("warn", ...args),
  error: (...args: any[]) => log("error", ...args),
  info: (...args: any[]) => log("info", ...args),
  debug: (...args: any[]) => log("debug", ...args),
}

// Override console to forward logs to parent
global.console = { ...global.console, ...consoleOverride }

async function startSync(config: SyncConfig) {
  try {
    if (synchronizer) {
      synchronizer.stop()
    }

    console.log("Initializing FileSynchronizer in worker...")
    synchronizer = new FileSynchronizer(config)

    await synchronizer.start()
    console.log("FileSynchronizer started.")
  } catch (error) {
    console.error("Failed to start synchronizer:", error)
  }
}

// Handle messages from parent
parentPort.on("message", async (msg) => {
  if (msg.type === "start") {
    await startSync(msg.config)
  } else if (msg.type === "stop") {
    if (synchronizer) {
      synchronizer.stop()
      synchronizer = null
    }
    process.exit(0)
  }
})

// Handle initial config if passed via workerData
if (workerData && workerData.config) {
  startSync(workerData.config)
}
