import { useCallback, useEffect, useMemo, useRef } from "react"
import {
  useInRouterContext,
  useLocation as useRouterLocation,
  useNavigate as useRouterNavigate,
  useParams as useRouterParams,
  useSearchParams as useRouterSearchParams,
} from "react-router-dom"

import { useTabStore } from "@/apps/web-app/store/tabs"
import { useOptionalTabContext } from "@/apps/web-app/components/tab-manager/tab-context"
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

  const alwaysOpenInNewTabRef = useRef(alwaysOpenInNewTab)
  alwaysOpenInNewTabRef.current = alwaysOpenInNewTab

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

  const tabContext = useOptionalTabContext()
  const tabId = tabContext?.tabId
  const inTabRouter = Boolean(tabId)

  // Adapter implementations
  const adapterLocation = useMemo(() => {
    if (inTabRouter && inRouter && location) return location

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

    if (inRouter && location) return location

    return {
      pathname: "/",
      search: "",
      hash: "",
      state: null,
      key: "default",
    }
  }, [inTabRouter, inRouter, location, activeTab])

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
        // Prefer the tab's own router history when available.
        if (inTabRouter && inRouter && navigate) {
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
      // Use ref to avoid stale closure on async-loaded KV value
      const forceNewTab =
        options?.target === "_blank" || alwaysOpenInNewTabRef.current === true

      const replaceCurrentTab = options?.replace === true && !forceNewTab

      const resolvedUrl = resolveUrl(to)
      // Use the ref for the most up-to-date current location to avoid stale closure issues
      const currentLocation = adapterLocationRef.current
      const currentUrl =
        currentLocation.pathname + currentLocation.search + currentLocation.hash

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

      // Check if this is a "Self-Redirect" (e.g. /agent -> /agent/uuid)
      // We should allow this to happen in the current tab even if forceNewTab is true
      const isInitialRedirect =
        inTabRouter &&
        options?.replace &&
        normalizedResolved.startsWith(normalizedCurrent) &&
        normalizedCurrent.length > 1

      // 0. Prevent recursion: If this navigation itself was triggered by
      // a forceNewTab flow (caller explicitly marked it), don't intercept.
      // We do NOT check currentLocation.state because initialState persists
      // across app restarts and would permanently block new-tab creation.
      const isInternal = options?.state?.__isInternalTabNavigation

      // 1. Break recursion/Self-navigation/Home-replacement/Initial-redirect:
      // If we are already at the target URL, it's internal, we are replacing Home, or it's an initial page redirect
      if (
        isInternal ||
        (alwaysOpenInNewTabRef.current &&
          normalizedResolved === normalizedCurrent) ||
        (isHome && options?.replace) ||
        isInitialRedirect
      ) {
        if (inTabRouter && inRouter && navigate) {
          navigate(to as any, options)
        }
        return
      }

      // --- Global Reuse Check ---
      const {
        tabs: storeTabs,
        setActiveTab: setActiveTabAction,
        openTab: openTabAction,
        updateTab: updateTabAction,
        getActiveTabId: getStoreActiveTabId,
        setNextNavigationOptions,
      } = useTabStore.getState()

      const isSettings = normalizedResolved.startsWith("/settings")

      if (reuseExistingTab || isSettings) {
        let existingTab = storeTabs.find((t) => t.url === resolvedUrl)

        if (!existingTab) {
          existingTab = storeTabs.find(
            (t) => normalize(t.url) === normalizedResolved
          )
        }

        if (!existingTab && isSettings) {
          existingTab = storeTabs.find((t) => {
            try {
              return new URL(t.url, window.location.origin).pathname.startsWith(
                "/settings"
              )
            } catch {
              return false
            }
          })
        }

        if (existingTab) {
          const activeTabIdFromStore = getStoreActiveTabId()
          const isTargetCurrentlyActive =
            existingTab.id === tabId || existingTab.id === activeTabIdFromStore

          if (isTargetCurrentlyActive) {
            if (normalize(existingTab.url) === normalizedResolved) {
              setActiveTabAction(existingTab.id)
              return
            }

            if (isSettings) {
              if (inTabRouter && inRouter && navigate) {
                navigate(to as any, options)
                return
              }

              if (replaceCurrentTab) {
                setNextNavigationOptions(existingTab.id, { replace: true })
              }
              updateTabAction(existingTab.id, { url: resolvedUrl })
              setActiveTabAction(existingTab.id)
              return
            }
            // Proceed with local update (fall through)
          } else {
            if (existingTab.url !== resolvedUrl) {
              updateTabAction(existingTab.id, { url: resolvedUrl })
            }
            setActiveTabAction(existingTab.id)
            return
          }
        }
      }

      if (forceNewTab) {
        openTabAction(resolvedUrl, undefined, {
          forceNewTab: true,
          state: { ...options?.state, __isInternalTabNavigation: true },
        })
        return
      }

      const storeActiveTabId = getStoreActiveTabId()
      const targetId = tabId || storeActiveTabId || storeTabs[0]?.id

      if (targetId) {
        if (replaceCurrentTab) {
          setNextNavigationOptions(targetId, { replace: true })
        }
        if (storeTabs.find((t) => t.id === targetId)?.url !== resolvedUrl) {
          updateTabAction(targetId, { url: resolvedUrl })
        }
      }

      if (inTabRouter && inRouter && navigate && !forceNewTab) {
        if (typeof to === "string" && /^https?:\/\//i.test(to)) {
          // External URL
        } else {
          navigate(to as any, options)
          return
        }
      }

      if (!targetId) {
        openTabAction(resolvedUrl, undefined, {
          state: { __isInternalTabNavigation: true },
        })
      } else {
        setActiveTabAction(targetId)
      }
    },
    [inTabRouter, inRouter, navigate, reuseExistingTab, tabId]
  )

  const adapterParams = useMemo(() => {
    if (inTabRouter && inRouter && params) return params

    // Manual param parsing for route patterns (no more :database prefix)
    const path = adapterLocation.pathname
    const parts = path.split("/").filter(Boolean)
    const result: Record<string, string> = {
      ...(params?.database ? { database: params.database } : {}),
    }

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
  }, [inTabRouter, inRouter, params, adapterLocation])

  const adapterSearchParams = useMemo(() => {
    if (inTabRouter && inRouter && searchParams) return searchParams

    // Parse search params from location
    const search = adapterLocation.search
    return new URLSearchParams(search)
  }, [inTabRouter, inRouter, searchParams, adapterLocation.search])

  const adapterSetSearchParams = useMemo(() => {
    if (inTabRouter && inRouter && setSearchParams) return setSearchParams

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
    inTabRouter,
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
