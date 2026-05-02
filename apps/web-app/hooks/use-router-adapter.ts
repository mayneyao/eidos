import { useCallback, useEffect, useMemo, useRef } from "react"
import {
  useInRouterContext,
  useLocation as useRouterLocation,
  useNavigate as useRouterNavigate,
  useParams as useRouterParams,
  useSearchParams as useRouterSearchParams,
} from "react-router-dom"

import { useTabStore } from "@/apps/web-app/store/tabs"

export const useRouterAdapter = () => {
  const inRouter = useInRouterContext()

  // Hooks that might throw if not in router
  const location = inRouter ? useRouterLocation() : null
  const navigate = inRouter ? useRouterNavigate() : null
  const params = inRouter ? useRouterParams() : null
  const [searchParams, setSearchParams] = inRouter
    ? useRouterSearchParams()
    : [null, null]

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

      const replaceCurrentTab = options?.replace === true // Must explicitly set replace: true to replace current tab
      const forceNewTab = options?.target === "_blank"

      if (forceNewTab) {
        const resolvedUrl = resolveUrl(to)
        const {
          tabs,
          openTab: openTabAction,
          setActiveTab,
          updateTab,
        } = useTabStore.getState()

        // Check if an existing tab is already showing the same "type" of page
        // (same first path segment), and reuse it instead of opening a duplicate
        try {
          const targetPath = new URL(resolvedUrl, window.location.origin)
            .pathname
          const targetSegment = targetPath.split("/").filter(Boolean)[0]
          if (targetSegment) {
            const sameTypeTab = tabs.find((t) => {
              try {
                const tabPath = new URL(t.url, window.location.origin).pathname
                return tabPath.split("/").filter(Boolean)[0] === targetSegment
              } catch {
                return false
              }
            })
            if (sameTypeTab) {
              updateTab(sameTypeTab.id, { url: resolvedUrl })
              setActiveTab(sameTypeTab.id)
              return
            }
          }
        } catch {
          // fall through to open new tab
        }

        openTabAction(resolvedUrl, undefined, { forceNewTab: true })
        return
      }

      if (inRouter && navigate) {
        // External URLs can't be handled by react-router; delegate to tab-based navigation
        if (typeof to === "string" && /^https?:\/\//i.test(to)) {
          // Fall through to the tab-based navigation below
        } else {
          navigate(to as any, options)
          return
        }
      }

      const newUrl = resolveUrl(to)

      // Default behavior: navigate within the active tab's history stack
      const {
        tabs,
        getActiveTabId: getStoreActiveTabId,
        openTab: openTabAction,
        setActiveTab: setActiveTabAction,
        updateTab,
        setNextNavigationOptions,
      } = useTabStore.getState()

      // Check if a tab with the same url already exists
      const existingTab = tabs.find((t) => t.url === newUrl)
      if (existingTab) {
        setActiveTabAction(existingTab.id)
        return
      }

      const storeActiveTabId = getStoreActiveTabId()

      const targetId = storeActiveTabId || tabs[0]?.id

      if (!targetId) {
        openTabAction(newUrl)
        return
      }

      if (replaceCurrentTab) {
        setNextNavigationOptions(targetId, { replace: true })
      }

      updateTab(targetId, { url: newUrl })
      setActiveTabAction(targetId)
    },
    [inRouter, navigate]
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
  }
}
