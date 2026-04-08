import { useCallback, useEffect, useState } from "react"
import { create } from "zustand"

import { isDesktopMode } from "@/lib/env"
import type { RelayChannel, RelayConfig } from "@eidos.space/space-manager"

export type { RelayChannel, RelayConfig }

export interface SpaceInfo {
  id: string
  name: string
  path: string
  sync?: {
    enabled: boolean
    remote: string
    provider?: string
  }
  relay?: RelayConfig
}

interface SpaceState {
  spaceInfo: SpaceInfo | null
  isLoading: boolean
  error: Error | null
  lastFetched: Date | null
  setSpaceInfo: (info: SpaceInfo | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: Error | null) => void
  setLastFetched: (date: Date | null) => void
}

export const useSpaceStore = create<SpaceState>((set) => ({
  spaceInfo: null,
  isLoading: false,
  error: null,
  lastFetched: null,
  setSpaceInfo: (spaceInfo) => set({ spaceInfo }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setLastFetched: (lastFetched) => set({ lastFetched }),
}))

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
export function detectCurrentSpaceId(): string | null {
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
 * get current space info from eidos with zustand global storage
 */
export const useCurrentSpace = () => {
  const spaceId = detectCurrentSpaceId()
  const {
    spaceInfo,
    isLoading,
    error,
    lastFetched,
    setSpaceInfo,
    setLoading,
    setError,
    setLastFetched,
  } = useSpaceStore()

  const fetchSpaceInfo = useCallback(async () => {
    if (!spaceId) {
      setSpaceInfo(null)
      setLoading(false)
      setError(null)
      return
    }

    // Check if we have recent data (within 30 seconds)
    if (lastFetched && Date.now() - lastFetched.getTime() < 30000) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      if (isDesktopMode && typeof window !== "undefined" && window.eidos) {
        const info = await window.eidos.spaceMgmt.getCurrentSpace()
        setSpaceInfo(info || null)
        setLastFetched(new Date())
      } else {
        // Fallback for web mode or when eidos is not available
        const fallbackInfo: SpaceInfo = {
          id: spaceId,
          name: spaceId.charAt(0).toUpperCase() + spaceId.slice(1),
          path: "",
        }
        setSpaceInfo(fallbackInfo)
        setLastFetched(new Date())
      }
    } catch (err) {
      console.error("Error fetching space info:", err)
      setError(
        err instanceof Error ? err : new Error("Failed to fetch space info")
      )
      setSpaceInfo(null)
    } finally {
      setLoading(false)
    }
  }, [spaceId, lastFetched, setSpaceInfo, setLoading, setError, setLastFetched])

  const reload = useCallback(() => {
    setLastFetched(null) // Force refetch
    fetchSpaceInfo()
  }, [fetchSpaceInfo, setLastFetched])

  useEffect(() => {
    fetchSpaceInfo()
  }, [fetchSpaceInfo])

  return {
    currentSpace: spaceInfo,
    isLoading,
    error,
    reload,
  }
}

export const useCurrentSpaceId = (): string | null => {
  // Direct synchronous detection, no useState and useEffect needed
  return detectCurrentSpaceId()
}
