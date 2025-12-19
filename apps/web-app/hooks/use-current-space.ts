// No longer need React hooks, get synchronously
import { isDesktopMode } from "@/lib/env"

export interface SpaceInfo {
  id: string
  name: string
  path: string
  sync?: {
    enabled: boolean
    remote: string
  }
}

/**
 * get space id from hostname
 * "my-workspace.eidos.localhost" -> "my-workspace"
 */
function extractSpaceIdFromHostname(hostname: string): string | null {
  // check if it's a subdomain of eidos.localhost
  if (hostname.endsWith(".eidos.localhost")) {
    const parts = hostname.split(".")
    if (parts.length >= 2) {
      return parts[0] // return first part as space id
    }
  }
  return null
}

/**
 * detect current space id
 */
function detectCurrentSpaceId(): string | null {
  if (typeof window === "undefined") {
    return null
  }

  const hostname = window.location.hostname
  const pathname = window.location.pathname

  // In desktop mode, extract space id from subdomain
  if (isDesktopMode) {
    return extractSpaceIdFromHostname(hostname)
  }

  // In web mode, extract space id from URL path (maintain backward compatibility)
  const pathParts = window.location.pathname.split("/").filter(Boolean)
  return pathParts[0] || null
}

/**
 * get current space info
 * simplify version, directly get basic info synchronously
 */
export const useCurrentSpace = () => {
  const spaceId = detectCurrentSpaceId()

  if (!spaceId) {
    return {
      currentSpace: null,
      isLoading: false,
      error: null,
      reload: () => {},
    }
  }

  // Return basic info directly, no async operation needed
  const currentSpace: SpaceInfo = {
    id: spaceId,
    name: spaceId.charAt(0).toUpperCase() + spaceId.slice(1),
    path: "",
  }

  return {
    currentSpace,
    isLoading: false,
    error: null,
    reload: () => {},
  }
}

export const useCurrentSpaceId = (): string | null => {
  // Direct synchronous detection, no useState and useEffect needed
  return detectCurrentSpaceId()
}
