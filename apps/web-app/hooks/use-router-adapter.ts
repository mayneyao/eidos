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
    const activeTabId = useTabStore((state) => state.activeTabId)
    const tabs = useTabStore((state) => state.tabs)
    const updateTab = useTabStore((state) => state.updateTab)

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
        (to: string | number, options?: { replace?: boolean; target?: "_blank" | "_self"; state?: any }) => {
            if (inRouter && navigate) {
                navigate(to as any, options)
                return
            }

            if (typeof to === "number") {
                // Delegate to the active tab's history stack
                const { activeTabId: storeActiveTabId, goInTabHistory } = useTabStore.getState()
                if (storeActiveTabId) {
                    goInTabHistory(storeActiveTabId, to)
                }
                return
            }

            // Parse options
            const replaceCurrentTab = options?.replace === true // Must explicitly set replace: true to replace current tab
            const forceNewTab = options?.target === "_blank"

            // Resolve relative paths if needed
            let newUrl = to as string
            const currentLocation = adapterLocationRef.current
            if (!newUrl.startsWith("/") && !newUrl.startsWith("http")) {
                // Simple relative path handling
                const currentPath = currentLocation.pathname
                if (currentPath.endsWith("/")) {
                    newUrl = currentPath + newUrl
                } else {
                    newUrl = currentPath + "/" + newUrl
                }
            }

            // Default behavior: navigate within the active tab's history stack
            const {
                tabs,
                activeTabId: storeActiveTabId,
                openTab: openTabAction,
                setActiveTab: setActiveTabAction,
                updateTab,
                setNextNavigationOptions,
            } = useTabStore.getState()

            if (forceNewTab) {
                openTabAction(newUrl)
                return
            }

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
        [inRouter, navigate],
    )

    const adapterParams = useMemo(() => {
        if (inRouter && params) return params

        // Manual param parsing for common patterns
        // Assumes pattern like /:database/:table or /:database/journals/:day
        // This is a simplified parser and might need to be robustified based on actual routes
        const path = adapterLocation.pathname
        const parts = path.split("/").filter(Boolean)
        const result: Record<string, string> = {}

        // Heuristic matching based on known routes
        // /:database
        if (parts.length >= 1) result.database = parts[0]

        // /:database/:table (node)
        if (parts.length >= 2) result.table = parts[1]

        // /:database/journals/:day
        if (parts.length >= 3 && parts[1] === "journals") {
            result.day = parts[2]
        }

        // /:database/extensions/:scriptId
        if (parts.length >= 3 && parts[1] === "extensions") {
            result.scriptId = parts[2]
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
        return (nextInit: URLSearchParams | Record<string, string> | ((prev: URLSearchParams) => URLSearchParams | Record<string, string>)) => {
            if (!activeTabId) {
                console.warn("Cannot set search params: no active tab")
                return
            }

            // Compute the new search params
            let newSearchParams: URLSearchParams
            if (typeof nextInit === 'function') {
                const prev = new URLSearchParams(adapterLocation.search)
                const result = nextInit(prev)
                newSearchParams = result instanceof URLSearchParams ? result : new URLSearchParams(result)
            } else if (nextInit instanceof URLSearchParams) {
                newSearchParams = nextInit
            } else {
                newSearchParams = new URLSearchParams(nextInit)
            }

            // Update the active tab's URL with new search params
            const currentUrl = new URL(activeTab?.url || '/', window.location.origin)
            currentUrl.search = newSearchParams.toString()

            updateTab(activeTabId, { url: currentUrl.pathname + currentUrl.search + currentUrl.hash })
        }
    }, [inRouter, setSearchParams, activeTabId, activeTab, adapterLocation.search, updateTab])

    return {
        location: adapterLocation,
        navigate: adapterNavigate as (to: string | number, options?: { replace?: boolean, target?: "_blank" | "_self", state?: any }) => void,
        params: adapterParams as Record<string, string>,
        searchParams: adapterSearchParams,
        setSearchParams: adapterSetSearchParams as (nextInit: URLSearchParams | Record<string, string> | ((prev: URLSearchParams) => URLSearchParams | Record<string, string>)) => void,
        inRouter,
    }
}
