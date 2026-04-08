import { BrowserWindow, Menu } from "electron"
import type { NativeMenuItem } from "../services/context-menu-service"

/**
 * Helper function to convert menu items with IDs for click handling
 */
export function convertToElectronMenuTemplateWithIds(
  items: NativeMenuItem[]
): Electron.MenuItemConstructorOptions[] {
  return items.map((item, index) => {
    if (item.type === "separator") {
      return {
        type: "separator" as const,
      }
    }

    if (item.type === "submenu") {
      return {
        label: item.label,
        enabled: item.enabled ?? true,
        submenu: convertToElectronMenuTemplateWithIds(item.submenu ?? []),
        icon: item.icon,
        click: item.id
          ? () => {
              // Send click event back to renderer with the item ID
              const focusedWindow = BrowserWindow.getFocusedWindow()
              if (focusedWindow) {
                focusedWindow.webContents.send("native-menu-click", item.id)
              }
            }
          : undefined,
      }
    }

    // For text, checkbox, and radio items
    const baseItem = {
      label: item.label,
      enabled: item.enabled ?? true,
      accelerator: (item as any).accelerator,
      icon: (item as any).icon,
      click: item.id
        ? () => {
            // Send click event back to renderer with the item ID
            const focusedWindow = BrowserWindow.getFocusedWindow()
            if (focusedWindow) {
              focusedWindow.webContents.send("native-menu-click", item.id)
            }
          }
        : undefined,
    }

    if (item.type === "checkbox") {
      return {
        ...baseItem,
        type: "checkbox" as const,
        checked: item.checked ?? false,
      }
    }

    if (item.type === "radio") {
      return {
        ...baseItem,
        type: "radio" as const,
        checked: item.checked ?? false,
      }
    }

    // Default text item
    return baseItem
  })
}
