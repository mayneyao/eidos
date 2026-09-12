import type { BrowserWindow } from "electron"

import type { EidosLiteResolvedAppearance } from "../shared/appearance"

export type LiteWindowKind = "welcome" | "space" | "settings"
export type LiteCompactWindowKind = Exclude<LiteWindowKind, "space">

export interface LiteWindowSize {
  width: number
  height: number
}

export interface LiteWindowControlsOverlay {
  color: string
  symbolColor: string
  height: number
}

export interface LiteWindowChromeOptions {
  titleBarStyle: "default" | "hidden" | "hiddenInset"
  autoHideMenuBar: boolean
  titleBarOverlay?: boolean | LiteWindowControlsOverlay
}

const WINDOW_CONTROLS_OVERLAY_HEIGHT = 40
const WINDOW_CONTROLS_OVERLAY_BACKGROUND = "#00000000"

// The Windows overlay background stays transparent so the app titlebar shows
// through. The caption glyphs must still contrast with it, so match the ink
// color of the active theme instead of relying on the system default.
const WINDOW_CONTROLS_SYMBOL_COLOR = {
  light: "#2b3135",
  dark: "#e6e8ea",
} satisfies Record<EidosLiteResolvedAppearance, string>

const COMPACT_WINDOW_DEFAULT_SIZE = {
  welcome: { width: 920, height: 620 },
  settings: { width: 960, height: 680 },
} satisfies Record<LiteCompactWindowKind, LiteWindowSize>

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

export function liteCompactWindowDefaultSize(
  kind: LiteCompactWindowKind
): LiteWindowSize {
  return { ...COMPACT_WINDOW_DEFAULT_SIZE[kind] }
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
  if (platform === "win32") {
    return {
      titleBarStyle: "hidden",
      autoHideMenuBar: true,
      titleBarOverlay: windowsTitleBarOverlay("light"),
    }
  }
  if (platform === "linux") {
    return {
      titleBarStyle: "hidden",
      autoHideMenuBar: true,
      titleBarOverlay: true,
    }
  }
  return {
    titleBarStyle: "default",
    autoHideMenuBar: false,
  }
}

export function windowsTitleBarOverlay(
  appearance: EidosLiteResolvedAppearance
): LiteWindowControlsOverlay {
  return {
    color: WINDOW_CONTROLS_OVERLAY_BACKGROUND,
    symbolColor: WINDOW_CONTROLS_SYMBOL_COLOR[appearance],
    height: WINDOW_CONTROLS_OVERLAY_HEIGHT,
  }
}

export function applyWindowsTitleBarOverlay(
  window: Pick<BrowserWindow, "setTitleBarOverlay">,
  appearance: EidosLiteResolvedAppearance,
  platform: NodeJS.Platform = process.platform
): void {
  if (platform !== "win32") return
  window.setTitleBarOverlay(windowsTitleBarOverlay(appearance))
}

export function applyMacosTrafficLightPosition(
  window: Pick<BrowserWindow, "setWindowButtonPosition">,
  kind: LiteWindowKind,
  platform: NodeJS.Platform = process.platform
): void {
  if (platform !== "darwin") return
  window.setWindowButtonPosition(macosTrafficLightPosition(kind))
}
