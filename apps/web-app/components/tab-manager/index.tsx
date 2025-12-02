import React, { useEffect } from "react"

import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useTabStore } from "@/apps/web-app/store/tabs"

import { TabContainer } from "./tab-container"

export function TabManager({ children }: { children: React.ReactNode }) {
  const { tabs, activeTabId, openTab, setActiveTab, updateTab } = useTabStore()
  const { location, navigate } = useRouterAdapter()

  // Initialize with current route if no tabs exist
  useEffect(() => {
    if (tabs.length === 0) {
      openTab(location.pathname + location.search + location.hash, "Home")
    }
  }, [tabs.length, openTab, location])

  // Sync Top URL -> Active Tab Store
  useEffect(() => {
    if (activeTabId) {
      const currentPath = location.pathname + location.search + location.hash
      const activeTab = tabs.find((t) => t.id === activeTabId)
      if (activeTab && activeTab.url !== currentPath) {
        updateTab(activeTabId, { url: currentPath })
      }
    }
  }, [location, activeTabId, tabs, updateTab])

  // Sync Active Tab Store -> Top URL
  const activeTabUrl = tabs.find((t) => t.id === activeTabId)?.url
  useEffect(() => {
    if (activeTabUrl) {
      const currentPath = location.pathname + location.search + location.hash
      if (activeTabUrl !== currentPath) {
        navigate(activeTabUrl)
      }
    }
  }, [activeTabUrl, navigate, location])

  return (
    <div className="relative flex-1 min-h-0">
      {tabs.map((tab) => (
        <TabContainer
          key={tab.id}
          tabId={tab.id}
          initialUrl={tab.url}
          isActive={activeTabId === tab.id}
        >
          {children}
        </TabContainer>
      ))}
    </div>
  )
}
