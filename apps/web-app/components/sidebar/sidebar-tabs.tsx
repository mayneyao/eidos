"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  BlocksIcon,
  CalendarDays,
  FolderOpen,
  GitBranch,
  ListTreeIcon,
  MessageSquareIcon,
  SettingsIcon,
  ToyBrickIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"
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

import { cn } from "@/lib/utils"
import { isMacDesktop } from "@/lib/web/helper"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useExtensionByIdOrSlug } from "@/hooks/use-extension"
import { useRouterAdapter } from "@/hooks/use-router-adapter"
import { useBlockTabClick } from "@/apps/web-app/hooks/use-block-tab-click"
import { useMblocksBatch } from "@/apps/web-app/hooks/use-mblocks-batch"
import { DEFAULT_TABS, useTabsKV } from "@/apps/web-app/hooks/use-tabs-kv"
import { useTabStore } from "@/apps/web-app/store/tabs"
import {
  TAB_CONFIG,
  useSidebarStore,
  type SidebarApp,
} from "@/apps/web-app/store/sidebar-store"
import { useSidebar } from "@/components/ui/sidebar"

import { getToday } from "@/lib/utils"
import { Button } from "../ui/button"
import { IconRenderer } from "../ui/icon-picker"

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  nodes: ListTreeIcon,
  files: FolderOpen,
  extensions: BlocksIcon,
  settings: SettingsIcon,
  today: CalendarDays,
  graft: GitBranch,
  agent: MessageSquareIcon,
}

const getIconForTab = (tabId: string) => {
  return iconMap[tabId] || (() => <BlockIcon id={tabId} />)
}

const BlockIcon = ({ id }: { id: string }) => {
  const extension = useExtensionByIdOrSlug(id)

  if (!extension) return null
  if (!extension.icon) return <ToyBrickIcon className="h-4 w-4" />
  if (extension.icon.startsWith("data:image")) {
    return (
      <img
        src={extension.icon}
        alt="block icon"
        className="h-4 w-4 rounded object-cover"
      />
    )
  }
  return <IconRenderer name={extension.icon as any} className="h-4 w-4" />
}

// Sortable tab item component for sidebar
interface SortableSidebarTabProps {
  tabId: string
  index: number
  isActive: boolean
  shortcutNum: number
  onTabClick: (tabId: string, event?: React.MouseEvent) => void
}

function SortableSidebarTab({
  tabId,
  index,
  isActive,
  shortcutNum,
  onTabClick,
}: SortableSidebarTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: tabId,
    disabled: false,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : "auto",
  }

  const Icon = getIconForTab(tabId)
  const tabConfig = TAB_CONFIG[tabId]
  const isFixedTab = DEFAULT_TABS.includes(tabId)
  const label = isFixedTab ? tabConfig?.label || tabId : tabId

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 w-8 p-0 transition-colors flex-shrink-0 relative cursor-pointer",
          isActive
            ? "bg-background text-foreground"
            : "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        onClick={(e) => onTabClick(tabId, e)}
        title={`${label} (${isMacDesktop() ? "⌘" : "Ctrl"}+${shortcutNum})`}
      >
        {/* Active tab indicator */}
        {isActive && (
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary" />
        )}
        <Icon className="h-4 w-4" />
      </Button>
    </div>
  )
}

// Sortable wrapper for BlockTab
interface SortableBlockTabProps {
  tabId: string
  index: number
  isActive: boolean
  shortcutNum: number
  blocks: Record<string, any>
  onBlockTabClick: (tabId: string, target?: "_blank" | "_self") => void
}

function SortableBlockTab({
  tabId,
  index,
  isActive,
  shortcutNum,
  blocks,
  onBlockTabClick,
}: SortableBlockTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: tabId,
    disabled: false,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1000 : "auto",
  }

  const block = blocks[tabId]
  const Icon = useMemo(() => getIconForTab(tabId), [tabId])
  const label = block?.name || tabId

  const handleClick = useCallback(
    (event: React.MouseEvent) => {
      const target =
        event.metaKey || event.ctrlKey || event.altKey ? "_blank" : undefined
      onBlockTabClick(tabId, target)
    },
    [onBlockTabClick, tabId]
  )

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 w-8 p-0 transition-colors flex-shrink-0 relative cursor-pointer",
          isActive
            ? "bg-background text-foreground"
            : "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        )}
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
        onClick={handleClick}
        title={`${label} (${isMacDesktop() ? "⌘" : "Ctrl"}+${shortcutNum})`}
      >
        {/* Active tab indicator */}
        {isActive && (
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary" />
        )}
        <Icon className="h-4 w-4" />
      </Button>
    </div>
  )
}

export const SidebarTabs = () => {
  const { t } = useTranslation()
  const { currentApp, setCurrentApp } = useSidebarStore()
  const { tabs: tabIds, reorderTabs } = useTabsKV()
  const { space } = useCurrentPathInfo()
  const { navigate } = useRouterAdapter()
  const { open } = useSidebar()

  // Get block IDs (non-fixed tabs)
  const blockIds = useMemo(
    () => tabIds.filter((id) => !DEFAULT_TABS.includes(id)),
    [tabIds]
  )

  // Batch fetch block information
  const { blocks } = useMblocksBatch(blockIds)

  // Unified block tab click handler
  const handleBlockTabClick = useBlockTabClick(blocks)

  const [sortedTabs, setSortedTabs] = useState(tabIds)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTabClick = (tabId: string, event?: React.MouseEvent) => {
    const target =
      event && (event.metaKey || event.ctrlKey || event.altKey)
        ? "_blank"
        : undefined
    const tabConfig = TAB_CONFIG[tabId]

    if (tabConfig?.isNavigation && tabConfig?.href) {
      // Navigation type tab - set current app and navigate
      setCurrentApp(tabId as SidebarApp)

      if (tabId === "today") {
        const today = getToday()
        const href = `/journals/${today}`
        const { tabs, openTab, setActiveTab, updateTab } =
          useTabStore.getState()

        if (target === "_blank") {
          openTab(href, undefined, { forceNewTab: true })
          return
        }

        // Check if today's tab (exact match) already exists
        const exactTab = tabs.find((t) => t.url === href)
        if (exactTab) {
          setActiveTab(exactTab.id)
          return
        }

        // Check if any journal tab (related) already exists to reuse
        const journalTab = tabs
          .filter((t) => t.url.startsWith("/journals/"))
          .sort((a, b) => b.lastAccessTime - a.lastAccessTime)[0]

        if (journalTab) {
          // Reuse existing journal tab and update to today
          updateTab(journalTab.id, { url: href })
          setActiveTab(journalTab.id)
        } else {
          // Create a new tab for today
          openTab(href)
        }
        return
      }

      const href = tabConfig.href
      navigate(href, { target })
    } else {
      // Regular tab or block tab
      if (DEFAULT_TABS.includes(tabId)) {
        setCurrentApp(tabId as SidebarApp)
      } else {
        // Block tab - use unified handling logic
        handleBlockTabClick(tabId, target)
      }
    }
  }

  // Keyboard shortcut handling - based on display order
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Check if Cmd/Ctrl + number key is pressed
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key >= "1" &&
        event.key <= "9"
      ) {
        event.preventDefault()

        const key = event.key
        const keyNum = parseInt(key)

        // Get all tabs in display order
        const allTabs = sortedTabs
        const itemIndex = keyNum - 1 // Convert to 0-based index

        if (itemIndex >= 0 && itemIndex < allTabs.length) {
          const tabId = allTabs[itemIndex]
          handleTabClick(tabId)
        }
      }
    },
    [navigate, space, setCurrentApp, sortedTabs, handleTabClick]
  )

  // Add keyboard event listener
  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  // Sync sorted state with external data
  useEffect(() => {
    setSortedTabs(tabIds)
  }, [tabIds])

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

      const oldIndex = sortedTabs.findIndex((id) => id === active.id)
      const newIndex = sortedTabs.findIndex((id) => id === over.id)

      if (oldIndex !== -1 && newIndex !== -1) {
        const newTabIds = arrayMove(sortedTabs, oldIndex, newIndex)
        setSortedTabs(newTabIds)
        reorderTabs(newTabIds)
      }
    },
    [sortedTabs, reorderTabs]
  )

  // Hide tabs when sidebar is collapsed
  if (!open) {
    return null
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex h-[38px] items-center px-1 border-b border-border/60 bg-muted/60 transition-all duration-200",
        {
          "pl-[76px]": isMacDesktop(),
          "pl-4": !isMacDesktop(),
        }
      )}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Draggable tabs */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        modifiers={[restrictToHorizontalAxis]}
      >
        <SortableContext
          items={sortedTabs}
          strategy={horizontalListSortingStrategy}
        >
          <div className="flex items-center gap-0.5">
            {sortedTabs.map((tabId, index) => {
              const isFixedTab = DEFAULT_TABS.includes(tabId)
              const isActive = currentApp === tabId

              if (isFixedTab) {
                // Fixed tabs - use SortableSidebarTab
                return (
                  <SortableSidebarTab
                    key={tabId}
                    tabId={tabId}
                    index={index}
                    isActive={isActive}
                    shortcutNum={index + 1}
                    onTabClick={handleTabClick}
                  />
                )
              } else {
                // Block tabs - use SortableBlockTab
                return (
                  <SortableBlockTab
                    key={tabId}
                    tabId={tabId}
                    index={index}
                    isActive={isActive}
                    shortcutNum={index + 1}
                    blocks={blocks}
                    onBlockTabClick={handleBlockTabClick}
                  />
                )
              }
            })}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
