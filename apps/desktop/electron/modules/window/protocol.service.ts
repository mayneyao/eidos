import { EidosProtocolUrlChannelName } from "@/lib/const"
import { app, shell } from "electron"
import { log } from "electron-log"
import path from "path"

import { Injectable, Inject } from "../../common/di"
import { WindowService } from "./window.service"

export interface ProtocolUrlPayload {
  url: string
  action?: string
  searchParams?: Record<string, string>
  extensionId?: string
}

/**
 * Protocol Service - Handles eidos:// protocol URLs
 *
 * Responsibilities:
 * - Handle protocol URL actions (block, extension, open-space, etc.)
 * - Send protocol events to renderer process
 * - Manage window focus for protocol handling
 */
@Injectable()
export class ProtocolService {
  private readonly PROTOCOL = "eidos"
  private pendingProtocolUrl: string | null = null

  constructor(@Inject(WindowService) private windowService: WindowService) {}

  /**
   * Set up protocol URL handlers for the app
   * - open-url: Handle protocol URLs on macOS
   * - second-instance: Handle protocol URLs on Windows/Linux (single instance lock)
   */
  setupProtocolHandlers(): void {
    // Handle protocol URL on macOS
    app.on("open-url", (event, url) => {
      event.preventDefault()
      console.log("Received protocol URL:", url)

      if (this.windowService.getMainWindow()) {
        this.handleUrl(url)
      } else {
        this.pendingProtocolUrl = url
      }
    })

    // Handle second instance (Windows/Linux)
    app.on("second-instance", (_event, commandLine) => {
      const protocolUrl = commandLine.find((arg) => arg.startsWith("eidos://"))
      if (protocolUrl) {
        this.handleUrl(protocolUrl)
      }

      if (this.windowService.isWindowMinimized()) {
        this.windowService.restoreWindow()
      }
      this.windowService.focusWindow()
    })
  }

  /**
   * Handle any pending protocol URL (called after window is created)
   */
  handlePendingProtocolUrl(): void {
    if (this.pendingProtocolUrl) {
      console.log("Handling pending protocol URL:", this.pendingProtocolUrl)
      this.handleUrl(this.pendingProtocolUrl)
      this.pendingProtocolUrl = null
    }
  }

  /**
   * Register the app as the default protocol client for eidos://
   */
  registerProtocolClient(): void {
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient("eidos", process.execPath, [
          path.resolve(process.argv[1]),
        ])
      }
    } else {
      app.setAsDefaultProtocolClient("eidos")
    }
  }

  handleUrl(url: string) {
    console.log("Handling URL:", url)
    try {
      if (!url.startsWith(`${this.PROTOCOL}://`)) {
        throw new Error(`Invalid protocol: ${url.split(":")[0]}`)
      }

      const urlObj = new URL(url)
      const action = urlObj.hostname
      const searchParams = Object.fromEntries(urlObj.searchParams)

      // Handle block action specifically
      if (action === "block") {
        this.handleBlockAction(urlObj, url)
        return
      }

      // Handle extension action
      // eidos://extension/extensionId
      if (action === "extension") {
        this.handleExtensionAction(urlObj, url, searchParams)
        return
      }

      // Handle open-space action (from CLI: eidos open)
      // Format: eidos://open-space?space=spaceId&path=/path/to/space
      if (action === "open-space") {
        this.handleOpenSpaceAction(searchParams)
        return
      }

      // Handle regular eidos protocol actions
      // convert vault to space
      if (searchParams.vault) {
        searchParams.space = searchParams.vault
      } else {
        searchParams.space = "default"
      }
      const payload: ProtocolUrlPayload = {
        url: url,
        action: action,
        searchParams,
      }

      console.log("Main process sending protocol-url event:", payload)
      this.sendToRenderer(payload)
    } catch (error) {
      log("Error handling protocol URL:", error)
      throw error
    }
  }

  private sendToRenderer(payload: ProtocolUrlPayload) {
    const win = this.windowService.getMainWindow()
    if (!win || win.isDestroyed()) {
      console.warn("Main window not available for protocol handling")
      return
    }

    win.webContents.send(EidosProtocolUrlChannelName, payload)

    if (win.isMinimized()) {
      win.restore()
    }
    win.focus()
  }

  private handleExtensionAction(
    urlObj: URL,
    originalUrl: string,
    searchParams: Record<string, string>
  ) {
    const pathParts = urlObj.pathname.split("/").filter((part) => part)
    if (pathParts.length === 0) {
      throw new Error(
        `Invalid extension URL format, missing extension ID: ${originalUrl}`
      )
    }
    const extensionId = pathParts[0]
    const payload: ProtocolUrlPayload = {
      url: originalUrl,
      action: "extension",
      extensionId: extensionId,
      searchParams: searchParams,
    }
    console.log("Main process sending protocol-url event (extension):", payload)
    this.sendToRenderer(payload)
  }

  private handleOpenSpaceAction(searchParams: Record<string, string>) {
    try {
      const spaceId = searchParams.space
      const spacePath = searchParams.path

      if (!spaceId) {
        throw new Error("Missing space ID in open-space URL")
      }

      console.log(
        `Opening space: ${spaceId} (${spacePath || "path not provided"})`
      )

      // Send to renderer to navigate to the space
      const payload: ProtocolUrlPayload = {
        url: `eidos://open-space?space=${spaceId}`,
        action: "open-space",
        searchParams,
      }

      this.sendToRenderer(payload)

      console.log("Space open request sent to renderer")
    } catch (error) {
      log("Error handling open-space action:", error)
      throw error
    }
  }

  private handleBlockAction(urlObj: URL, originalUrl: string) {
    try {
      // Format: eidos://block/blockid@databaseName?params
      const pathParts = urlObj.pathname.split("/").filter((part) => part)

      if (pathParts.length === 0) {
        throw new Error(
          `Invalid block URL format, missing block ID: ${originalUrl}`
        )
      }

      const blockInfoPart = pathParts[0]
      const blockInfo = blockInfoPart.split("@")

      if (blockInfo.length !== 2) {
        throw new Error(
          `Invalid block ID format, expected blockid@database: ${blockInfoPart}`
        )
      }

      const blockId = blockInfo[0]
      const database = blockInfo[1]

      const win = this.windowService.getMainWindow()
      if (!win || win.isDestroyed()) {
        console.warn("Main window not available for block handling")
        return
      }

      // Create URL to the standalone blocks page
      const currentUrl = win.webContents.getURL()
      const currentUrlObj = new URL(currentUrl)
      const baseUrl = currentUrlObj.origin + "/"
      // Format should be /:space/standalone-blocks/:id
      const standaloneBlockUrl = new URL(
        `${baseUrl}${database}/standalone-blocks/${blockId}`
      )
      // Copy any additional search parameters
      urlObj.searchParams.forEach((value, key) => {
        standaloneBlockUrl.searchParams.append(key, value)
      })

      // Open the URL in a new window using shell.openExternal
      console.log(
        "Opening standalone block URL in default browser:",
        standaloneBlockUrl.toString()
      )
      shell.openExternal(standaloneBlockUrl.toString())

      // Focus the main window
      if (win.isMinimized()) {
        win.restore()
      }
      win.focus()
    } catch (error) {
      log("Error handling block action:", error)
      throw error
    }
  }
}

// Backward compatibility
export class ProtocolHandler {
  constructor(private window: any) {}

  handleUrl(url: string) {
    const { container } = require("../../common/di")
    const { ProtocolService } = require("./protocol.service")
    const protocolService = container.get(ProtocolService)
    protocolService.handleUrl(url)
  }
}
