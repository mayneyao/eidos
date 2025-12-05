import React, { useCallback } from "react"
import { Plus, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { useSidebarStore } from "@/apps/web-app/store/sidebar-store"
import { useTabStore } from "@/apps/web-app/store/tabs"

import { TabContextMenu } from "./tab-context-menu"

export function TabBar() {
  const {
    tabs,
    activeTabId,
    openTab,
    closeTab,
    closeOtherTabs,
    closeTabsToRight,
    closeAllTabs,
    setActiveTab,
    reorderTabs,
  } = useTabStore()
  const { setCurrentApp } = useSidebarStore()
  // Use useCallback to stabilize handleNewTab reference
  const handleNewTab = useCallback(() => {
    openTab("/", "New Tab")
  }, [openTab])

  const handleTabClick = (tabId: string, e: React.MouseEvent) => {
    // Middle-click to close
    if (e.button === 1) {
      e.preventDefault()
      closeTab(tabId)
      return
    }

    // Left-click to switch tab
    setActiveTab(tabId)
    locateTabInFileTree(tabId)
  }

  const locateTabInFileTree = (tabId: string) => {
    const tab = tabs.find((t) => t.id === tabId)
    if (!tab) return

    // Check if this is a file-handler page
    if (tab.url.startsWith("/file-handler#")) {
      const filePath = decodeURIComponent(
        tab.url.substring("/file-handler#".length)
      )

      // Switch to files tab first to ensure the file tree is mounted
      setCurrentApp("files")

      // Wait a bit for the tab to switch and component to mount
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("file-tree-expand-to", {
            detail: { path: filePath },
          })
        )
      }, 50)
    }
  }

  return (
    <div
      className="flex items-center gap-0 flex-1 min-w-0"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      id="drag-region"
    >
      {/* Tabs container - can compress with overflow hidden */}
      <div className="flex items-center gap-0 flex-1 min-w-0 overflow-hidden">
        {tabs.map((tab, index) => {
          const isActive = activeTabId === tab.id
          return (
            <TabContextMenu
              key={tab.id}
              tabId={tab.id}
              tabIndex={index}
              totalTabs={tabs.length}
              onClose={() => closeTab(tab.id)}
              onCloseOthers={() => closeOtherTabs(tab.id)}
              onCloseToRight={() => closeTabsToRight(tab.id)}
              onCloseAll={closeAllTabs}
            >
              <div
                className={cn(
                  "group relative flex items-center gap-1.5 px-3 py-1.5 text-sm cursor-pointer transition-colors",
                  "flex-1 min-w-[80px] max-w-[240px] border-r border-border/50",
                  isActive
                    ? "bg-background text-foreground"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                onClick={() => {
                  setActiveTab(tab.id)
                  locateTabInFileTree(tab.id)
                }}
                onMouseDown={(e) => handleTabClick(tab.id, e)}
              >
                {/* Active tab indicator */}
                {isActive && (
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary" />
                )}

                <span className="truncate flex-1 select-none">{tab.title}</span>

                <button
                  className={cn(
                    "hover:bg-accent rounded p-0.5 transition-opacity shrink-0",
                    isActive
                      ? "opacity-60 hover:opacity-100"
                      : "opacity-0 group-hover:opacity-60 hover:!opacity-100"
                  )}
                  onClick={(e) => {
                    e.stopPropagation()
                    closeTab(tab.id)
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </TabContextMenu>
          )
        })}
      </div>

      {/* New tab button - outside container so always visible */}
      <button
        className="shrink-0 w-[40px] flex items-center justify-center py-1.5 hover:bg-accent opacity-60 hover:opacity-100 transition-opacity"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        onClick={handleNewTab}
        title="New Tab (Cmd/Ctrl+T)"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}
