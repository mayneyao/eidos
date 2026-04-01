import React, { useEffect, useRef } from "react"
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
      const currentPath = location.pathname + location.search + location.hash

      // Only navigate if the tab URL is different from current location
      if (tabUrl !== currentPath) {
        prevTabUrlRef.current = tabUrl
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
  children: React.ReactNode
}

export function TabContainer({
  tabId,
  initialUrl,
  isActive,
  children,
}: TabContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isUpdatingFromUrlRef = useRef(false)

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
      <MemoryRouter initialEntries={[initialUrl]}>
        <TabProvider value={{ tabId, containerRef, isActive }}>
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
