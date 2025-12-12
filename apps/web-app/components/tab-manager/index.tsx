import React, { useEffect, useRef } from "react"

import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useTabStore } from "@/apps/web-app/store/tabs"

import { TabContainer } from "./tab-container"
import { Nav } from "../nav"

export function TabManager({ children }: { children: React.ReactNode }) {
  const {
    tabs,
    activeTabId,
    openTab,
    closeTab,
    setActiveTab,
    reopenLastClosedTab,
  } = useTabStore()
  const { location } = useRouterAdapter()
  const goInTabHistory = useTabStore((state) => state.goInTabHistory)
  const initGuardRef = useRef(false)

  // Initialize with current route if no tabs exist, avoid duplicate Home (StrictMode)
  useEffect(() => {
    const targetUrl = location.pathname + location.search + location.hash
    if (tabs.length === 0 && !initGuardRef.current) {
      initGuardRef.current = true
      openTab(targetUrl, "Home")
      return
    }
    if (tabs.length > 0) {
      initGuardRef.current = false
    }
  }, [tabs, activeTabId, openTab, setActiveTab, location])

  // Handle global shortcuts for tab management
  // Moved here from TabBar because TabBar is rendered inside each tab (multiple instances),
  // while TabManager is rendered once globally.
  useEffect(() => {
    const handleGlobalShortcut = (_event: any, action: { id: string }) => {
      switch (action.id) {
        case "new-tab":
          openTab("/", "New Tab")
          break
        case "restore-last-closed-tab":
          reopenLastClosedTab()
          break
        case "close-current-tab": {
          if (!activeTabId) break

          const shouldHideWindow =
            tabs.length <= 1 &&
            typeof window !== "undefined" &&
            window.eidos?.closeWindow

          if (shouldHideWindow) {
            window.eidos?.closeWindow()
            break
          }

          closeTab(activeTabId)
          break
        }
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
  }, [tabs, activeTabId, openTab, closeTab, setActiveTab, reopenLastClosedTab])

  // Handle mouse side buttons for back/forward within the active tab
  useEffect(() => {
    let lastHandled = 0
    const handleMouseButton = (e: MouseEvent) => {
      if (!activeTabId) return
      // Deduplicate if the same event fires across multiple mouse event types
      if (lastHandled === e.timeStamp) return

      if (e.button === 3) {
        e.preventDefault()
        goInTabHistory(activeTabId, -1)
        lastHandled = e.timeStamp
      } else if (e.button === 4) {
        e.preventDefault()
        goInTabHistory(activeTabId, 1)
        lastHandled = e.timeStamp
      }
    }

    window.addEventListener("pointerup", handleMouseButton, { capture: true })
    window.addEventListener("mouseup", handleMouseButton, { capture: true })
    window.addEventListener("auxclick", handleMouseButton, { capture: true })
    return () => {
      window.removeEventListener("pointerup", handleMouseButton, {
        capture: true,
      } as any)
      window.removeEventListener("mouseup", handleMouseButton, {
        capture: true,
      } as any)
      window.removeEventListener("auxclick", handleMouseButton, {
        capture: true,
      } as any)
    }
  }, [activeTabId, goInTabHistory])

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
