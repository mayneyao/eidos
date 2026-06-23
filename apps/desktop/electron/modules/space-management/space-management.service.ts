/**
 * Space Management Service - Handles space CRUD and switching operations
 */

import { IpcServiceBase } from "@eidos.space/electron-ipc"
import { IpcInjectable, Inject, container } from "../../common/di"
import { SpaceRegistry } from "./space-registry"
import { MainWindowProvider } from "./main-window.provider"
import { DataSpaceManager, DataSpaceProcessPool } from "../data-space"
import { getCredentialsManager } from "../sync/sync.module"
import { getConfigManager } from "../config/config-manager"
import { PORT } from "../../main"
import { BrowserService } from "../browser/browser.service"

/**
 * Space Management Service - Provides space management via IPC
 *
 * IPC Channels:
 * - space-mgmt:listSpaces: List all registered spaces
 * - space-mgmt:getCurrentSpace: Get current space
 * - space-mgmt:getSpaceById: Get space by ID
 * - space-mgmt:registerSpace: Register new space
 * - space-mgmt:removeSpace: Remove space
 * - space-mgmt:updateSpace: Update space
 * - space-mgmt:switchSpace: Switch to different space
 * - space-mgmt:toggleSpaceSync: Toggle sync for space
 */
@IpcInjectable("space-mgmt")
export class SpaceManagementService extends IpcServiceBase {
  constructor(
    @Inject(SpaceRegistry) private registry: SpaceRegistry,
    @Inject(MainWindowProvider) private windowProvider: MainWindowProvider,
    @Inject(DataSpaceManager) private dataSpaceManager: DataSpaceManager,
    @Inject(DataSpaceProcessPool) private processPool: DataSpaceProcessPool
  ) {
    super()
  }

  /**
   * List all registered spaces
   * IPC: space-mgmt:listSpaces
   */
  listSpaces(): ReturnType<SpaceRegistry["getAllSpaces"]> {
    return this.registry.getAllSpaces()
  }

  /**
   * Get the current space
   * IPC: space-mgmt:getCurrentSpace
   */
  getCurrentSpace() {
    const configManager = getConfigManager()
    const spaceId = configManager.getLastOpenedSpace()
    if (!spaceId) {
      return null
    }

    return this.registry.getSpace(spaceId)
  }

  /**
   * Get a space by ID
   * IPC: space-mgmt:getSpaceById
   */
  getSpaceById(spaceId: string) {
    return this.registry.getSpace(spaceId)
  }

  /**
   * Register a new space
   * IPC: space-mgmt:registerSpace
   */
  registerSpace(
    spacePath: string,
    options: { customName?: string; remoteUrl?: string } = {}
  ): { success: boolean; space?: any; error?: string } {
    try {
      const space = this.registry.registerSpace(spacePath, {
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
   * IPC: space-mgmt:removeSpace
   */
  removeSpace(spaceId: string): { success: boolean } {
    const success = this.registry.removeSpace(spaceId)
    return { success }
  }

  /**
   * Update a space
   * IPC: space-mgmt:updateSpace
   */
  updateSpace(
    spaceId: string,
    updates: { name?: string; relay?: any }
  ): { success: boolean; error?: string } {
    try {
      const success = this.registry.updateSpace(spaceId, updates)
      if (success) {
        this.processPool.sendToProcess(spaceId, {
          type: "update-space-info",
          spaceInfo: this.registry.getSpace(spaceId),
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
   * IPC: space-mgmt:switchSpace
   */
  async switchSpace(spaceId: string): Promise<{ success: boolean }> {
    const space = this.registry.getSpace(spaceId)

    if (!space) {
      throw new Error(`Space not found: ${spaceId}`)
    }

    const configManager = getConfigManager()
    configManager.setLastOpenedSpace(spaceId)

    console.log(`Pre-initializing DataSpace for: ${spaceId}`)
    try {
      await this.dataSpaceManager.getOrSetDataSpace(spaceId)
      console.log(`DataSpace initialized for: ${spaceId}`)
    } catch (error) {
      console.error(`Failed to initialize DataSpace for ${spaceId}:`, error)
      throw error
    }

    const win = this.windowProvider.getWindow()
    if (win) {
      const waitForLoad = () => {
        return new Promise<void>((resolve) => {
          win!.webContents.once("did-finish-load", () => {
            const currentURL = win!.webContents.getURL()
            console.log(`Page loaded at: ${currentURL}`)
            resolve()
          })
        })
      }

      // Close all BrowserViews before switching space to prevent them from covering the main window
      try {
        const browserService = container.get(BrowserService)
        browserService.closeAll()
      } catch {
        // BrowserService might not be available, ignore
      }

      if (process.env.VITE_DEV_SERVER_URL) {
        const devUrl = new URL(process.env.VITE_DEV_SERVER_URL)
        const devSubdomainUrl = `http://${spaceId}.eidos.localhost:${devUrl.port}/`
        console.log(
          `Switching to space in development mode: ${devSubdomainUrl}`
        )
        win.loadURL(devSubdomainUrl)
        await waitForLoad()
        console.log(`Page loaded, now reloading to ensure clean state...`)
        win.reload()
        await waitForLoad()
        console.log(`Space switch complete to: ${spaceId}`)
      } else {
        const prodSubdomainUrl = `http://${spaceId}.eidos.localhost:${PORT}/`
        console.log(
          `Switching to space in production mode: ${prodSubdomainUrl}`
        )
        win.loadURL(prodSubdomainUrl)
        await waitForLoad()
        console.log(`Page loaded, now reloading to ensure clean state...`)
        win.reload()
        await waitForLoad()
        console.log(`Space switch complete to: ${spaceId}`)
      }
    }

    return { success: true }
  }

  /**
   * Toggle sync for a space
   * IPC: space-mgmt:toggleSpaceSync
   */
  async toggleSpaceSync(
    spaceId: string,
    enabled: boolean,
    remote?: string,
    provider?: "eidos.space" | "custom"
  ): Promise<{ success: boolean; error?: string; reloadRequired?: boolean }> {
    const space = this.registry.getSpace(spaceId)
    if (!space) {
      return { success: false, error: "Space not found" }
    }

    const dataSpace = this.dataSpaceManager.getDataSpace()
    if (!dataSpace) {
      return { success: false, error: "Data space not initialized" }
    }

    const configManager = getConfigManager()
    const effectiveProvider =
      provider ||
      space.sync?.provider ||
      configManager.getDefaultSyncProvider() ||
      "eidos.space"

    if (enabled) {
      if (!remote) {
        return {
          success: false,
          error: "Remote URL is required to enable sync",
        }
      }

      const credentialsManager = getCredentialsManager()
      const credentials =
        await credentialsManager.getSyncCredentials(effectiveProvider)
      if (!credentials) {
        return {
          success: false,
          error: `No sync credentials found for ${effectiveProvider}. Please configure sync settings first.`,
        }
      }

      const isLocalOnlyVersioned =
        space.versioning?.enabled && !space.sync?.enabled
      if (isLocalOnlyVersioned) {
        // Already in Graft mode (local-only). Reconfigure remote only.
        await dataSpace.reconfigureRemote(credentials, remote)
      } else {
        // Fresh space, convert from regular SQLite to Graft with sync.
        await dataSpace.convertToGraft(remote)
      }

      this.registry.setSpaceSync(spaceId, {
        enabled: true,
        remote: remote,
        provider: effectiveProvider,
      })
      this.registry.setSpaceVersioning(spaceId, { enabled: true })

      if (!(await this.dataSpaceManager.reload())) {
        throw new Error("Failed to reload data space after enabling sync")
      }

      return { success: true, reloadRequired: false }
    } else {
      const keepLocalVersioning =
        space.versioning?.enabled || space.sync?.enabled || false
      if (space.sync?.enabled) {
        await dataSpace.hydrate()
      }

      this.registry.setSpaceSync(spaceId, {
        enabled: false,
        remote: space.sync?.remote || "",
        provider: space.sync?.provider,
      })
      this.registry.setSpaceVersioning(spaceId, {
        enabled: keepLocalVersioning,
      })

      await this.dataSpaceManager.reload()

      return { success: true, reloadRequired: false }
    }
  }

  async toggleLocalVersioning(
    spaceId: string,
    enabled: boolean
  ): Promise<{ success: boolean; error?: string; reloadRequired?: boolean }> {
    const space = this.registry.getSpace(spaceId)
    if (!space) {
      return { success: false, error: "Space not found" }
    }

    const dataSpace = this.dataSpaceManager.getDataSpace()
    if (!dataSpace) {
      return { success: false, error: "Data space not initialized" }
    }

    try {
      if (enabled) {
        if (space.sync?.enabled || space.versioning?.enabled) {
          this.registry.setSpaceVersioning(spaceId, { enabled: true })
          return { success: true, reloadRequired: false }
        }
        await dataSpace.enableLocalVersioning()
        this.registry.setSpaceVersioning(spaceId, { enabled: true })
        await this.dataSpaceManager.reload()
      } else {
        if (space.sync?.enabled) {
          return {
            success: false,
            error: "Disable remote sync before disabling local version history",
          }
        }
        if (!space.versioning?.enabled) {
          return { success: true, reloadRequired: false }
        }
        await dataSpace.exportToSqlite()
        this.registry.setSpaceVersioning(spaceId, { enabled: false })
        await this.dataSpaceManager.reload()
      }
      return { success: true, reloadRequired: false }
    } catch (error: any) {
      return {
        success: false,
        error: error?.message ?? "Failed to toggle local versioning",
      }
    }
  }
}
