import { isDesktopMode } from "../env"

export const isWindows = () =>
  navigator.userAgent.toLowerCase().indexOf("windows") > -1
export const isLinux = () =>
  navigator.userAgent.toLowerCase().indexOf("linux") > -1

export const isMac = () => navigator.userAgent.toLowerCase().indexOf("mac") > -1

// windows and linux has the same desktop mode
export const isWindowsDesktop = isDesktopMode && (isWindows() || isLinux())

export const isMacDesktop = () => isDesktopMode && isMac()
