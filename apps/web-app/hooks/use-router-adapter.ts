import { useMemo } from "react"
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

    const adapterNavigate = useMemo(() => {
        if (inRouter && navigate) return navigate

        // Return a fallback navigate function with tab support
        return ((to: string | number, options?: { tabTitle?: string, replace?: boolean }) => {
            if (typeof to === "number") {
                // History back/forward not fully supported in tab store mode yet
                console.warn("History navigation not supported in no-router mode")
                return
            }

            // Parse options
            const tabTitle = options?.tabTitle
            const replaceCurrentTab = options?.replace === true // Must explicitly set replace: true to replace current tab

            // Resolve relative paths if needed
            let newUrl = to as string
            if (!newUrl.startsWith("/") && !newUrl.startsWith("http")) {
                // Simple relative path handling
                const currentPath = adapterLocation.pathname
                if (currentPath.endsWith("/")) {
                    newUrl = currentPath + newUrl
                } else {
                    newUrl = currentPath + "/" + newUrl
                }
            }

            // VSCode-style tab behavior: default to opening new tabs
            const { tabs, openTab: openTabAction, setActiveTab: setActiveTabAction } = useTabStore.getState()

            // Check if this URL is already open in a tab
            const existingTab = tabs.find((tab: { url: string; id: string }) => tab.url === newUrl)

            if (existingTab) {
                // If tab already exists, just activate it (VSCode behavior)
                setActiveTabAction(existingTab.id)
            } else if (replaceCurrentTab && activeTabId) {
                // Explicitly requested to replace current tab
                updateTab(activeTabId, { url: newUrl })
            } else {
                // Default: open new tab (VSCode behavior)
                openTabAction(newUrl, tabTitle)
            }
        }) // Type as any to match useNavigate signature
    }, [inRouter, navigate, activeTabId, updateTab, adapterLocation])

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

    return {
        location: adapterLocation,
        navigate: adapterNavigate as (to: string | number, options?: { tabTitle?: string, replace?: boolean }) => void,
        params: adapterParams as Record<string, string>,
        inRouter,
    }
}
