import type { BrowserWindow } from "electron"

export type LiteWindowKind = "welcome" | "space" | "settings"

export interface LiteWindowChromeOptions {
  titleBarStyle: "default" | "hidden" | "hiddenInset"
  autoHideMenuBar: boolean
  titleBarOverlay?: {
    color: string
    height: number
  }
}

const WINDOW_CONTROLS_OVERLAY_HEIGHT = 40

const MACOS_TRAFFIC_LIGHT_POSITION = {
  welcome: { x: 16, y: 15 },
  space: { x: 16, y: 12 },
  settings: { x: 16, y: 15 },
} satisfies Record<LiteWindowKind, { x: number; y: number }>

export function macosTrafficLightPosition(kind: LiteWindowKind): {
  x: number
  y: number
} {
  return MACOS_TRAFFIC_LIGHT_POSITION[kind]
}

export function liteWindowChromeOptions(
  platform: NodeJS.Platform = process.platform
): LiteWindowChromeOptions {
  if (platform === "darwin") {
    return {
      titleBarStyle: "hiddenInset",
      autoHideMenuBar: false,
    }
  }
  if (platform === "win32" || platform === "linux") {
    return {
      titleBarStyle: "hidden",
      autoHideMenuBar: true,
      titleBarOverlay: {
        color: "#00000000",
        height: WINDOW_CONTROLS_OVERLAY_HEIGHT,
      },
    }
  }
  return {
    titleBarStyle: "default",
    autoHideMenuBar: false,
  }
}

export function applyMacosTrafficLightPosition(
  window: Pick<BrowserWindow, "setWindowButtonPosition">,
  kind: LiteWindowKind,
  platform: NodeJS.Platform = process.platform
): void {
  if (platform !== "darwin") return
  window.setWindowButtonPosition(macosTrafficLightPosition(kind))
}
