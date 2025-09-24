"use client"

import { useEffect, useRef, useState } from "react"
import {
  BlocksIcon,
  CalendarDays,
  ChevronDownIcon,
  FileBoxIcon,
  ListTreeIcon,
  SettingsIcon,
  ToyBrickIcon,
} from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link, useNavigate } from "react-router-dom"

import { cn } from "@/lib/utils"
import { isMac } from "@/lib/web/helper"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useExtensionByIdOrSlug } from "@/hooks/use-extension"
import { useFavBlocks } from "@/apps/web-app/hooks/use-fav-blocks"
import {
  useSidebarStore,
  type SidebarApp,
} from "@/apps/web-app/store/sidebar-store"

import { Button } from "../ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu"
import { IconRenderer } from "../ui/icon-picker"

const iconMap = {
  nodes: ListTreeIcon,
  files: FileBoxIcon,
  extensions: BlocksIcon,
  settings: SettingsIcon,
  everyday: CalendarDays,
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

export const SidebarTabs = () => {
  const { t } = useTranslation()
  const { currentApp, setCurrentApp, tabs } = useSidebarStore()
  const { space } = useCurrentPathInfo()
  const { favBlocks } = useFavBlocks()
  const navigate = useNavigate()

  const [visibleTabsCount, setVisibleTabsCount] = useState(
    tabs.length + favBlocks.length
  )
  const [showDropdown, setShowDropdown] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTabClick = (tab: (typeof tabs)[0]) => {
    if (!tab.isNavigation) {
      setCurrentApp(tab.id as SidebarApp)
    }
  }

  const handleBlockClick = (blockId: string) => {
    // Navigate to the block page using React Router
    navigate(`/${space}/blocks/${blockId}`)
  }

  // Calculate how many tabs can fit
  useEffect(() => {
    const calculateVisibleTabs = () => {
      if (!containerRef.current) return

      const containerWidth = containerRef.current.offsetWidth
      const tabWidth = 32 // w-8 = 32px
      const gap = 4 // gap-1 = 4px
      const dropdownWidth = 32 // dropdown button width

      const totalTabs = tabs.length + favBlocks.length
      const availableWidth = containerWidth - (isMac() ? 80 : 0) // Account for Mac padding

      // Calculate how many tabs can fit
      let canFit = Math.floor((availableWidth + gap) / (tabWidth + gap))

      // If we need dropdown, reserve space for it
      if (canFit < totalTabs) {
        canFit = Math.max(0, canFit - 1) // Reserve space for dropdown
      }

      setVisibleTabsCount(Math.min(canFit, totalTabs))
      setShowDropdown(canFit < totalTabs)
    }

    calculateVisibleTabs()
    window.addEventListener("resize", calculateVisibleTabs)
    return () => window.removeEventListener("resize", calculateVisibleTabs)
  }, [tabs.length, favBlocks.length])

  const visibleTabs = tabs.slice(0, visibleTabsCount)
  const visibleBlocks = favBlocks.slice(
    0,
    Math.max(0, visibleTabsCount - tabs.length)
  )
  const overflowTabs = tabs.slice(visibleTabsCount)
  const overflowBlocks = favBlocks.slice(
    Math.max(0, visibleTabsCount - tabs.length)
  )

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex h-[38px] items-center gap-1 px-2 border-b border-sidebar-border",
        {
          "pl-[5rem]": isMac(),
        }
      )}
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Visible regular tabs */}
      {visibleTabs.map((tab) => {
        const Icon = iconMap[tab.id]
        const isActive = currentApp === tab.id

        const buttonContent = (
          <Button
            variant={isActive ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "h-8 w-8 p-0 transition-colors flex-shrink-0",
              isActive && "bg-sidebar-accent text-sidebar-accent-foreground"
            )}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onClick={() => handleTabClick(tab)}
            title={tab.label}
          >
            <Icon className="h-4 w-4" />
          </Button>
        )

        if (tab.isNavigation && tab.href) {
          // Special handling for everyday tab - go to current local date
          // en-CA = Canadian English locale, which formats dates as YYYY-MM-DD
          const href =
            tab.id === "everyday"
              ? `/${space}/everyday/${new Date().toLocaleDateString("en-CA")}`
              : `/${space}${tab.href}`

          return (
            <Link key={tab.id} to={href}>
              {buttonContent}
            </Link>
          )
        }
        return <div key={tab.id}>{buttonContent}</div>
      })}

      {/* Visible favorite blocks as tabs */}
      {visibleBlocks.map((block) => (
        <Button
          key={`block-${block.id}`}
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 transition-colors flex-shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          onClick={() => handleBlockClick(block.id)}
          title={block.name || block.id}
        >
          <BlockIcon id={block.id} />
        </Button>
      ))}

      {/* Overflow dropdown */}
      {showDropdown && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 transition-colors flex-shrink-0"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              title="More tabs"
            >
              <ChevronDownIcon className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {/* Overflow regular tabs */}
            {overflowTabs.map((tab) => {
              const Icon = iconMap[tab.id]
              const handleClick = () => {
                if (tab.isNavigation && tab.href) {
                  // Special handling for everyday tab - go to current local date
                  // en-CA = Canadian English locale, which formats dates as YYYY-MM-DD
                  const href =
                    tab.id === "everyday"
                      ? `/${space}/everyday/${new Date().toLocaleDateString("en-CA")}`
                      : `/${space}${tab.href}`
                  navigate(href)
                } else {
                  handleTabClick(tab)
                }
              }

              return (
                <DropdownMenuItem
                  key={tab.id}
                  onClick={handleClick}
                  className="flex items-center gap-2 whitespace-nowrap"
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </DropdownMenuItem>
              )
            })}
            {/* Overflow favorite blocks */}
            {overflowBlocks.map((block) => (
              <DropdownMenuItem
                key={`overflow-block-${block.id}`}
                onClick={() => handleBlockClick(block.id)}
                className="flex items-center gap-2 whitespace-nowrap"
              >
                <div className="h-4 w-4 flex-shrink-0">
                  <BlockIcon id={block.id} />
                </div>
                <span className="truncate">{block.name || block.id}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
