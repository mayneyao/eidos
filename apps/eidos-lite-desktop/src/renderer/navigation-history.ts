export type NavigationLocation = string | null

export interface NavigationSnapshot {
  stackId: string
  index: number
  length: number
  location: NavigationLocation
}

interface NavigationState {
  namespace: "eidos-lite"
  stackId: string
  spaceId: string
  index: number
}

const NAVIGATION_LENGTH_STORAGE_PREFIX = "eidos-lite:navigation-length:"
const navigationLengths = new Map<string, number>()

function createStackId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function navigationState(value: unknown): NavigationState | null {
  if (!value || typeof value !== "object") return null
  const candidate = value as Partial<NavigationState>
  return candidate.namespace === "eidos-lite" &&
    typeof candidate.stackId === "string" &&
    typeof candidate.spaceId === "string" &&
    Number.isInteger(candidate.index) &&
    Number(candidate.index) >= 0
    ? (candidate as NavigationState)
    : null
}

function storedNavigationLength(stackId: string, minimum: number): number {
  const inMemory = navigationLengths.get(stackId) ?? minimum
  try {
    const value = Number.parseInt(
      window.sessionStorage.getItem(
        `${NAVIGATION_LENGTH_STORAGE_PREFIX}${stackId}`
      ) ?? "",
      10
    )
    return Number.isFinite(value)
      ? Math.max(minimum, inMemory, value)
      : Math.max(minimum, inMemory)
  } catch {
    return Math.max(minimum, inMemory)
  }
}

function storeNavigationLength(stackId: string, length: number): void {
  navigationLengths.set(stackId, length)
  try {
    window.sessionStorage.setItem(
      `${NAVIGATION_LENGTH_STORAGE_PREFIX}${stackId}`,
      String(length)
    )
  } catch {
    // Navigation still works when session storage is unavailable.
  }
}

export function navigationHash(
  spaceId: string,
  location: NavigationLocation
): string {
  const space = encodeURIComponent(spaceId)
  return location === null
    ? `#/space/${space}`
    : `#/space/${space}/file/${encodeURIComponent(location)}`
}

export function parseNavigationHash(
  hash: string
): { spaceId: string; location: NavigationLocation } | null {
  const match = hash.match(/^#\/space\/([^/]+)(?:\/file\/(.+))?$/)
  if (!match) return null
  try {
    return {
      spaceId: decodeURIComponent(match[1]),
      location: match[2] ? decodeURIComponent(match[2]) : null,
    }
  } catch {
    return null
  }
}

export function initializeNavigationHistory(
  spaceId: string
): NavigationSnapshot {
  const state = navigationState(window.history.state)
  const route = parseNavigationHash(window.location.hash)
  if (state?.spaceId === spaceId && route?.spaceId === spaceId) {
    const length = storedNavigationLength(state.stackId, state.index + 1)
    return {
      stackId: state.stackId,
      index: state.index,
      length,
      location: route.location,
    }
  }

  const stackId = createStackId()
  const location = route?.spaceId === spaceId ? route.location : null
  const nextState: NavigationState = {
    namespace: "eidos-lite",
    stackId,
    spaceId,
    index: 0,
  }
  window.history.replaceState(nextState, "", navigationHash(spaceId, location))
  storeNavigationLength(stackId, 1)
  return { stackId, index: 0, length: 1, location }
}

export function readNavigationHistory(spaceId: string): NavigationSnapshot {
  const state = navigationState(window.history.state)
  const route = parseNavigationHash(window.location.hash)
  if (!state || state.spaceId !== spaceId || route?.spaceId !== spaceId) {
    return initializeNavigationHistory(spaceId)
  }
  const length = storedNavigationLength(state.stackId, state.index + 1)
  return {
    stackId: state.stackId,
    index: state.index,
    length,
    location: route.location,
  }
}

export function pushNavigationLocation(
  snapshot: NavigationSnapshot,
  spaceId: string,
  location: NavigationLocation
): NavigationSnapshot {
  if (snapshot.location === location) return snapshot
  const index = snapshot.index + 1
  const length = index + 1
  const state: NavigationState = {
    namespace: "eidos-lite",
    stackId: snapshot.stackId,
    spaceId,
    index,
  }
  window.history.pushState(state, "", navigationHash(spaceId, location))
  storeNavigationLength(snapshot.stackId, length)
  return { stackId: snapshot.stackId, index, length, location }
}

export function replaceNavigationLocation(
  snapshot: NavigationSnapshot,
  spaceId: string,
  location: NavigationLocation
): NavigationSnapshot {
  const state: NavigationState = {
    namespace: "eidos-lite",
    stackId: snapshot.stackId,
    spaceId,
    index: snapshot.index,
  }
  window.history.replaceState(state, "", navigationHash(spaceId, location))
  return { ...snapshot, location }
}

export function canNavigateHistory(
  snapshot: NavigationSnapshot | null,
  offset: -1 | 1
): boolean {
  if (!snapshot) return false
  const index = snapshot.index + offset
  return index >= 0 && index < snapshot.length
}

export function navigationOffsetForPointerButton(
  button: number
): -1 | 1 | null {
  if (button === 3) return -1
  if (button === 4) return 1
  return null
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
