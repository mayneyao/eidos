import React, { useEffect, useRef } from "react"
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom"

import { cn } from "@/lib/utils"
import { useTabStore } from "@/apps/web-app/store/tabs"

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
  const prevUrlRef = useRef<string>("")

  useEffect(() => {
    const fullPath = location.pathname + location.search + location.hash

    // Only update if the URL actually changed
    if (fullPath !== prevUrlRef.current) {
      prevUrlRef.current = fullPath
      isUpdatingFromUrlRef.current = true
      updateTab(tabId, { url: fullPath })
    }
  }, [
    location.pathname,
    location.search,
    location.hash,
    tabId,
    updateTab,
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
  const prevTabUrlRef = useRef<string>("")

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
        navigate(tabUrl)
      }
    }
  }, [
    tabUrl,
    navigate,
    location.pathname,
    location.search,
    location.hash,
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
  const isUpdatingFromUrlRef = useRef(false)

  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col h-screen",
        isActive ? "block" : "hidden"
      )}
    >
      <MemoryRouter initialEntries={[initialUrl]}>
        <TabUrlSyncer
          tabId={tabId}
          isUpdatingFromUrlRef={isUpdatingFromUrlRef}
        />
        <TabNavigator
          tabId={tabId}
          isUpdatingFromUrlRef={isUpdatingFromUrlRef}
        />
        <div className="flex-1 overflow-y-auto min-h-0 h-screen">
          {children}
        </div>
      </MemoryRouter>
    </div>
  )
}
