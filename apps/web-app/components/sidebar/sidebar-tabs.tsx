"use client"

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  BlocksIcon,
  CalendarDays,
  ChevronDownIcon,
  FolderOpen,
  GripVertical,
  ListTreeIcon,
  SettingsIcon,
  ToyBrickIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router-dom"

import { cn } from "@/lib/utils"
import { isMacDesktop } from "@/lib/web/helper"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useExtensionByIdOrSlug } from "@/hooks/use-extension"
import { useBlockTabClick } from "@/apps/web-app/hooks/use-block-tab-click"
import { useMblocksBatch } from "@/apps/web-app/hooks/use-mblocks-batch"
import { useTabsKV } from "@/apps/web-app/hooks/use-tabs-kv"
import {
  TAB_CONFIG,
  useSidebarStore,
  type SidebarApp,
} from "@/apps/web-app/store/sidebar-store"

import { SortableContainer, SortableItem } from "../table/sortable"
import { Button } from "../ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { IconRenderer } from "../ui/icon-picker"

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  nodes: ListTreeIcon,
  files: FolderOpen,
  extensions: BlocksIcon,
  settings: SettingsIcon,
  today: CalendarDays,
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

// Memoized component to render block tab with name
const BlockTab = memo(
  ({
    tabId,
    index,
    isVisible,
    blocks,
    currentApp,
    setCurrentApp,
    navigate,
    space,
    onBlockTabClick,
  }: {
    tabId: string
    index: number
    isVisible: boolean
    blocks: Record<string, any>
    currentApp: string
    setCurrentApp: (app: string) => void
    navigate: (path: string) => void
    space: string
    onBlockTabClick: (tabId: string) => void
  }) => {
    const block = blocks[tabId]
    const shortcutNum = index + 1
    const Icon = useMemo(() => getIconForTab(tabId), [tabId])
    const isActive = currentApp === tabId
    const label = block?.name || tabId

    const handleClick = useCallback(() => {
      onBlockTabClick(tabId)
    }, [onBlockTabClick, tabId])

    return (
      <div key={tabId}>
        <Button
          variant={isActive ? "secondary" : "ghost"}
          size="sm"
          className={cn(
            "h-8 w-8 p-0 transition-colors flex-shrink-0",
            isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
          )}
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          onClick={handleClick}
          title={`${label} (${isMacDesktop() ? "⌘" : "Ctrl"}+${shortcutNum})`}
        >
          <Icon className="h-4 w-4" />
        </Button>
      </div>
    )
  }
)

export const SidebarTabs = () => {
  const { t } = useTranslation()
  const { currentApp, setCurrentApp } = useSidebarStore()
  const { tabs: tabIds, addTab, removeTab, reorderTabs } = useTabsKV()
  const { space } = useCurrentPathInfo()
  const navigate = useNavigate()

  // Get block IDs (non-fixed tabs)
  const blockIds = useMemo(
    () =>
      tabIds.filter(
        (id) => !["nodes", "extensions", "today", "files"].includes(id)
      ),
    [tabIds]
  )

  // Batch fetch block information
  const { blocks } = useMblocksBatch(blockIds)

  // Unified block tab click handler
  const handleBlockTabClick = useBlockTabClick(blocks)

  const [visibleTabsCount, setVisibleTabsCount] = useState(tabIds.length)
  const [showDropdown, setShowDropdown] = useState(true) // Always show dropdown
  const [sortedTabs, setSortedTabs] = useState(tabIds)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTabClick = (tabId: string) => {
    const tabConfig = TAB_CONFIG[tabId]

    if (tabConfig?.isNavigation && tabConfig?.href) {
      // Navigation type tab - set current app and navigate
      setCurrentApp(tabId as SidebarApp)
      const href =
        tabId === "today"
          ? `/journals/${new Date().toLocaleDateString("en-CA")}`
          : tabConfig.href
      navigate(href)
    } else {
      // Regular tab or block tab
      if (tabId === "nodes" || tabId === "extensions" || tabId === "files") {
        setCurrentApp(tabId as SidebarApp)
      } else {
        // Block tab - use unified handling logic
        handleBlockTabClick(tabId)
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

  // Calculate how many tabs can fit (with dropdown always visible)
  useEffect(() => {
    let timeoutId: NodeJS.Timeout

    const calculateVisibleTabs = () => {
      if (!containerRef.current) return

      // Fixed sidebar width: 20rem = 320px
      const sidebarWidth = 320 // 20rem in pixels
      const tabWidth = 32 // w-8 = 32px
      const gap = 2 // gap-0.5 = 2px (reduced for more space)
      const dropdownWidth = 32 // dropdown button width
      const padding = isMacDesktop() ? 60 : 0 // Account for Mac padding (reduced for 6 tabs)
      const sidePadding = 8 // px-1 = 4px on each side

      const totalTabs = tabIds.length
      const availableWidth = sidebarWidth - padding - sidePadding

      // Calculate how many tabs can fit with dropdown always visible
      const dropdownSpace = dropdownWidth + gap
      const availableWidthForTabs = availableWidth - dropdownSpace

      // More precise calculation for 6 tabs with reduced gap
      // 6 tabs need: 6 * 32 + 5 * 2 = 192 + 10 = 202px
      // 7 tabs need: 7 * 32 + 6 * 2 = 224 + 12 = 236px
      const spaceFor6Tabs = 6 * tabWidth + 5 * gap // 202px
      const spaceFor7Tabs = 7 * tabWidth + 6 * gap // 236px

      let tabsWithDropdown
      if (availableWidthForTabs >= spaceFor7Tabs) {
        tabsWithDropdown = 7
      } else if (availableWidthForTabs >= spaceFor6Tabs) {
        tabsWithDropdown = 6
      } else {
        tabsWithDropdown = Math.floor(
          (availableWidthForTabs + gap) / (tabWidth + gap)
        )
      }

      // Show as many tabs as possible, but always keep dropdown
      const visibleCount = Math.max(0, Math.min(totalTabs, tabsWithDropdown))

      setVisibleTabsCount(visibleCount)
      setShowDropdown(true) // Always show dropdown
    }

    const debouncedCalculate = () => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(calculateVisibleTabs, 16) // ~60fps
    }

    calculateVisibleTabs()
    window.addEventListener("resize", debouncedCalculate)
    return () => {
      window.removeEventListener("resize", debouncedCalculate)
      clearTimeout(timeoutId)
    }
  }, [tabIds.length])

  // Sync sorted state with external data
  useEffect(() => {
    setSortedTabs(tabIds)
  }, [tabIds])

  // Create list for display - convert string IDs to SortableItem objects
  const allTabs = sortedTabs.map((id) => ({ id }))
  const visibleItems = allTabs.slice(0, visibleTabsCount)

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex h-[38px] items-center justify-between px-1 border-b border-sidebar-border transition-all duration-200",
        {
          "pl-[76px]": isMacDesktop(),
          "pl-4": !isMacDesktop(),
        }
      )}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      {/* Left side - Visible items in unified order */}
      <div className="flex items-center gap-0.5">
        {visibleItems.map((tab, index) => {
          const tabId = tab.id
          const tabConfig = TAB_CONFIG[tabId]
          const isFixedTab = ["nodes", "extensions", "today", "files"].includes(
            tabId
          )

          if (isFixedTab) {
            // Fixed tabs (nodes, extensions, today, files)
            const shortcutNum = index + 1
            const Icon = getIconForTab(tabId)
            const isActive = currentApp === tabId
            const label = tabConfig?.label || tabId

            const buttonContent = (
              <Button
                variant={isActive ? "secondary" : "ghost"}
                size="sm"
                className={cn(
                  "h-8 w-8 p-0 transition-colors flex-shrink-0",
                  isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
                )}
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                onClick={() => handleTabClick(tabId)}
                title={`${label} (${isMacDesktop() ? "⌘" : "Ctrl"}+${shortcutNum})`}
              >
                <Icon className="h-4 w-4" />
              </Button>
            )

            if (tabConfig?.isNavigation && tabConfig?.href) {
              // Special handling for today tab - go to current local date
              // en-CA = Canadian English locale, which formats dates as YYYY-MM-DD
              const href =
                tabId === "today"
                  ? `/journals/${new Date().toLocaleDateString("en-CA")}`
                  : tabConfig.href

              return (
                <Link key={tabId} to={href}>
                  {buttonContent}
                </Link>
              )
            }
            return <div key={tabId}>{buttonContent}</div>
          } else {
            // Block tabs - use BlockTab component
            return (
              <BlockTab
                key={tabId}
                tabId={tabId}
                index={index}
                isVisible={true}
                blocks={blocks}
                currentApp={currentApp}
                setCurrentApp={setCurrentApp}
                navigate={navigate}
                space={space}
                onBlockTabClick={handleBlockTabClick}
              />
            )
          }
        })}
      </div>

      {/* Right side - Overflow dropdown (aligned with + button below) */}
      {showDropdown && (
        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 transition-all duration-200 flex-shrink-0 hover:bg-sidebar-accent/50"
                style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
                title="More tabs"
              >
                <ChevronDownIcon className="h-4 w-4 transition-transform duration-200" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {/* Unified sortable list */}
              <div className="p-1">
                <SortableContainer
                  items={allTabs}
                  onReorder={(newTabs) => {
                    // Extract IDs from SortableItem objects
                    const newTabIds = newTabs.map((tab) => tab.id)
                    // Update tabs with their new order
                    setSortedTabs(newTabIds)
                    reorderTabs(newTabIds)
                  }}
                  className="space-y-1"
                  itemClassName=""
                  renderItem={(tab, index) => {
                    const tabId = tab.id
                    const shortcutNum = index + 1 // Based on display order
                    const Icon = getIconForTab(tabId)
                    const isVisible = visibleItems.some((vt) => vt.id === tabId)
                    const isFixedTab = [
                      "nodes",
                      "extensions",
                      "today",
                      "files",
                    ].includes(tabId)
                    const tabConfig = TAB_CONFIG[tabId]
                    const label = isFixedTab ? tabConfig?.label || tabId : null

                    const handleClick = () => {
                      if (tabConfig?.isNavigation && tabConfig?.href) {
                        // Navigation type tab - set current app and navigate
                        setCurrentApp(tabId as SidebarApp)
                        const href =
                          tabId === "today"
                            ? `/journals/${new Date().toLocaleDateString("en-CA")}`
                            : tabConfig.href
                        navigate(href)
                      } else {
                        // Regular tab or block tab
                        if (isFixedTab) {
                          setCurrentApp(tabId as SidebarApp)
                        } else {
                          // Block tab - use unified handling logic
                          handleBlockTabClick(tabId)
                        }
                      }
                    }

                    return (
                      <SortableItem key={tabId} id={tabId} className="">
                        <div className="flex items-center gap-1">
                          <DropdownMenuItem
                            onClick={handleClick}
                            className={cn(
                              "flex items-center gap-2 cursor-pointer flex-1 min-w-0",
                              isVisible && "bg-sidebar-accent/50"
                            )}
                            title={`${isFixedTab ? label : tabId} (${isMacDesktop() ? "⌘" : "Ctrl"}+${shortcutNum})`}
                          >
                            <GripVertical className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            <Icon className="h-4 w-4 flex-shrink-0" />
                            <span className="flex-1 min-w-0 truncate">
                              {isFixedTab
                                ? label
                                : blocks[tabId]?.name || tabId}
                            </span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {isMacDesktop() ? "⌘" : "Ctrl"}+{shortcutNum}
                            </span>
                          </DropdownMenuItem>
                        </div>
                      </SortableItem>
                    )
                  }}
                />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  )
}
