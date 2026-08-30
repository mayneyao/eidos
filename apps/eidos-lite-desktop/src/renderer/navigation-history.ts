export type VersionDiffNavigationLocation =
  | {
      type: "version-diff"
      mode: "changes"
      path: string
      tableName?: string
    }
  | {
      type: "version-diff"
      mode: "history"
      path: string
      tableName?: string
      commitId: string
      commitParent: string | null
      comparisonParent: string | null
      commitParents?: string[]
    }

export type NavigationLocation = string | VersionDiffNavigationLocation | null

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
  if (location === null) return `#/space/${space}`
  if (typeof location === "string") {
    return `#/space/${space}/file/${encodeURIComponent(location)}`
  }

  const route = `#/space/${space}/diff/${location.mode}/${encodeURIComponent(location.path)}`
  const params = new URLSearchParams()
  if (location.tableName) params.set("table", location.tableName)
  if (location.mode === "history") {
    params.set("commit", location.commitId)
    if (location.commitParent) params.set("parent", location.commitParent)
    if (location.comparisonParent) {
      params.set("compare", location.comparisonParent)
    }
    for (const parent of location.commitParents ?? []) {
      params.append("mergeParent", parent)
    }
  }
  const query = params.toString()
  return query ? `${route}?${query}` : route
}

export function parseNavigationHash(
  hash: string
): { spaceId: string; location: NavigationLocation } | null {
  const diffMatch = hash.match(
    /^#\/space\/([^/]+)\/diff\/(changes|history)\/([^?]+)(?:\?(.*))?$/
  )
  try {
    if (diffMatch) {
      const spaceId = decodeURIComponent(diffMatch[1])
      const mode = diffMatch[2] as "changes" | "history"
      const path = decodeURIComponent(diffMatch[3])
      const params = new URLSearchParams(diffMatch[4] ?? "")
      const tableName = params.get("table") || undefined
      if (mode === "changes") {
        return {
          spaceId,
          location: {
            type: "version-diff",
            mode,
            path,
            ...(tableName ? { tableName } : {}),
          },
        }
      }
      const commitId = params.get("commit")
      if (!commitId) return null
      const commitParents = params.getAll("mergeParent")
      return {
        spaceId,
        location: {
          type: "version-diff",
          mode,
          path,
          ...(tableName ? { tableName } : {}),
          commitId,
          commitParent: params.get("parent"),
          comparisonParent: params.get("compare"),
          ...(commitParents.length ? { commitParents } : {}),
        },
      }
    }

    const fileMatch = hash.match(/^#\/space\/([^/]+)(?:\/file\/(.+))?$/)
    if (!fileMatch) return null
    return {
      spaceId: decodeURIComponent(fileMatch[1]),
      location: fileMatch[2] ? decodeURIComponent(fileMatch[2]) : null,
    }
  } catch {
    return null
  }
}

export function isVersionDiffNavigationLocation(
  location: NavigationLocation
): location is VersionDiffNavigationLocation {
  return typeof location === "object" && location?.type === "version-diff"
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
  if (
    navigationHash(spaceId, snapshot.location) ===
    navigationHash(spaceId, location)
  ) {
    return snapshot
  }
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

export function pathMatchesPrefix(
  relativePath: NavigationLocation,
  sourcePath: string
): relativePath is string {
  return (
    typeof relativePath === "string" &&
    (relativePath === sourcePath || relativePath.startsWith(`${sourcePath}/`))
  )
}
