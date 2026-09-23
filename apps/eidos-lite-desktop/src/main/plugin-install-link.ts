const PLUGIN_ID = /^[a-z][a-z0-9.-]{1,127}$/

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
