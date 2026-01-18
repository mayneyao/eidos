import React, { useCallback } from "react"
import { ChevronLeft, ChevronRight, PanelRightIcon, Plus, X } from "lucide-react"

import { isDesktopMode } from "@/lib/env"
import { cn, isDayPageId } from "@/lib/utils"
import { isMac, isWindowsDesktop } from "@/lib/web/helper"
import { useSqlite } from "@/hooks/use-sqlite"
import { Button } from "@/components/ui/button"
import { useSidebarStore } from "@/apps/web-app/store/sidebar-store"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { useSpaceAppStore } from "@/apps/web-app/pages/[database]/store"
import { useAppStore } from "@/apps/web-app/store/app-store"
import { NavStatus } from "@/components/nav/nav-status"

import { TabContextMenu } from "./tab-context-menu"

interface TabBarProps {
  panelId?: string
  isFirstPanel?: boolean
  isLastPanel?: boolean
}

export function TabBar({ panelId, isFirstPanel = false, isLastPanel = false }: TabBarProps) {
  const {
    tabs,
    panels,
    activePanelId,
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

  // Get the panel to work with
  const currentPanelId = panelId || activePanelId
  const currentPanel = panels.find((p) => p.id === currentPanelId)

  // Filter tabs to only show those in this panel
  const panelTabs = currentPanel
    ? currentPanel.tabIds
        .map((id) => tabs.find((t) => t.id === id))
        .filter((t): t is NonNullable<typeof t> => t !== undefined)
    : tabs

  const activeTabId = currentPanel?.activeTabId || null

  // For right panel toggle button
  const { isSidebarOpen } = useAppStore()
  const { isRightPanelOpen, setIsRightPanelOpen, currentAppIndex } = useSpaceAppStore()

  const handleAppChange = (index: number) => {
    if (index === currentAppIndex) {
      setIsRightPanelOpen(false)
    } else {
      setIsRightPanelOpen(true, index)
    }
  }

  // Use useCallback to stabilize handleNewTab reference
  const handleNewTab = useCallback(() => {
    openTab("/", "New Tab", currentPanelId || undefined)
  }, [openTab, currentPanelId])

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
    (app: "files" | "nodes" | "extensions" | "today", path: string) => {
      setCurrentApp(app)
      if (app === "today") {
        window.dispatchEvent(
          new CustomEvent("journals-scroll-to-day", {
            detail: { id: path },
          })
        )
        return
      }
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

      console.log("tab", tab)
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

      // 3) Journal tabs: "/journals/:day"
      const journalPattern = new URLPattern({ pathname: "/journals/:day" })
      const journalMatch = journalPattern.exec(url)
      if (journalMatch?.pathname?.groups?.day) {
        const day = journalMatch.pathname.groups.day
        if (isDayPageId(day)) {
          dispatchExpandTo("today", day)
        }
        return
      }

      // 4) Extension tabs: "/extensions/<extensionId>"
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
      className={cn(
        "flex items-center gap-0 shrink-0 min-w-0 px-1 h-[38px] border-b border-border/60 bg-muted/60",
        {
          // First panel: add left padding for macOS traffic lights when sidebar is closed
          "!pl-[72px]": isFirstPanel && (isDesktopMode || navigator.windowControlsOverlay?.visible) && isMac() && !isSidebarOpen,
          // Windows: add right padding when on last panel
          "pr-[112px]": isLastPanel && isWindowsDesktop && !isRightPanelOpen,
        }
      )}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      id="drag-region"
    >
      {/* Tabs container - can compress with overflow hidden */}
      <div className="flex items-center gap-0 min-w-0 overflow-hidden">
      {panelTabs.map((tab, index) => {
          const isActive = activeTabId === tab.id
          return (
            <TabContextMenu
              key={tab.id}
              tabId={tab.id}
              tabIndex={index}
              totalTabs={panelTabs.length}
              onClose={() => closeTab(tab.id)}
              onCloseOthers={() => closeOtherTabs(tab.id)}
              onCloseToRight={() => closeTabsToRight(tab.id)}
              onCloseAll={closeAllTabs}
            >
              <div
                className={cn(
                  "group relative flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer transition-colors leading-5",
                  "w-[200px] min-w-0 max-w-[200px] border-r border-border/50",
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

      {/* Spacer to push right panel controls to right edge */}
      {isLastPanel && <div className="flex-1" />}

      {/* Right panel controls - only on last panel */}
      {isLastPanel && (
        <div
          className="flex items-center gap-1 shrink-0 grow-0"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        >
          <NavStatus />
          {isDesktopMode && !isRightPanelOpen && (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => handleAppChange(0)}
              className={cn({
                "mr-1": !isWindowsDesktop && !isRightPanelOpen,
              })}
            >
              <PanelRightIcon className="h-4 w-4" />
            </Button>
          )}
          {!isDesktopMode && (
            <Button size="xs" variant="ghost" onClick={() => handleAppChange(0)}>
              <PanelRightIcon className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
