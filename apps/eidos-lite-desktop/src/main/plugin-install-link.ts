import type { App } from "electron"

const PLUGIN_ID = /^[a-z][a-z0-9.-]{1,127}$/

/** NSIS does not register electron-builder's `protocols` metadata on Windows. */
export function registerWindowsPluginInstallProtocol(
  app: Pick<App, "isPackaged" | "setAsDefaultProtocolClient">,
  platform: NodeJS.Platform = process.platform
): boolean | null {
  // Never associate browser links with a generic Electron development binary.
  if (platform !== "win32" || !app.isPackaged) return null
  return app.setAsDefaultProtocolClient("eidos-lite")
}

export function pluginInstallIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value)
    if (
      url.protocol !== "eidos-lite:" ||
      url.hostname !== "plugins" ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null
    }
    const match = /^\/install\/([^/]+)$/.exec(url.pathname)
    return match && PLUGIN_ID.test(match[1]) ? match[1] : null
  } catch {
    return null
  }
}

export function pluginInstallIdsFromArguments(
  arguments_: readonly string[]
): string[] {
  const ids = arguments_
    .map(pluginInstallIdFromUrl)
    .filter((id): id is string => id !== null)
  return [...new Set(ids)]
}
