import type { BrowserWindow } from "electron"
import { IpcService, IpcServiceBase } from "@eidos.space/electron-ipc"
import { DataSpaceProcessPool } from "../core/data-space/process-pool"
import { getDataSpace, getOrSetDataSpace } from "../core/data-space"
import { getConfigManager } from "./config-manager"
import { getSpaceRegistry } from "./space-registry"
import { PORT } from "../main"

interface SpaceManagementOptions {
  getMainWindow: () => BrowserWindow | null
}

/**
 * Space Management Service - Handles space CRUD and switching operations
 */
@IpcService("space-mgmt")
export class SpaceManagementService extends IpcServiceBase {
  private getMainWindow: () => BrowserWindow | null

  constructor(options: SpaceManagementOptions) {
    super()
    this.getMainWindow = options.getMainWindow
  }

  /**
   * List all registered spaces
   */
  listSpaces(): ReturnType<
    ReturnType<typeof getSpaceRegistry>["getAllSpaces"]
  > {
    const registry = getSpaceRegistry()
    return registry.getAllSpaces()
  }

  /**
   * Get the current space
   */
  getCurrentSpace() {
    const configManager = getConfigManager()
    const spaceId = configManager.getLastOpenedSpace()
    if (!spaceId) {
      return null
    }

    const registry = getSpaceRegistry()
    return registry.getSpace(spaceId)
  }

  /**
   * Get a space by ID
   */
  getSpaceById(spaceId: string) {
    const registry = getSpaceRegistry()
    return registry.getSpace(spaceId)
  }

  /**
   * Register a new space
   */
  registerSpace(
    spacePath: string,
    options: { customName?: string; remoteUrl?: string } = {}
  ): { success: boolean; space?: any; error?: string } {
    const registry = getSpaceRegistry()
    try {
      const space = registry.registerSpace(spacePath, {
        customName: options.customName,
        remoteUrl: options.remoteUrl,
      })
      return { success: true, space }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Remove a space
   */
  removeSpace(spaceId: string): { success: boolean } {
    const registry = getSpaceRegistry()
    const success = registry.removeSpace(spaceId)
    return { success }
  }

  /**
   * Update a space
   */
  updateSpace(
    spaceId: string,
    updates: { name?: string; relay?: any }
  ): { success: boolean; error?: string } {
    const registry = getSpaceRegistry()
    try {
      const success = registry.updateSpace(spaceId, updates)
      if (success) {
        const processPool = DataSpaceProcessPool.getInstance()
        processPool.sendToProcess(spaceId, {
          type: "update-space-info",
          spaceInfo: registry.getSpace(spaceId),
        })
        return { success: true }
      } else {
        return { success: false, error: "Space not found" }
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Switch to a different space
   */
  async switchSpace(spaceId: string): Promise<{ success: boolean }> {
    const registry = getSpaceRegistry()
    const space = registry.getSpace(spaceId)

    if (!space) {
      throw new Error(`Space not found: ${spaceId}`)
    }

    const configManager = getConfigManager()
    configManager.setLastOpenedSpace(spaceId)

    // Pre-initialize DataSpace before switching URL
    console.log(`🔧 Pre-initializing DataSpace for: ${spaceId}`)
    try {
      await getOrSetDataSpace(spaceId)
      console.log(`✅ DataSpace initialized for: ${spaceId}`)
    } catch (error) {
      console.error(`❌ Failed to initialize DataSpace for ${spaceId}:`, error)
      throw error
    }

    const win = this.getMainWindow()
    if (win) {
      // Wait for page to load before reloading to ensure URL change is applied
      const waitForLoad = () => {
        return new Promise<void>((resolve) => {
          win!.webContents.once("did-finish-load", () => {
            const currentURL = win!.webContents.getURL()
            console.log(`📍 Page loaded at: ${currentURL}`)
            resolve()
          })
        })
      }

      if (process.env.VITE_DEV_SERVER_URL) {
        const devUrl = new URL(process.env.VITE_DEV_SERVER_URL)
        const devSubdomainUrl = `http://${spaceId}.eidos.localhost:${devUrl.port}/`
        console.log(
          `🔄 Switching to space in development mode: ${devSubdomainUrl}`
        )
        win.loadURL(devSubdomainUrl)
        await waitForLoad()
        console.log(`✅ Page loaded, now reloading to ensure clean state...`)
        win.reload()
        await waitForLoad()
        console.log(`🎉 Space switch complete to: ${spaceId}`)
      } else {
        const prodSubdomainUrl = `http://${spaceId}.eidos.localhost:${PORT}/`
        console.log(
          `🔄 Switching to space in production mode: ${prodSubdomainUrl}`
        )
        win.loadURL(prodSubdomainUrl)
        await waitForLoad()
        console.log(`✅ Page loaded, now reloading to ensure clean state...`)
        win.reload()
        await waitForLoad()
        console.log(`🎉 Space switch complete to: ${spaceId}`)
      }
    }

    return { success: true }
  }

  /**
   * Toggle sync for a space
   */
  async toggleSpaceSync(
    spaceId: string,
    enabled: boolean,
    remote?: string,
    provider?: "eidos.space" | "custom"
  ): Promise<{ success: boolean; error?: string }> {
    const { CredentialsManager } = await import("./credentials")
    const registry = getSpaceRegistry()
    const space = registry.getSpace(spaceId)
    if (!space) {
      return { success: false, error: "Space not found" }
    }

    const dataSpace = getDataSpace()
    if (!dataSpace) {
      return { success: false, error: "Data space not initialized" }
    }

    // Use provided provider, fallback to space's current provider, then default
    const configManager = getConfigManager()
    const effectiveProvider =
      provider ||
      space.sync?.provider ||
      configManager.getDefaultSyncProvider() ||
      "eidos.space"

    if (enabled) {
      // Enable sync: convert to graft
      if (!remote) {
        return {
          success: false,
          error: "Remote URL is required to enable sync",
        }
      }

      // Check if credentials exist for selected provider
      const credentials =
        await CredentialsManager.getSyncCredentials(effectiveProvider)
      if (!credentials) {
        return {
          success: false,
          error: `No sync credentials found for ${effectiveProvider}. Please configure sync settings first.`,
        }
      }

      await dataSpace.convertToGraft(remote)

      // Update space registry
      registry.setSpaceSync(spaceId, {
        enabled: true,
        remote: remote,
        provider: effectiveProvider,
      })

      return { success: true }
    } else {
      // Disable sync: export to sqlite
      await dataSpace.exportToSqlite()

      // Update space registry
      registry.setSpaceSync(spaceId, {
        enabled: false,
        remote: space.sync?.remote || "",
        provider: space.sync?.provider,
      })

      return { success: true }
    }
  }
}
