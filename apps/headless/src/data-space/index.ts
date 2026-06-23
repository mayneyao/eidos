/**
 * DataSpace manager for headless server
 * Initializes and manages the DataSpace instance
 */

import { EventEmitter } from "events"
import fs from "node:fs"
import path from "node:path"
import { DataSpace } from "@eidos.space/core"

import type { HeadlessConfig } from "../config/env"
import { applyGraftEnv } from "../config/env"
import { getExtensionPaths, validateExtensions } from "../utils/extensions"
import { NodeServerDatabase, initializeDatabase } from "./node-server-db"

/**
 * Create a mock BroadcastChannel for Node.js environment
 */
function createMockBroadcastChannel(name: string) {
  const emitter = new EventEmitter()
  return {
    name,
    postMessage: (data: any) => {
      setTimeout(() => {
        emitter.emit("message", { data })
      }, 0)
    },
    set onmessage(handler: (event: { data: any }) => void) {
      emitter.removeAllListeners("message")
      if (handler) {
        emitter.on("message", handler)
      }
    },
    onmessageerror: null,
    addEventListener: (type: string, listener: (...args: any[]) => void) => {
      emitter.on(type, listener)
    },
    removeEventListener: (type: string, listener: (...args: any[]) => void) => {
      emitter.off(type, listener)
    },
    dispatchEvent: (event: any): boolean => {
      return emitter.emit(event.type, event)
    },
    close: () => {
      emitter.removeAllListeners()
    },
  }
}

let dataSpaceInstance: DataSpace | null = null

/**
 * Get or create DataSpace instance
 */
export async function getDataSpace(config: HeadlessConfig): Promise<DataSpace> {
  if (dataSpaceInstance) {
    return dataSpaceInstance
  }

  console.log("[DataSpace] Initializing...")

  // Ensure data directory exists
  if (!fs.existsSync(config.dataDir)) {
    fs.mkdirSync(config.dataDir, { recursive: true })
  }

  const eidosDir = path.join(config.dataDir, ".eidos")
  const graftDir = path.join(eidosDir, ".graft")
  const graftConfigPath = path.join(graftDir, "config.toml")

  // Check if Graft is configured
  const graftEnabled = !!(
    config.awsAccessKeyId &&
    config.awsSecretAccessKey &&
    config.s3Prefix
  )

  // IMPORTANT: Check if this is first init BEFORE creating any directories
  // This matches desktop's isInitializationOperation() logic
  const isFirstInit =
    graftEnabled &&
    (!fs.existsSync(eidosDir) ||
      !fs.existsSync(graftConfigPath) ||
      !fs.existsSync(graftDir))

  if (isFirstInit) {
    console.log(
      "[DataSpace] First-time initialization detected (no graft data)"
    )
  }

  let remoteUri: string | undefined
  if (graftEnabled) {
    if (!fs.existsSync(eidosDir)) {
      fs.mkdirSync(eidosDir, { recursive: true })
    }

    remoteUri = applyGraftEnv(config)
  }

  // Find extensions using utility
  const extensionValidation = validateExtensions()
  if (extensionValidation.found.length > 0) {
    console.log(
      `[DataSpace] Found extensions: ${extensionValidation.found.join(", ")}`
    )
  }
  if (extensionValidation.missing.length > 0) {
    console.warn(
      `[DataSpace] Missing extensions: ${extensionValidation.missing.join(", ")}`
    )
  }

  const extensions = getExtensionPaths()

  // Initialize database - pass isFirstInit computed before directory creation
  const { db, isSyncEnabled } = await initializeDatabase(config.dataDir, {
    graftEnabled: graftEnabled && !!extensions.graft,
    isFirstInit,
    remoteUri,
    extensions,
  })

  // Create DataSpace
  const spaceId = config.s3Prefix.split("/")[0] || "headless"

  dataSpaceInstance = new DataSpace({
    db: db as any,
    activeUndoManager: false,
    dbName: spaceId,
    context: {
      setInterval,
    },
    dataEventChannel: createMockBroadcastChannel(`space-${spaceId}`) as any,
    enableFTS: true,
  })

  console.log(`[DataSpace] Initialized: ${spaceId}`)
  console.log(
    `[DataSpace] Graft sync: ${isSyncEnabled ? "enabled" : "disabled"}`
  )

  return dataSpaceInstance
}

/**
 * Close DataSpace
 */
export function closeDataSpace(): void {
  if (dataSpaceInstance) {
    dataSpaceInstance.close()
    dataSpaceInstance = null
    console.log("[DataSpace] Closed")
  }
}
