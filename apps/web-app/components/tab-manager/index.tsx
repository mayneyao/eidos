import React, { useEffect } from "react"

import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useTabStore } from "@/apps/web-app/store/tabs"

import { TabContainer } from "./tab-container"
import { TabSwitcher } from "./tab-switcher"

export function TabManager({ children }: { children: React.ReactNode }) {
  const { tabs, activeTabId, openTab, closeTab, setActiveTab } = useTabStore()
  const { location } = useRouterAdapter()

  // Initialize with current route if no tabs exist
  useEffect(() => {
    if (tabs.length === 0) {
      openTab(location.pathname + location.search + location.hash, "Home")
    }
  }, [tabs.length, openTab, location])

  // Handle global shortcuts for tab management
  // Moved here from TabBar because TabBar is rendered inside each tab (multiple instances),
  // while TabManager is rendered once globally.
  useEffect(() => {
    const handleGlobalShortcut = (_event: any, action: { id: string }) => {
      switch (action.id) {
        case "new-tab":
          openTab("/", "New Tab")
          break
        case "close-current-tab":
          if (activeTabId) {
            closeTab(activeTabId)
          }
          break
        case "next-tab":
          {
            const currentIndex = tabs.findIndex((t) => t.id === activeTabId)
            const nextIndex = (currentIndex + 1) % tabs.length
            if (tabs[nextIndex]) {
              setActiveTab(tabs[nextIndex].id)
            }
          }
          break
        case "previous-tab":
          {
            const currentIndex = tabs.findIndex((t) => t.id === activeTabId)
            const prevIndex =
              currentIndex <= 0 ? tabs.length - 1 : currentIndex - 1
            if (tabs[prevIndex]) {
              setActiveTab(tabs[prevIndex].id)
            }
          }
          break
      }
    }

    let listenerId: string | undefined

    if (window.eidos) {
      listenerId = window.eidos.on(
        "global-shortcut-triggered",
        handleGlobalShortcut
      )
      return () => {
        if (listenerId) {
          window.eidos?.off("global-shortcut-triggered", listenerId)
        }
      }
    }
  }, [tabs, activeTabId, openTab, closeTab, setActiveTab])

  return (
    <div className="relative flex-1 min-h-0">
      {/* TabSwitcher UI temporarily disabled - using default Chrome behavior */}
      {/* <TabSwitcher /> */}
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
