import React, { useEffect } from "react"
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom"

import { cn } from "@/lib/utils"
import { useTabStore } from "@/apps/web-app/store/tabs"

// Helper component to sync URL changes back to the store
function TabUrlSyncer({ tabId }: { tabId: string }) {
  const location = useLocation()
  const updateTab = useTabStore((state) => state.updateTab)

  useEffect(() => {
    const fullPath = location.pathname + location.search + location.hash
    updateTab(tabId, { url: fullPath })
  }, [location, tabId, updateTab])

  return null
}

// Helper component to sync store changes to the router
function TabNavigator({ tabId }: { tabId: string }) {
  const navigate = useNavigate()
  const location = useLocation()
  const tabUrl = useTabStore(
    (state) => state.tabs.find((t) => t.id === tabId)?.url
  )

  useEffect(() => {
    if (tabUrl) {
      const currentPath = location.pathname + location.search + location.hash
      if (tabUrl !== currentPath) {
        navigate(tabUrl)
      }
    }
  }, [tabUrl, navigate, location])

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
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col h-screen",
        isActive ? "block" : "hidden"
      )}
    >
      <MemoryRouter initialEntries={[initialUrl]}>
        <TabUrlSyncer tabId={tabId} />
        <TabNavigator tabId={tabId} />
        <div className="flex-1 overflow-y-auto min-h-0 h-screen">{children}</div>
      </MemoryRouter>
    </div>
  )
}
