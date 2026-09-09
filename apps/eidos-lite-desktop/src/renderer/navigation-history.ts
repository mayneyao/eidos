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

export interface RecordNavigationLocation {
  type: "record"
  path: string
  tableId: string
  rowId: string | null
  viewId?: string
}

export type NavigationLocation =
  | string
  | VersionDiffNavigationLocation
  | RecordNavigationLocation
  | { type: "file"; path: string; openWith: "source" | "wysiwyg" | "preview" }
  | { type: "whats-new"; lang?: "en" | "zh-CN" }
  | { type: "merge"; path: string; tableName?: string }
  | null

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
  previousHash?: string
}

const NAVIGATION_LENGTH_STORAGE_PREFIX = "eidos-lite:navigation-length:"
const navigationLengths = new Map<string, number>()
export const NAVIGATION_EVENT = "eidos-lite:navigation"

export function navigateCurrentWindow(
  location: NavigationLocation,
  replace = false
): void {
  const spaceId =
    navigationState(window.history.state)?.spaceId ??
    parseNavigationHash(window.location.hash)?.spaceId ??
    ""
  const current = readNavigationHistory(spaceId)
  if (replace) replaceNavigationLocation(current, spaceId, location)
  else pushNavigationLocation(current, spaceId, location)
  window.dispatchEvent(new Event(NAVIGATION_EVENT))
}

export function closeCurrentPage(): void {
  const spaceId = navigationState(window.history.state)?.spaceId ?? ""
  const current = readNavigationHistory(spaceId)
  if (canNavigateHistory(current, -1)) window.history.back()
  else navigateCurrentWindow(null, true)
}

export function closeRecordLocation(
  spaceId: string,
  location: RecordNavigationLocation
): void {
  const table = { ...location, rowId: null }
  const state = navigationState(window.history.state)
  if (state?.previousHash === navigationHash(spaceId, table) && state.index > 0)
    window.history.back()
  else navigateCurrentWindow(table, true)
}

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
  if (location === null) return spaceId ? `#/spaces/${space}` : "#/"
  if (typeof location === "string") {
    return `#/spaces/${space}/files/${encodeURIComponent(location)}`
  }
  if (location.type === "whats-new")
    return `#/whats-new${location.lang ? `?lang=${location.lang}` : ""}`
  if (location.type === "file")
    return `#/spaces/${space}/files/${encodeURIComponent(location.path)}?openWith=${location.openWith}`
  if (location.type === "merge")
    return `#/spaces/${space}/merge/files/${encodeURIComponent(location.path)}${location.tableName ? `?table=${encodeURIComponent(location.tableName)}` : ""}`
  if (location.type === "record") {
    const base = `#/spaces/${space}/files/${encodeURIComponent(location.path)}/tables/${encodeURIComponent(location.tableId)}`
    return `${base}${location.rowId !== null ? `/records/${encodeURIComponent(location.rowId)}` : ""}${location.viewId ? `?view=${encodeURIComponent(location.viewId)}` : ""}`
  }
  const route =
    location.mode === "changes"
      ? `#/spaces/${space}/changes/${encodeURIComponent(location.path)}`
      : `#/spaces/${space}/history/${encodeURIComponent(location.commitId)}/files/${encodeURIComponent(location.path)}`
  const params = new URLSearchParams()
  if (location.tableName) params.set("table", location.tableName)
  if (location.mode === "history") {
    if (location.commitParent) params.set("parent", location.commitParent)
    if (location.comparisonParent) {
      params.set("base", location.comparisonParent)
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
  const [pathname, query = ""] = hash.split("?")
  const params = new URLSearchParams(query)
  if (pathname === "#/" || pathname === "#" || pathname === "")
    return { spaceId: "", location: null }
  if (pathname === "#/whats-new") {
    const lang = params.get("lang")
    return {
      spaceId: "",
      location: {
        type: "whats-new",
        ...(lang === "en" || lang === "zh-CN" ? { lang } : {}),
      },
    }
  }
  try {
    const match = pathname.match(/^#\/spaces\/([^/]+)(?:\/(.*))?$/)
    if (match) {
      const spaceId = decodeURIComponent(match[1])
      if (!match[2]) return { spaceId, location: null }
      const parts = match[2].split("/").map(decodeURIComponent)
      if (parts[0] === "files" && parts[1]) {
        if (parts.length === 2) {
          const openWith = params.get("openWith")
          return {
            spaceId,
            location:
              openWith === "source" ||
              openWith === "wysiwyg" ||
              openWith === "preview"
                ? { type: "file", path: parts[1], openWith }
                : parts[1],
          }
        }
        if (
          parts[2] === "tables" &&
          parts[3] &&
          (parts.length === 4 ||
            (parts.length === 6 && parts[4] === "records" && parts[5]))
        ) {
          const viewId = params.get("view")
          return {
            spaceId,
            location: {
              type: "record",
              path: parts[1],
              tableId: parts[3],
              rowId: parts[5] ?? null,
              ...(viewId ? { viewId } : {}),
            },
          }
        }
      }
      if (parts[0] === "changes" && parts.length === 2 && parts[1])
        return {
          spaceId,
          location: {
            type: "version-diff",
            mode: "changes",
            path: parts[1],
            ...(params.get("table") ? { tableName: params.get("table")! } : {}),
          },
        }
      if (
        parts[0] === "history" &&
        parts[1] &&
        parts[2] === "files" &&
        parts[3] &&
        parts.length === 4
      )
        return {
          spaceId,
          location: {
            type: "version-diff",
            mode: "history",
            path: parts[3],
            commitId: parts[1],
            commitParent: params.get("parent"),
            comparisonParent: params.get("base"),
            ...(params.getAll("mergeParent").length
              ? { commitParents: params.getAll("mergeParent") }
              : {}),
            ...(params.get("table") ? { tableName: params.get("table")! } : {}),
          },
        }
      if (parts[0] === "merge" && parts[1] === "files" && parts.length === 3)
        return {
          spaceId,
          location: {
            type: "merge",
            path: parts[2],
            ...(params.get("table") ? { tableName: params.get("table")! } : {}),
          },
        }
      return null
    }
  } catch {
    return null
  }
  const diffMatch = hash.match(
    /^#\/space\/([^/]+)\/diff\/(changes|history)\/([^?]+)(?:\?(.*))?$/
  )
  try {
    const recordMatch = hash.match(/^#\/space\/([^/]+)\/record\/([^?]+)\?(.*)$/)
    if (recordMatch) {
      const params = new URLSearchParams(recordMatch[3])
      const tableId = params.get("table")
      if (!tableId) return null
      return {
        spaceId: decodeURIComponent(recordMatch[1]),
        location: {
          type: "record",
          path: decodeURIComponent(recordMatch[2]),
          tableId,
          rowId: params.get("row"),
        },
      }
    }
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
  if (
    state?.spaceId === spaceId &&
    (route?.spaceId === spaceId ||
      (route?.location &&
        typeof route.location === "object" &&
        route.location.type === "whats-new"))
  ) {
    const length = storedNavigationLength(state.stackId, state.index + 1)
    window.history.replaceState(
      state,
      "",
      navigationHash(spaceId, route.location)
    )
    return {
      stackId: state.stackId,
      index: state.index,
      length,
      location: route.location,
    }
  }

  const stackId = createStackId()
  const location =
    route?.spaceId === spaceId ||
    (route?.location &&
      typeof route.location === "object" &&
      route.location.type === "whats-new")
      ? route.location
      : null
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
  if (
    !state ||
    state.spaceId !== spaceId ||
    !route ||
    (route.spaceId !== spaceId &&
      !(
        typeof route.location === "object" &&
        route.location?.type === "whats-new"
      ))
  ) {
    return initializeNavigationHistory(spaceId)
  }
  const length = storedNavigationLength(state.stackId, state.index + 1)
  window.history.replaceState(
    state,
    "",
    navigationHash(spaceId, route.location)
  )
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
    previousHash: navigationHash(spaceId, snapshot.location),
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
    previousHash: navigationState(window.history.state)?.previousHash,
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
