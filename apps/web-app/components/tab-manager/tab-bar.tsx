import React, { useCallback } from "react"
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { useSqlite } from "@/hooks/use-sqlite"
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
    goInTabHistory,
    canGoBack,
    canGoForward,
  } = useTabStore()
  const { setCurrentApp } = useSidebarStore()
  const { sqlite } = useSqlite()
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
    void locateTabInFileTree(tabId)
  }

  const dispatchExpandTo = useCallback(
    (app: "files" | "nodes" | "extensions", path: string) => {
      setCurrentApp(app)
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("file-tree-expand-to", {
            detail: { path },
          })
        )
      }, 50)
    },
    [setCurrentApp]
  )

  const locateTabInFileTree = useCallback(
    async (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId)
      if (!tab) return

      const url = "http://localhost" + tab.url
      // 1) File handler tabs with explicit file paths
      const fileHandlerPattern = new URLPattern({ pathname: "/file-handler" })
      const fileHandlerMatch = fileHandlerPattern.exec(url)
      if (fileHandlerMatch && url.includes("#")) {
        const hashIndex = url.indexOf("#")
        const filePath = decodeURIComponent(url.substring(hashIndex + 1))
        dispatchExpandTo("files", filePath)
        return
      }

      // 2) Node tabs: "/<nodeId>"
      const nodePattern = new URLPattern({ pathname: "/:nodeId" })
      const nodeMatch = nodePattern.exec(url)
      if (nodeMatch?.pathname?.groups?.nodeId) {
        const nodeId = nodeMatch.pathname.groups.nodeId
        const idPath = (await sqlite?.tree?.getNodeIdPath?.(nodeId)) || null
        if (!idPath) return
        dispatchExpandTo("nodes", idPath)
        return
      }

      // 3) Extension tabs: "/extensions/<extensionId>"
      const extPattern = new URLPattern({
        pathname: "/extensions/:extensionId",
      })
      const extMatch = extPattern.exec(url)
      if (extMatch?.pathname?.groups?.extensionId) {
        const extId = extMatch.pathname.groups.extensionId
        const extPath =
          (await (sqlite as any)?.extension?.getIdPath?.(extId)) || null
        if (!extPath) return
        dispatchExpandTo("extensions", extPath)
        return
      }
    },
    [tabs, sqlite?.tree, sqlite?.extension, dispatchExpandTo]
  )

  return (
    <div
      className="flex items-center gap-0 flex-1 min-w-0"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      id="drag-region"
    >
      {/* Tabs container - can compress with overflow hidden */}
      <div className="flex items-center gap-0 min-w-0 overflow-hidden">
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
                  "w-[240px] min-w-0 max-w-[240px] border-r border-border/50",
                  isActive
                    ? "bg-background text-foreground"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                )}
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                onClick={() => {
                  setActiveTab(tab.id)
                  // Fire and forget; location handled asynchronously
                  void locateTabInFileTree(tab.id)
                }}
                onMouseDown={(e) => handleTabClick(tab.id, e)}
              >
                {/* Active tab indicator */}
                {isActive && (
                  <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary" />
                )}

                <span className="truncate flex-1 select-none">{tab.title}</span>

                {isActive && (
                  <div className="flex items-center gap-1">
                    <button
                      className={cn(
                        "rounded p-0.5 transition-opacity shrink-0 hover:bg-accent",
                        canGoBack(tab.id)
                          ? "opacity-70 hover:opacity-100"
                          : "opacity-30 cursor-not-allowed"
                      )}
                      onClick={(e) => {
                        e.stopPropagation()
                        goInTabHistory(tab.id, -1)
                      }}
                      disabled={!canGoBack(tab.id)}
                      title="Back"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      className={cn(
                        "rounded p-0.5 transition-opacity shrink-0 hover:bg-accent",
                        canGoForward(tab.id)
                          ? "opacity-70 hover:opacity-100"
                          : "opacity-30 cursor-not-allowed"
                      )}
                      onClick={(e) => {
                        e.stopPropagation()
                        goInTabHistory(tab.id, 1)
                      }}
                      disabled={!canGoForward(tab.id)}
                      title="Forward"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

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
