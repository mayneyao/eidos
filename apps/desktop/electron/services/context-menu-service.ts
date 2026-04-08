import { BrowserWindow, Menu, webContents } from "electron"
import { IpcService, IpcServiceBase } from "@eidos.space/electron-ipc"
import { convertToElectronMenuTemplateWithIds } from "../window/menu-utils"

export interface NativeMenuItem {
  id: string
  label?: string
  type?: "normal" | "separator" | "submenu" | "checkbox" | "radio"
  enabled?: boolean
  visible?: boolean
  checked?: boolean
  accelerator?: string
  icon?: string
  submenu?: NativeMenuItem[]
}

interface ContextMenuOptions {
  items: NativeMenuItem[]
  x?: number
  y?: number
}

/**
 * Context Menu Service - Handles native context menu display
 */
@IpcService("context-menu")
export class ContextMenuService extends IpcServiceBase {
  /**
   * Show a native context menu
   */
  async showNativeContextMenu(
    options: ContextMenuOptions
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { items, x, y } = options

      // Convert menu items to Electron menu template with click handlers
      const menuTemplate = convertToElectronMenuTemplateWithIds(items)

      // Create and show the menu
      const menu = Menu.buildFromTemplate(menuTemplate)

      // Get the focused window
      const window = BrowserWindow.getFocusedWindow()
      if (!window) {
        throw new Error("No focused window found")
      }

      // Show the menu at the specified position or at cursor
      if (x !== undefined && y !== undefined) {
        menu.popup({
          window,
          x: Math.round(x),
          y: Math.round(y),
          callback: () => {
            // Menu closed - cleanup if needed
          },
        })
      } else {
        menu.popup({
          window,
          callback: () => {
            // Menu closed - cleanup if needed
          },
        })
      }

      return { success: true }
    } catch (error) {
      console.error("Error showing native context menu:", error)
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }
}

// Export singleton instance
export const contextMenuService = new ContextMenuService()
