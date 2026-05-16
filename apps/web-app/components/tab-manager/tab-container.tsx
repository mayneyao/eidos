import React, { useEffect, useMemo, useRef } from "react"
import {
  MemoryRouter,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router-dom"

import { cn } from "@/lib/utils"
import { useTabStore } from "@/apps/web-app/store/tabs"

import { TabProvider } from "./tab-context"

// Helper component to sync URL changes back to the store
function TabUrlSyncer({
  tabId,
  isUpdatingFromUrlRef,
}: {
  tabId: string
  isUpdatingFromUrlRef: React.MutableRefObject<boolean>
}) {
  const location = useLocation()
  const updateTab = useTabStore((state) => state.updateTab)
  const recordHistoryNavigation = useTabStore(
    (state) => state.recordHistoryNavigation
  )
  const navigationType = useNavigationType()
  const prevUrlRef = useRef<string>("")

  useEffect(() => {
    const fullPath = location.pathname + location.search + location.hash

    // Skip updating store for external URL placeholder paths
    // External URLs are handled separately and should not be overwritten
    if (location.pathname === "/external") {
      prevUrlRef.current = fullPath
      return
    }

    // Only update if the URL actually changed
    if (fullPath !== prevUrlRef.current) {
      prevUrlRef.current = fullPath
      recordHistoryNavigation(
        tabId,
        { key: location.key, url: fullPath },
        navigationType
      )
      isUpdatingFromUrlRef.current = true
      updateTab(tabId, { url: fullPath })
    }
  }, [
    location.pathname,
    location.search,
    location.hash,
    location.key,
    tabId,
    updateTab,
    recordHistoryNavigation,
    navigationType,
    isUpdatingFromUrlRef,
  ])

  return null
}

// Helper component to sync store changes to the router
function TabNavigator({
  tabId,
  isUpdatingFromUrlRef,
}: {
  tabId: string
  isUpdatingFromUrlRef: React.MutableRefObject<boolean>
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const tabUrl = useTabStore(
    (state) => state.tabs.find((t) => t.id === tabId)?.url
  )
  const registerTabNavigator = useTabStore(
    (state) => state.registerTabNavigator
  )
  const unregisterTabNavigator = useTabStore(
    (state) => state.unregisterTabNavigator
  )
  const consumeNextNavigationOptions = useTabStore(
    (state) => state.consumeNextNavigationOptions
  )
  const prevTabUrlRef = useRef<string>("")

  useEffect(() => {
    registerTabNavigator(tabId, navigate)
    return () => unregisterTabNavigator(tabId)
  }, [tabId, navigate, registerTabNavigator, unregisterTabNavigator])

  useEffect(() => {
    if (isUpdatingFromUrlRef.current) {
      isUpdatingFromUrlRef.current = false
      if (tabUrl) {
        prevTabUrlRef.current = tabUrl
      }
      return
    }

    if (tabUrl && tabUrl !== prevTabUrlRef.current) {
      // Skip external URLs (http/https) - they are handled by webview directly
      // and should not be processed by react-router
      if (/^https?:\/\//i.test(tabUrl)) {
        prevTabUrlRef.current = tabUrl
        return
      }

      const currentPath = location.pathname + location.search + location.hash

      const isSamePath = tabUrl === currentPath
      prevTabUrlRef.current = tabUrl

      // Only navigate if the tab URL is different from current location
      if (!isSamePath) {
        const navOptions = consumeNextNavigationOptions(tabId)
        navigate(tabUrl, { replace: navOptions?.replace === true })
      }
    }
  }, [
    tabUrl,
    navigate,
    location.pathname,
    location.search,
    location.hash,
    consumeNextNavigationOptions,
    tabId,
    isUpdatingFromUrlRef,
  ])

  return null
}

interface TabContainerProps {
  tabId: string
  initialUrl: string
  isActive: boolean
  isFocused: boolean
  children: React.ReactNode
}

// Check if URL is an external URL (http/https)
const isExternalUrl = (url: string): boolean => {
  return !!url && /^https?:\/\//i.test(url)
}

export function TabContainer({
  tabId,
  initialUrl,
  isActive,
  isFocused,
  children,
}: TabContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isUpdatingFromUrlRef = useRef(false)

  // For external URLs, use a placeholder path and store the actual URL in ref
  const externalUrlRef = useRef<string | null>(null)
  const tab = useTabStore((state) => state.tabs.find((t) => t.id === tabId))
  const routerInitialEntries = useMemo(() => {
    if (isExternalUrl(initialUrl)) {
      externalUrlRef.current = initialUrl
      return ["/external"]
    }
    const url = new URL(initialUrl, window.location.origin)
    return [
      {
        pathname: url.pathname,
        search: url.search,
        hash: url.hash,
        state: tab?.initialState,
      },
    ]
  }, [initialUrl, tab?.initialState])

  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col h-full",
        isActive ? "block" : "hidden"
      )}
      id={`tab-container-${tabId}`}
      data-tab-id={tabId}
      ref={containerRef}
    >
      <MemoryRouter initialEntries={routerInitialEntries}>
        <TabProvider value={{ tabId, containerRef, isActive, isFocused }}>
          <TabUrlSyncer
            tabId={tabId}
            isUpdatingFromUrlRef={isUpdatingFromUrlRef}
          />
          <TabNavigator
            tabId={tabId}
            isUpdatingFromUrlRef={isUpdatingFromUrlRef}
          />
          <div className="flex-1 overflow-y-auto min-h-0 h-full">
            {children}
          </div>
        </TabProvider>
      </MemoryRouter>
    </div>
  )
}
