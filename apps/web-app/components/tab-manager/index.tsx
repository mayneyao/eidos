import React, { useEffect, useRef } from "react"

import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useTabStore } from "@/apps/web-app/store/tabs"

import { SplitPanelManager } from "./split-panel-manager"

export function TabManager({ children }: { children: React.ReactNode }) {
  const {
    tabs,
    panels,
    activePanelId,
    openTab,
    closeTab,
    setActiveTab,
    reopenLastClosedTab,
    getActiveTabId,
  } = useTabStore()
  const { location } = useRouterAdapter()
  const goInTabHistory = useTabStore((state) => state.goInTabHistory)
  const initGuardRef = useRef(false)

  // Get the active tab ID from the active panel
  const activeTabId = getActiveTabId()

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
      const currentActiveTabId = useTabStore.getState().getActiveTabId()

      switch (action.id) {
        case "new-tab":
          openTab("/", "New Tab")
          break
        case "restore-last-closed-tab":
          reopenLastClosedTab()
          break
        case "close-current-tab": {
          if (!currentActiveTabId) break

          const { tabs: currentTabs } = useTabStore.getState()
          const shouldHideWindow =
            currentTabs.length <= 1 &&
            typeof window !== "undefined" &&
            window.eidos?.closeWindow

          if (shouldHideWindow) {
            window.eidos?.closeWindow()
            break
          }

          closeTab(currentActiveTabId)
          break
        }
        case "next-tab":
          {
            const { tabs: currentTabs, panels: currentPanels, activePanelId: currentPanelId } = useTabStore.getState()
            const currentPanel = currentPanels.find((p) => p.id === currentPanelId)
            if (!currentPanel) break

            const panelTabs = currentPanel.tabIds
            const currentIndex = panelTabs.indexOf(currentPanel.activeTabId || "")
            const nextIndex = (currentIndex + 1) % panelTabs.length
            if (panelTabs[nextIndex]) {
              setActiveTab(panelTabs[nextIndex])
            }
          }
          break
        case "previous-tab":
          {
            const { panels: currentPanels, activePanelId: currentPanelId } = useTabStore.getState()
            const currentPanel = currentPanels.find((p) => p.id === currentPanelId)
            if (!currentPanel) break

            const panelTabs = currentPanel.tabIds
            const currentIndex = panelTabs.indexOf(currentPanel.activeTabId || "")
            const prevIndex = currentIndex <= 0 ? panelTabs.length - 1 : currentIndex - 1
            if (panelTabs[prevIndex]) {
              setActiveTab(panelTabs[prevIndex])
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
  }, [openTab, closeTab, setActiveTab, reopenLastClosedTab])

  // Handle mouse side buttons for back/forward within the active tab
  useEffect(() => {
    let lastHandled = 0
    const handleMouseButton = (e: MouseEvent) => {
      const currentActiveTabId = useTabStore.getState().getActiveTabId()
      if (!currentActiveTabId) return
      // Deduplicate if the same event fires across multiple mouse event types
      if (lastHandled === e.timeStamp) return

      if (e.button === 3) {
        e.preventDefault()
        goInTabHistory(currentActiveTabId, -1)
        lastHandled = e.timeStamp
      } else if (e.button === 4) {
        e.preventDefault()
        goInTabHistory(currentActiveTabId, 1)
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
  }, [goInTabHistory])

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      <SplitPanelManager>{children}</SplitPanelManager>
    </div>
  )
}
