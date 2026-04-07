import { utilityProcess } from "electron"
import { EventEmitter } from "events"
import fs from "fs"
import path from "path"

import { getMainWindowWebContents } from "../main"
import { CredentialsManager } from "../credentials"
import type { InitMessage } from "./rpc/rpc-types"

interface ProcessItem {
  process: Electron.UtilityProcess
  spaceId: string
  ready: Promise<void>
  lastUsed: number
}

export class DataSpaceProcessPool extends EventEmitter {
  private static instance: DataSpaceProcessPool
  private processes: Map<string, ProcessItem> = new Map()
  // We can implement a pool limit later, for now 1:1 map

  private constructor() {
    super()
  }

  public static getInstance(): DataSpaceProcessPool {
    if (!DataSpaceProcessPool.instance) {
      DataSpaceProcessPool.instance = new DataSpaceProcessPool()
    }
    return DataSpaceProcessPool.instance
  }

  public getProcess(
    spaceId: string,
    initData: Omit<InitMessage, "type" | "spaceId">
  ): Promise<Electron.UtilityProcess> {
    let item = this.processes.get(spaceId)

    if (item) {
      if (this.isProcessDead(item.process)) {
        console.log(`Process for space ${spaceId} is dead, restarting...`)
        this.processes.delete(spaceId)
      } else {
        item.lastUsed = Date.now()
        return item.ready.then(() => item!.process)
      }
    }

    const processPath = path.join(__dirname, "worker.js")

    console.log(`Spawning utility process for ${spaceId} at ${processPath}`)

    // Check if worker file exists before attempting to fork
    if (!fs.existsSync(processPath)) {
      const errorMsg = `Worker file not found at ${processPath}. This will prevent space ${spaceId} from loading.`
      console.error(errorMsg)
      throw new Error(errorMsg)
    }

    const child = utilityProcess.fork(processPath, [], {
      serviceName: `eidos-space-${spaceId}`,
      stdio: "inherit",
    })

    let resolveReady: () => void
    let rejectReady: (e: Error) => void
    let isReady = false
    const readyPromise = new Promise<void>((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })

    item = {
      process: child,
      spaceId,
      ready: readyPromise,
      lastUsed: Date.now(),
    }

    this.processes.set(spaceId, item)

    // Setup message handler for forwarding messages to renderer
    child.on("message", (message: any) => {
      const payload = message

      if (payload.type === "worker-ready") {
        isReady = true
        resolveReady!()
        return
      }

      if (payload.type === "forward-to-renderer") {
        // Forward message to renderer process
        const webContents = getMainWindowWebContents()
        if (webContents) {
          webContents.send(payload.channel, payload.data)
        } else {
          console.warn(
            "[ProcessPool] No main window webContents available, skipping message forward"
          )
        }
      } else if (payload.type === "call-renderer") {
        // Handle call-renderer requests (bidirectional)
        const webContents = getMainWindowWebContents()
        if (webContents) {
          // Set up response listener
          const responseHandler = (event: any, result: any) => {
            // Send response back to worker
            child.postMessage({
              type: "renderer-response",
              requestId: payload.requestId,
              data: result,
            })
          }

          // Listen for response from renderer
          const { ipcMain } = require("electron")
          ipcMain.once(`response-${payload.requestId}`, responseHandler)

          // Send request to renderer
          webContents.send("request-from-main", payload.requestId, payload.data)
        } else {
          console.warn(
            "[ProcessPool] No main window webContents available, cannot call renderer"
          )
          // Send error response back to worker
          child.postMessage({
            type: "renderer-response",
            requestId: payload.requestId,
            data: { error: "No main window available" },
          })
        }
      } else if (payload.type === "get-access-token") {
        CredentialsManager.getAccessToken()
          .then((token) => {
            child.postMessage({
              type: "access-token-response",
              requestId: payload.requestId,
              token,
            })
          })
          .catch((err) => {
            console.error("Failed to get access token for worker", err)
            child.postMessage({
              type: "access-token-response",
              requestId: payload.requestId,
              token: null,
            })
          })
      } else if (payload.type === "rpc-response") {
        this.emit(`rpc-response-${payload.id}`, payload.result)
      }
    })

    // Setup lifecycle handlers
    child.on("exit", (code) => {
      console.log(`Process for ${spaceId} exited with code ${code}`)
      this.processes.delete(spaceId)
      // If process exits with non-zero code before ready, reject the promise
      if (code !== 0 && !isReady) {
        rejectReady(
          new Error(
            `Worker process for space ${spaceId} exited with code ${code}`
          )
        )
      }
    })

    child.on("spawn", () => {
      console.log(`Process spawned for ${spaceId}`)
      // Send init message
      const initMsg: InitMessage = {
        type: "init",
        spaceId,
        spaceInfo: initData.spaceInfo,
        paths: initData.paths,
      }
      child.postMessage(initMsg)
    })

    // Wait for worker to signal it's ready via 'worker-ready' message

    return readyPromise.then(() => child)
  }

  private isProcessDead(proc: Electron.UtilityProcess): boolean {
    // There is no direct .killed property on utilityProcess in some versions,
    // but we track exit event. If it's in the map, it should be alive.
    // Use a try-catch on a property check or rely on event listeners.
    try {
      return false
    } catch {
      return true
    }
  }

  public killAll() {
    for (const item of this.processes.values()) {
      try {
        item.process.kill()
      } catch (e) {
        console.error(`Failed to kill process for ${item.spaceId}`, e)
      }
    }
    this.processes.clear()
  }

  public sendToProcess(spaceId: string, message: any) {
    const item = this.processes.get(spaceId)
    if (item && !this.isProcessDead(item.process)) {
      item.process.postMessage(message)
    } else {
      console.warn(
        `[ProcessPool] Cannot send message, process for ${spaceId} is dead or not found`
      )
    }
  }

  public async callProcess(
    spaceId: string,
    method: string,
    data?: any
  ): Promise<any> {
    const item = this.processes.get(spaceId)
    if (!item || this.isProcessDead(item.process)) {
      throw new Error(`Process for space ${spaceId} not found or dead`)
    }

    const id = Math.random().toString(36).substr(2, 9)
    const timeoutMs = 30000

    const promise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.off(`rpc-response-${id}`, onResponse)
        reject(new Error(`RPC call timeout (${timeoutMs}ms): ${method}`))
      }, timeoutMs)

      const onResponse = (result: any) => {
        clearTimeout(timeoutId)
        resolve(result)
      }

      this.once(`rpc-response-${id}`, onResponse)
    })

    item.process.postMessage({
      type: "rpc-request",
      id,
      method,
      data,
    })

    return promise
  }
}
