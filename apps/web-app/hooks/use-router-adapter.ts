import { useCallback, useEffect, useMemo, useRef } from "react"
import {
  useInRouterContext,
  useLocation as useRouterLocation,
  useNavigate as useRouterNavigate,
  useParams as useRouterParams,
  useSearchParams as useRouterSearchParams,
} from "react-router-dom"

import { useTabStore } from "@/apps/web-app/store/tabs"
import { useSqliteKV } from "@/apps/web-app/hooks/use-sqlite-kv"

export const useRouterAdapter = () => {
  const inRouter = useInRouterContext()

  // Hooks that might throw if not in router
  const location = inRouter ? useRouterLocation() : null
  const navigate = inRouter ? useRouterNavigate() : null
  const params = inRouter ? useRouterParams() : null
  const [searchParams, setSearchParams] = inRouter
    ? useRouterSearchParams()
    : [null, null]

  // Space settings for tabs
  const [alwaysOpenInNewTab] = useSqliteKV<boolean>(
    "eidos:space:settings:alwaysOpenInNewTab",
    false
  )

  const [reuseExistingTab] = useSqliteKV<boolean>(
    "eidos:space:settings:reuseExistingTab",
    true
  )

  // Tab store state
  const getActiveTabId = useTabStore((state) => state.getActiveTabId)
  const tabs = useTabStore((state) => state.tabs)
  const updateTab = useTabStore((state) => state.updateTab)

  const activeTabId = getActiveTabId()
  const activeTab = tabs.find((t) => t.id === activeTabId)

  // Adapter implementations
  const adapterLocation = useMemo(() => {
    if (inRouter && location) return location

    if (activeTab) {
      try {
        const url = new URL(activeTab.url, window.location.origin)
        return {
          pathname: url.pathname,
          search: url.search,
          hash: url.hash,
          state: null,
          key: "default",
        }
      } catch (e) {
        return {
          pathname: "/",
          search: "",
          hash: "",
          state: null,
          key: "default",
        }
      }
    }

    return {
      pathname: "/",
      search: "",
      hash: "",
      state: null,
      key: "default",
    }
  }, [inRouter, location, activeTab])

  // Keep a stable ref so fallback navigate doesn't change identity
  const adapterLocationRef = useRef(adapterLocation)
  useEffect(() => {
    adapterLocationRef.current = adapterLocation
  }, [adapterLocation])

  const adapterNavigate = useCallback(
    (
      to: string | number,
      options?: { replace?: boolean; target?: "_blank" | "_self"; state?: any }
    ) => {
      const resolveUrl = (rawTo: string) => {
        let newUrl = rawTo
        const currentLocation = adapterLocationRef.current

        // Check if it's an external URL (http:// or https://)
        if (/^https?:\/\//i.test(newUrl)) {
          return newUrl
        }

        // Check if it's a domain-like string (e.g., google.com, example.co.uk)
        // Domain pattern: something.something with valid TLD
        if (
          /^[a-z0-9]+([\-.]{1}[a-z0-9]+)*\.[a-z]{2,}(:[0-9]{1,5})?(\/.*)?$/i.test(
            newUrl
          )
        ) {
          return `https://${newUrl}`
        }

        if (!newUrl.startsWith("/")) {
          // Simple relative path handling
          const currentPath = currentLocation.pathname
          if (currentPath.endsWith("/")) {
            newUrl = currentPath + newUrl
          } else {
            newUrl = currentPath + "/" + newUrl
          }
        }
        return newUrl
      }

      if (typeof to === "number") {
        // Prefer router history when available
        if (inRouter && navigate) {
          navigate(to as any, options)
          return
        }
        const { goInTabHistory } = useTabStore.getState()
        const storeActiveTabId = useTabStore.getState().getActiveTabId()
        if (storeActiveTabId) {
          goInTabHistory(storeActiveTabId, to)
        }
        return
      }

      // CRITICAL: If alwaysOpenInNewTab is true, we MUST force a new tab
      const forceNewTab =
        options?.target === "_blank" || alwaysOpenInNewTab === true

      const replaceCurrentTab = options?.replace === true && !forceNewTab

      const resolvedUrl = resolveUrl(to)
      const currentUrl = adapterLocation
        ? adapterLocation.pathname +
          adapterLocation.search +
          adapterLocation.hash
        : ""

      // Normalize URLs for comparison to prevent recursion on effectively identical paths
      const normalize = (u: string) => {
        try {
          const url = new URL(u, window.location.origin)
          return url.pathname.replace(/\/$/, "") + url.search + url.hash
        } catch {
          return u.replace(/\/$/, "")
        }
      }

      const normalizedResolved = normalize(resolvedUrl)
      const normalizedCurrent = normalize(currentUrl)
      const isHome = normalizedCurrent === "" || normalizedCurrent === "/"

      // 0. Prevent recursion: If we are already in a "force new tab" flow, don't intercept again
      const isInternal =
        options?.state?.__isInternalTabNavigation ||
        (adapterLocation as any)?.state?.__isInternalTabNavigation

      // 1. Break recursion/Self-navigation/Home-replacement:
      // If we are already at the target URL, it's internal, or we are replacing the Home page, let it through
      if (
        isInternal ||
        (alwaysOpenInNewTab && normalizedResolved === normalizedCurrent) ||
        (isHome && options?.replace)
      ) {
        if (inRouter && navigate) {
          navigate(to as any, options)
        }
        return
      }

      // Debug logging
      if (import.meta.env.DEV) {
        console.log("[RouterAdapter] Navigating:", {
          to,
          resolvedUrl,
          forceNewTab,
          replaceCurrentTab,
        })
      }

      // --- NEW: Global Reuse Check ---
      // We check for existing tabs BEFORE deciding to open new or replace.
      // This ensures that settings pages always reuse their singleton tab,
      // and documents reuse their tabs if reuseExistingTab is enabled.
      const {
        tabs,
        setActiveTab: setActiveTabAction,
        openTab: openTabAction,
        updateTab,
        getActiveTabId: getStoreActiveTabId,
        setNextNavigationOptions,
      } = useTabStore.getState()

      const isSettings = normalizedResolved.startsWith("/settings")

      if (reuseExistingTab || isSettings) {
        const existingTab = tabs.find((t) => {
          if (normalize(t.url) === normalizedResolved) return true
          if (isSettings) {
            try {
              return new URL(t.url, window.location.origin).pathname.startsWith(
                "/settings"
              )
            } catch {
              return false
            }
          }
          return false
        })

        if (existingTab) {
          if (import.meta.env.DEV) {
            console.log("[RouterAdapter] Reusing existing tab:", existingTab.id)
          }
          // If it's a settings tab but different sub-page, update the URL
          if (existingTab.url !== resolvedUrl) {
            updateTab(existingTab.id, { url: resolvedUrl })
          }
          setActiveTabAction(existingTab.id)
          return
        }
      }
      // --- END Global Reuse Check ---

      if (forceNewTab) {
        // 2. Open New Tab (since reuse check failed)
        openTabAction(resolvedUrl, undefined, {
          forceNewTab: true,
          state: { ...options?.state, __isInternalTabNavigation: true },
        })
        return
      }

      // Only allow React Router navigation if NOT forcing a new tab
      if (inRouter && navigate && !forceNewTab) {
        if (typeof to === "string" && /^https?:\/\//i.test(to)) {
          // Fall through
        } else {
          navigate(to as any, options)
          return
        }
      }

      const storeActiveTabId = getStoreActiveTabId()

      const targetId = storeActiveTabId || tabs[0]?.id

      if (!targetId) {
        openTabAction(resolvedUrl, undefined, {
          state: { __isInternalTabNavigation: true },
        })
        return
      }

      if (replaceCurrentTab) {
        setNextNavigationOptions(targetId, { replace: true })
      }

      if (import.meta.env.DEV) {
        console.log("[RouterAdapter] Replacing current tab with new node")
      }
      updateTab(targetId, { url: resolvedUrl })
      setActiveTabAction(targetId)
    },
    [inRouter, navigate, alwaysOpenInNewTab, reuseExistingTab]
  )

  const adapterParams = useMemo(() => {
    if (inRouter && params) return params

    // Manual param parsing for route patterns (no more :database prefix)
    const path = adapterLocation.pathname
    const parts = path.split("/").filter(Boolean)
    const result: Record<string, string> = {}

    // Handle different route patterns without database prefix
    if (parts.length >= 1) {
      if (parts[0] === "file-handler") {
        // /file-handler - no additional params
      } else if (parts[0] === "folder") {
        // /folder - no additional params
      } else if (parts[0] === "blocks" && parts.length >= 2) {
        // /blocks/:blockId
        result.blockId = parts[1]
      } else if (parts[0] === "extensions" && parts.length >= 2) {
        // /extensions/:scriptId
        result.scriptId = parts[1]
      } else if (parts[0] === "journals" && parts.length >= 2) {
        // /journals/:day
        result.day = parts[1]
      } else if (parts[0] === "agent") {
        // /agent/:sessionId?
        if (parts.length >= 2) {
          result.sessionId = parts[1]
        }
      } else {
        // /:table (node page) - first part is the table/node ID
        result.table = parts[0]
      }
    }

    return result
  }, [inRouter, params, adapterLocation])

  const adapterSearchParams = useMemo(() => {
    if (inRouter && searchParams) return searchParams

    // Parse search params from location
    const search = adapterLocation.search
    return new URLSearchParams(search)
  }, [inRouter, searchParams, adapterLocation.search])

  const adapterSetSearchParams = useMemo(() => {
    if (inRouter && setSearchParams) return setSearchParams

    // Return a fallback setSearchParams function with tab support
    return (
      nextInit:
        | URLSearchParams
        | Record<string, string>
        | ((prev: URLSearchParams) => URLSearchParams | Record<string, string>)
    ) => {
      if (!activeTabId) {
        console.warn("Cannot set search params: no active tab")
        return
      }

      // Compute the new search params
      let newSearchParams: URLSearchParams
      if (typeof nextInit === "function") {
        const prev = new URLSearchParams(adapterLocation.search)
        const result = nextInit(prev)
        newSearchParams =
          result instanceof URLSearchParams
            ? result
            : new URLSearchParams(result)
      } else if (nextInit instanceof URLSearchParams) {
        newSearchParams = nextInit
      } else {
        newSearchParams = new URLSearchParams(nextInit)
      }

      // Update the active tab's URL with new search params
      const currentUrl = new URL(activeTab?.url || "/", window.location.origin)
      currentUrl.search = newSearchParams.toString()

      updateTab(activeTabId, {
        url: currentUrl.pathname + currentUrl.search + currentUrl.hash,
      })
    }
  }, [
    inRouter,
    setSearchParams,
    activeTabId,
    activeTab,
    adapterLocation.search,
    updateTab,
  ])

  return {
    location: adapterLocation,
    navigate: adapterNavigate as (
      to: string | number,
      options?: { replace?: boolean; target?: "_blank" | "_self"; state?: any }
    ) => void,
    params: adapterParams as Record<string, string>,
    searchParams: adapterSearchParams,
    setSearchParams: adapterSetSearchParams as (
      nextInit:
        | URLSearchParams
        | Record<string, string>
        | ((prev: URLSearchParams) => URLSearchParams | Record<string, string>)
    ) => void,
    inRouter,
    alwaysOpenInNewTab,
    reuseExistingTab,
  }
}
