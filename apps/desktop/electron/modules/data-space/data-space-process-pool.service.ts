import { ipcMain, utilityProcess } from "electron"
import { EventEmitter } from "events"
import fs from "fs"
import path from "path"

import { Injectable, Inject, container } from "../../common/di"
import { LoggerService } from "../logger/logger.service"
import { MainWindowProvider } from "../space-management/main-window.provider"
import { CredentialsManager } from "../sync/credentials"
import type { InitMessage } from "./worker/rpc/rpc-types"

interface ProcessItem {
  process: Electron.UtilityProcess
  spaceId: string
  ready: Promise<void>
  lastUsed: number
}

function utilityProcessEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      env[key] = value
    }
  }
  env.SQLITE_USE_URI = "1"
  return env
}

/**
 * DataSpace Process Pool - Manages UtilityProcess workers
 *
 * Responsibilities:
 * - Spawn and manage utility processes for each space
 * - Handle IPC message forwarding between worker and renderer
 * - Provide RPC call mechanism
 */
@Injectable()
export class DataSpaceProcessPool extends EventEmitter {
  private processes: Map<string, ProcessItem> = new Map()

  constructor(@Inject(LoggerService) private logger: LoggerService) {
    super()
  }

  /**
   * Get MainWindowProvider from DI container
   */
  private get windowProvider(): MainWindowProvider {
    return container.get(MainWindowProvider)
  }

  /**
   * Get CredentialsManager from DI container
   */
  private get credentialsManager(): CredentialsManager {
    return container.get(CredentialsManager)
  }

  public getProcess(
    spaceId: string,
    initData: Omit<InitMessage, "type" | "spaceId">
  ): Promise<Electron.UtilityProcess> {
    let item = this.processes.get(spaceId)

    if (item) {
      if (this.isProcessDead(item.process)) {
        this.logger.info(`Process for space ${spaceId} is dead, restarting...`)
        this.processes.delete(spaceId)
      } else {
        item.lastUsed = Date.now()
        return item.ready.then(() => item!.process)
      }
    }

    const processPath = path.join(__dirname, "worker.js")

    this.logger.info(
      `Spawning utility process for ${spaceId} at ${processPath}`
    )

    // Check if worker file exists before attempting to fork
    if (!fs.existsSync(processPath)) {
      const errorMsg = `Worker file not found at ${processPath}. This will prevent space ${spaceId} from loading.`
      this.logger.error(errorMsg)
      throw new Error(errorMsg)
    }

    const child = utilityProcess.fork(processPath, [], {
      serviceName: `eidos-space-${spaceId}`,
      stdio: "pipe",
      env: utilityProcessEnv(),
    })

    // Intercept worker stdout/stderr and log with timestamp
    child.stdout?.on("data", (data: Buffer) => {
      const lines = data.toString().trim().split("\n")
      for (const line of lines) {
        if (line.trim()) {
          this.logger.info(`[worker:${spaceId}] ${line}`)
        }
      }
    })

    child.stderr?.on("data", (data: Buffer) => {
      const lines = data.toString().trim().split("\n")
      for (const line of lines) {
        if (line.trim()) {
          this.logger.error(`[worker:${spaceId}] ${line}`)
        }
      }
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

      if (payload.type === "worker-init-error") {
        rejectReady!(
          new Error(payload.message || "DataSpace initialization failed")
        )
        child.kill()
        return
      }

      if (payload.type === "forward-to-renderer") {
        // Forward message to renderer process
        const window = this.windowProvider.getWindow()
        const webContents = window?.webContents
        if (webContents) {
          webContents.send(payload.channel, payload.data)
        } else {
          this.logger.warn(
            "[ProcessPool] No main window webContents available, skipping message forward"
          )
        }
      } else if (payload.type === "call-renderer") {
        // Handle call-renderer requests (bidirectional)
        const window = this.windowProvider.getWindow()
        const webContents = window?.webContents
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
          ipcMain.once(`response-${payload.requestId}`, responseHandler)

          // Send request to renderer
          webContents.send("request-from-main", payload.requestId, payload.data)
        } else {
          this.logger.warn(
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
        this.credentialsManager
          .getAccessToken()
          .then((token) => {
            child.postMessage({
              type: "access-token-response",
              requestId: payload.requestId,
              token,
            })
          })
          .catch((err) => {
            this.logger.error("Failed to get access token for worker", err)
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
      this.logger.info(`Process for ${spaceId} exited with code ${code}`)
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
      this.logger.info(`Process spawned for ${spaceId}`)
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
        this.logger.error(`Failed to kill process for ${item.spaceId}`, e)
      }
    }
    this.processes.clear()
  }

  public async kill(spaceId: string) {
    const item = this.processes.get(spaceId)
    if (!item) {
      return
    }

    const exited = new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 2000)
      item.process.once("exit", () => {
        clearTimeout(timeout)
        resolve()
      })
    })

    try {
      item.process.kill()
    } catch (e) {
      this.logger.error(`Failed to kill process for ${spaceId}`, e)
    }
    this.processes.delete(spaceId)
    await exited
  }

  public sendToProcess(spaceId: string, message: any) {
    const item = this.processes.get(spaceId)
    if (item && !this.isProcessDead(item.process)) {
      item.process.postMessage(message)
    } else {
      this.logger.warn(
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
