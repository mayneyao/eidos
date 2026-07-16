export const FILE_SPACE_FILE_ROUTE = "space-file"
export const FILE_SPACE_EXTENSION_PANEL_ROUTE = "extension-panel"
export const FILE_SPACE_SETTINGS_ROUTE = "settings/:section?"
export const FILE_SPACE_VERSION_HISTORY_ROUTE = "version/history"
export const FILE_SPACE_VERSION_DIFF_ROUTE = "version/diff"
export const FILE_SPACE_VERSION_CONFLICTS_ROUTE = "version/conflicts"

export function isAllowedFileSpaceUrl(url: string): boolean {
  if (/^https?:\/\//i.test(url)) return true
  try {
    const { pathname } = new URL(url, "https://eidos.local")
    return (
      pathname === "/" ||
      pathname === `/${FILE_SPACE_FILE_ROUTE}` ||
      pathname === `/${FILE_SPACE_EXTENSION_PANEL_ROUTE}` ||
      pathname === `/${FILE_SPACE_VERSION_HISTORY_ROUTE}` ||
      pathname === `/${FILE_SPACE_VERSION_DIFF_ROUTE}` ||
      pathname === `/${FILE_SPACE_VERSION_CONFLICTS_ROUTE}` ||
      /^\/settings(?:\/[^/]+)?$/.test(pathname)
    )
  } catch {
    return false
  }
}
