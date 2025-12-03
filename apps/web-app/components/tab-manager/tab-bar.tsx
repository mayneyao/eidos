import React, { useEffect } from "react"
import { Plus, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { useSidebarStore } from "@/apps/web-app/store/sidebar-store"

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

  const handleNewTab = () => {
    openTab("/", "New Tab")
  }

  const handleTabClick = (tabId: string, e: React.MouseEvent) => {
    // Middle-click to close
    if (e.button === 1) {
      e.preventDefault()
      closeTab(tabId)
      return
    }

    // Left-click to switch tab and locate in file tree
    setActiveTab(tabId)
    locateTabInFileTree(tabId)
  }

  const locateTabInFileTree = (tabId: string) => {
    const tab = tabs.find(t => t.id === tabId)
    if (!tab) return

    // Check if this is a file-handler page
    if (tab.url.startsWith('/file-handler#')) {
      const filePath = decodeURIComponent(tab.url.substring('/file-handler#'.length))

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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + W: Close current tab
      if ((e.metaKey || e.ctrlKey) && e.key === "w") {
        e.preventDefault()
        if (activeTabId) {
          closeTab(activeTabId)
        }
      }

      // Cmd/Ctrl + T: New tab
      if ((e.metaKey || e.ctrlKey) && e.key === "t") {
        e.preventDefault()
        handleNewTab()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [tabs, activeTabId, closeTab, setActiveTab])

  return (
    <div
      className="flex items-center gap-1 flex-1 min-w-0"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      id="drag-region"
    >
      {tabs.map((tab, index) => (
        <TabContextMenu
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
              "group flex items-center gap-1 px-2 py-1 text-sm cursor-pointer transition-colors max-w-[200px] min-w-[80px] rounded",
              activeTabId === tab.id ? "bg-accent" : "hover:bg-accent/50"
            )}
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
            onClick={() => {
              setActiveTab(tab.id)
              locateTabInFileTree(tab.id)
            }}
            onMouseDown={(e) => handleTabClick(tab.id, e)}
          >
            <span className="truncate flex-1">{tab.title}</span>
            <button
              className="hover:bg-background/80 rounded p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </TabContextMenu>
      ))}
      <button
        className="p-1 hover:bg-accent rounded opacity-60 hover:opacity-100"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        onClick={handleNewTab}
        title="New Tab (Cmd/Ctrl+T)"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}
