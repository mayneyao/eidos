import React, { useCallback, useState } from "react"
import {
  Blocks,
  BookOpen,
  Bot,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  Code,
  Database,
  File,
  FileText,
  FolderOpen,
  GitBranch,
  Globe,
  ListTree,
  MessageSquare,
  Plus,
  Search,
  Settings,
  Trash2,
  Workflow,
  X,
} from "lucide-react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers"
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { isDesktopMode } from "@/lib/env"
import { cn, isDayPageId } from "@/lib/utils"
import { isMac, isWindowsDesktop } from "@/lib/web/helper"
import { useSqlite } from "@/hooks/use-sqlite"
import { useSqliteKV } from "@/apps/web-app/hooks/use-sqlite-kv"
import { Button } from "@/components/ui/button"
import { useSidebarStore } from "@/apps/web-app/store/sidebar-store"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { useSpaceAppStore } from "@/apps/web-app/pages/[database]/store"
import { useAppStore } from "@/apps/web-app/store/app-store"
import { useWebviewStore } from "@/apps/web-app/store/webview-store"

import { TabContextMenu } from "./tab-context-menu"
import type { Tab } from "@/apps/web-app/store/tabs"

// Sortable tab item component
interface SortableTabItemProps {
  tab: Tab
  isActive: boolean
  isFocused: boolean
  index: number
  totalTabs: number
  onTabClick: (tabId: string, e: React.MouseEvent) => void
  onTabActivate: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  canGoBack: (tabId: string) => boolean
  canGoForward: (tabId: string) => boolean
  goInTabHistory: (tabId: string, delta: number) => void
  closeOtherTabs: (tabId: string) => void
  closeTabsToRight: (tabId: string) => void
  closeAllTabs: () => void
}

function SortableTabItem({
  tab,
  isActive,
  isFocused,
  index,
  totalTabs,
  onTabClick,
  onTabActivate,
  onCloseTab,
  canGoBack,
  canGoForward,
  goInTabHistory,
  closeOtherTabs,
  closeTabsToRight,
  closeAllTabs,
}: SortableTabItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: tab.id,
    disabled: false,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : "auto",
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="w-[200px] min-w-[36px] flex-shrink"
    >
      <TabContextMenu
        tabId={tab.id}
        tabIndex={index}
        totalTabs={totalTabs}
        onClose={() => onCloseTab(tab.id)}
        onCloseOthers={() => closeOtherTabs(tab.id)}
        onCloseToRight={() => closeTabsToRight(tab.id)}
        onCloseAll={closeAllTabs}
      >
        <div
          className={cn(
            "group relative flex items-center gap-1.5 px-2 py-1.5 text-xs cursor-pointer transition-colors leading-5 h-full border-r border-border/50 w-full",
            isActive
              ? isFocused
                ? "bg-background text-foreground"
                : "bg-background/80 text-foreground/80"
              : "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          )}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          onClick={() => {
            onTabActivate(tab.id)
          }}
          onMouseDown={(e) => onTabClick(tab.id, e)}
        >
          {/* Active tab indicator */}
          {isActive && (
            <div
              className={cn(
                "absolute top-0 left-0 right-0 h-[2px]",
                isFocused ? "bg-primary" : "bg-primary/40"
              )}
            />
          )}

          <TabIcon tab={tab} />

          <span className="truncate flex-1 select-none min-w-0">
            {tab.title}
          </span>

          <div className="flex items-center gap-1 shrink-0 group-[.minimized]:hidden">
            <TabRawDataHint tabId={tab.id} />

            {tab.isDirty ? (
              <div
                className="h-2 w-2 rounded-full bg-foreground/60 shrink-0"
                title="Unsaved changes"
              />
            ) : (
              <button
                className={cn(
                  "hover:bg-accent rounded p-0.5 transition-opacity shrink-0",
                  isActive
                    ? "opacity-60 hover:opacity-100"
                    : "opacity-0 group-hover:opacity-60 hover:!opacity-100"
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTab(tab.id)
                }}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </TabContextMenu>
    </div>
  )
}

function TabIcon({ tab }: { tab: Tab }) {
  const { url, icon } = tab

  if (icon) {
    return (
      <div className="flex shrink-0 items-center justify-center">
        <img src={icon} className="h-3.5 w-3.5 rounded-sm" alt="" />
      </div>
    )
  }

  const iconClassName = "h-3.5 w-3.5 shrink-0 opacity-70"

  // Handle external URLs (Webview)
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const domain = new URL(url).hostname
      return (
        <div className="flex shrink-0 items-center justify-center">
          <img
            src={`https://edge-kit.eidos.space/favicon?domain=${domain}&sz=64`}
            className="h-3.5 w-3.5 rounded-sm"
            alt=""
            onError={(e) => {
              // On error, we could potentially switch to a Globe icon,
              // but for simplicity in this functional component, we'll just show the alt or a fallback.
              // Note: true error handling would require state.
            }}
          />
        </div>
      )
    } catch (e) {
      return <Globe className={iconClassName} />
    }
  }

  if (url.startsWith("eidos-read://"))
    return <BookOpen className={iconClassName} />
  if (url.startsWith("/settings")) return <Settings className={iconClassName} />
  if (url.startsWith("/agent"))
    return <MessageSquare className={iconClassName} />
  if (url.startsWith("/journals") || url.startsWith("/today"))
    return <CalendarDays className={iconClassName} />
  if (url.startsWith("/editor")) return <Code className={iconClassName} />
  if (url.startsWith("/file-handler"))
    return <FileText className={iconClassName} />
  if (url.startsWith("/folder")) return <FolderOpen className={iconClassName} />
  if (url.includes("nodeId") || url.match(/^\/[0-9a-f-]{36}$/i))
    return <ListTree className={iconClassName} />
  if (url.startsWith("/extensions")) return <Blocks className={iconClassName} />
  if (url.startsWith("/trash")) return <Trash2 className={iconClassName} />
  if (url.startsWith("/search")) return <Search className={iconClassName} />
  if (url.startsWith("/graft")) return <GitBranch className={iconClassName} />
  if (url.startsWith("/capture")) return <Camera className={iconClassName} />

  return <File className={iconClassName} />
}

function TabRawDataHint({ tabId }: { tabId: string }) {
  const hasRawData = useWebviewStore((s) => s.states[tabId]?.hasRawData)
  const matchedAdapters = useWebviewStore(
    (s) => s.states[tabId]?.matchedAdapters || []
  )

  if (!hasRawData || matchedAdapters.length === 0) return null

  return (
    <div
      className="flex shrink-0 items-center justify-center text-primary/60"
      title={
        matchedAdapters.length === 1
          ? `Raw Data available for ${matchedAdapters[0].name}`
          : `Raw Data available (${matchedAdapters.length} matches)`
      }
    >
      <Database className="h-3 w-3" />
    </div>
  )
}

interface TabBarProps {
  panelId?: string
  isFirstPanel?: boolean
  isLastPanel?: boolean
}

export function TabBar({
  panelId,
  isFirstPanel = false,
  isLastPanel = false,
}: TabBarProps) {
  const {
    tabs,
    panels,
    activePanelId,
    openTab,
    confirmCloseTab,
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
  const isPanelFocused = currentPanelId === activePanelId

  // Filter tabs to only show those in this panel
  const panelTabs = currentPanel
    ? currentPanel.tabIds
        .map((id) => tabs.find((t) => t.id === id))
        .filter((t): t is NonNullable<typeof t> => t !== undefined)
    : tabs

  const activeTabId = currentPanel?.activeTabId || null

  // For right panel toggle button
  const { isSidebarOpen } = useAppStore()

  // Use useCallback to stabilize handleNewTab reference
  const [newTabContent] = useSqliteKV<string | null>(
    "eidos:space:settings:newtab",
    ""
  )

  const handleNewTab = useCallback(() => {
    let url = "/"
    if (newTabContent === "agent") {
      url = "/agent"
    } else if (newTabContent && newTabContent !== "default") {
      url = `/blocks/${newTabContent}`
    }

    openTab(url, "New Tab", {
      panelId: currentPanelId || undefined,
      state: { __isInternalTabNavigation: true },
    })
  }, [openTab, currentPanelId, newTabContent])

  // Local state for optimistic UI updates during drag
  const [localPanelTabs, setLocalPanelTabs] = useState(panelTabs)

  // Update local state when external tabs change
  // Use stable dependencies: tabIds from panel and tabs array reference
  const tabIdsKey = currentPanel?.tabIds.join(",") ?? ""
  React.useEffect(() => {
    setLocalPanelTabs(panelTabs)
  }, [tabIdsKey, tabs])

  // Setup dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return

      const oldIndex = localPanelTabs.findIndex((tab) => tab.id === active.id)
      const newIndex = localPanelTabs.findIndex((tab) => tab.id === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        const newTabs = arrayMove(localPanelTabs, oldIndex, newIndex)
        setLocalPanelTabs(newTabs)
        reorderTabs(newTabs, currentPanelId || undefined)
      }
    },
    [localPanelTabs, reorderTabs, currentPanelId]
  )

  const handleTabClick = (tabId: string, e: React.MouseEvent) => {
    // Middle-click to close
    if (e.button === 1) {
      e.preventDefault()
      confirmCloseTab(tabId)
      return
    }

    // Left-click to switch tab
    setActiveTab(tabId)
    void locateTabInFileTree(tabId)
  }

  const dispatchExpandTo = useCallback(
    (
      app: "files" | "nodes" | "extensions" | "today" | "agent",
      path: string
    ) => {
      setCurrentApp(app)
      if (app === "today") {
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("journals-scroll-to-day", {
              detail: { id: path },
            })
          )
        }, 50)
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

      // 2) Folder handler tabs with explicit folder paths
      const folderHandlerPattern = new URLPattern({ pathname: "/folder" })
      const folderHandlerMatch = folderHandlerPattern.exec(url)
      if (folderHandlerMatch && url.includes("#")) {
        const hashIndex = url.indexOf("#")
        const folderPath = decodeURIComponent(url.substring(hashIndex + 1))
        dispatchExpandTo("files", folderPath)
        return
      }

      // 3) Node tabs: "/<nodeId>"
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

      // 5) Agent tabs: "/agent/:sessionId"
      const agentPattern = new URLPattern({
        pathname: "/agent/:sessionId?",
      })
      const agentMatch = agentPattern.exec(url)
      if (agentMatch) {
        dispatchExpandTo("agent", "")
        return
      }
    },
    [tabs, sqlite?.tree, sqlite?.extension, dispatchExpandTo]
  )

  return (
    <div
      className={cn(
        "flex items-center gap-0 min-w-0 h-[38px]",
        panelId
          ? "w-full shrink-0 border-b border-border/60 bg-muted/60 px-1"
          : "flex-1",
        {
          // First panel: add left padding for macOS traffic lights when sidebar is closed
          "!pl-[72px]":
            isFirstPanel &&
            (isDesktopMode || navigator.windowControlsOverlay?.visible) &&
            isMac() &&
            !isSidebarOpen &&
            !!panelId,
          // Windows: add right padding when on last panel
          "pr-[112px]": isLastPanel && isWindowsDesktop && !!panelId,
        }
      )}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      id="drag-region"
    >
      {/* Tabs container - can compress with overflow hidden */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToHorizontalAxis]}
      >
        <SortableContext
          items={localPanelTabs.map((tab) => tab.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex items-center gap-0 min-w-0 overflow-hidden">
            {localPanelTabs.map((tab, index) => (
              <SortableTabItem
                key={tab.id}
                tab={tab}
                isActive={activeTabId === tab.id}
                isFocused={isPanelFocused && activeTabId === tab.id}
                index={index}
                totalTabs={localPanelTabs.length}
                onTabClick={handleTabClick}
                onTabActivate={(tabId) => {
                  setActiveTab(tabId)
                  void locateTabInFileTree(tabId)
                }}
                onCloseTab={confirmCloseTab}
                canGoBack={canGoBack}
                canGoForward={canGoForward}
                goInTabHistory={goInTabHistory}
                closeOtherTabs={closeOtherTabs}
                closeTabsToRight={closeTabsToRight}
                closeAllTabs={closeAllTabs}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

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
          {/* <NavStatus /> */}
        </div>
      )}
    </div>
  )
}
