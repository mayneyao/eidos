import { Menu, Tray, app, nativeImage } from "electron"
import electronLog from "electron-log"
import path from "path"

let tray: Tray | null = null

export interface TrayManagerOptions {
  getWindow: () => Electron.BrowserWindow | null
  onQuit: () => void
}

/**
 * Create system tray icon and menu
 */
export function createTray(options: TrayManagerOptions): void {
  if (process.platform === "darwin") {
    return
  }
  try {
    const iconPath = path.join(process.env.VITE_PUBLIC || "", "logo.png")
    electronLog.info("Tray icon path:", iconPath)

    const icon = nativeImage.createFromPath(iconPath)
    tray = new Tray(icon)

    const contextMenu = Menu.buildFromTemplate([
      { label: "show", click: () => options.getWindow()?.show() },
      {
        label: "exit",
        click: () => {
          options.onQuit()
          app.quit()
        },
      },
    ])

    tray.setToolTip("Eidos")
    tray.setContextMenu(contextMenu)

    electronLog.info("Tray created successfully")
  } catch (error) {
    electronLog.error("Error creating tray:", error)
  }
}

/**
 * Destroy tray icon
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
