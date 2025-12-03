import React, { useEffect } from "react"

import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useTabStore } from "@/apps/web-app/store/tabs"

import { TabContainer } from "./tab-container"
import { TabSwitcher } from "./tab-switcher"

export function TabManager({ children }: { children: React.ReactNode }) {
  const { tabs, activeTabId, openTab } = useTabStore()
  const { location } = useRouterAdapter()

  // Initialize with current route if no tabs exist
  useEffect(() => {
    if (tabs.length === 0) {
      openTab(location.pathname + location.search + location.hash, "Home")
    }
  }, [tabs.length, openTab, location])

  return (
    <div className="relative flex-1 min-h-0">
      <TabSwitcher />
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
