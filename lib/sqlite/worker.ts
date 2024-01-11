import { logger } from "../log"

// global singleton
let worker: Worker

export const getWorker = () => {
  if (!worker) {
    worker = new Worker(
      new URL("@/worker/web-worker/index.ts", import.meta.url),
      {
        type: "module",
      }
    )
    // logger.info("load worker")
  }
  return worker
}
