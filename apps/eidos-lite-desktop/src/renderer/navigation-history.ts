export type NavigationLocation = string | null

export interface NavigationHistory {
  entries: NavigationLocation[]
  index: number
}

const NAVIGATION_HISTORY_LIMIT = 50

export function createNavigationHistory(): NavigationHistory {
  return { entries: [null], index: 0 }
}

export function pushNavigationLocation(
  history: NavigationHistory,
  location: NavigationLocation
): NavigationHistory {
  if (history.entries[history.index] === location) return history
  const entries = [
    ...history.entries.slice(0, history.index + 1),
    location,
  ].slice(-NAVIGATION_HISTORY_LIMIT)
  return { entries, index: entries.length - 1 }
}

export function navigationAtOffset(
  history: NavigationHistory,
  offset: -1 | 1
): { index: number; location: NavigationLocation } | null {
  const index = history.index + offset
  if (index < 0 || index >= history.entries.length) return null
  return { index, location: history.entries[index] ?? null }
}

export function replaceNavigationPathPrefix(
  history: NavigationHistory,
  sourcePath: string,
  destinationPath: string
): NavigationHistory {
  const entries = history.entries.map((location) =>
    remapRelativePath(location, sourcePath, destinationPath)
  )
  return entries.every((entry, index) => entry === history.entries[index])
    ? history
    : { entries, index: history.index }
}

export function removeNavigationPathPrefix(
  history: NavigationHistory,
  sourcePath: string
): NavigationHistory {
  const entries = history.entries.filter(
    (location) => !pathMatchesPrefix(location, sourcePath)
  )
  if (entries.length === 0) return createNavigationHistory()
  const removedThroughCurrent = history.entries
    .slice(0, history.index + 1)
    .filter((location) => pathMatchesPrefix(location, sourcePath)).length
  return {
    entries,
    index: Math.min(
      entries.length - 1,
      Math.max(0, history.index - removedThroughCurrent)
    ),
  }
}

export function remapRelativePath(
  relativePath: NavigationLocation,
  sourcePath: string,
  destinationPath: string
): NavigationLocation {
  if (!pathMatchesPrefix(relativePath, sourcePath)) return relativePath
  if (relativePath === sourcePath) return destinationPath
  return `${destinationPath}${relativePath.slice(sourcePath.length)}`
}

export function pathMatchesPrefix(
  relativePath: NavigationLocation,
  sourcePath: string
): relativePath is string {
  return (
    relativePath !== null &&
    (relativePath === sourcePath || relativePath.startsWith(`${sourcePath}/`))
  )
}
