import { PanelRightIcon } from "lucide-react"

import { isDesktopMode } from "@/lib/env"
import { cn } from "@/lib/utils"
import { isMac, isMacDesktop, isWindowsDesktop } from "@/lib/web/helper"
import { Button } from "@/components/ui/button"
import { TabBar } from "@/apps/web-app/components/tab-manager/tab-bar"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useSpaceAppStore } from "@/apps/web-app/pages/[database]/store"
import { useAppStore } from "@/apps/web-app/store/app-store"
import { useTabStore } from "@/apps/web-app/store/tabs"

import { BreadCrumb } from "./breadcrumb"
import { NavStatus } from "./nav-status"

export const Nav = ({ children }: { children?: React.ReactNode }) => {
  const { location } = useRouterAdapter()
  const { isSidebarOpen } = useAppStore()
  const panels = useTabStore((state) => state.panels)

  const { isRightPanelOpen, setIsRightPanelOpen, currentAppIndex } =
    useSpaceAppStore()

  // Only show TabBar in Nav when there's a single panel (no split view)
  const showSingleTabBar = panels.length <= 1

  // Hide Nav entirely in multi-panel mode - each panel has its own header
  if (!showSingleTabBar) {
    return null
  }

  const handleAppChange = (index: number) => {
    if (index === currentAppIndex) {
      setIsRightPanelOpen(false)
    } else {
      setIsRightPanelOpen(true, index)
    }
  }

  return (
    <div
      className={cn(
        "flex w-full shrink-0 border-separate items-center justify-between px-1 h-[38px] border-b border-border/60 bg-muted/60",
        {
          fixed: navigator.windowControlsOverlay?.visible,
          "!pl-[72px]":
            (isDesktopMode || navigator.windowControlsOverlay?.visible) &&
            isMac() &&
            !isSidebarOpen,
          "!pr-[230px]":
            navigator.windowControlsOverlay?.visible && isSidebarOpen,
        }
      )}
    >
      {/* TabBar in Nav when single panel, otherwise just drag region */}
      <div
        className="flex-1 min-w-0 overflow-hidden flex items-center gap-2"
        style={!showSingleTabBar ? { WebkitAppRegion: "drag" } as React.CSSProperties : undefined}
        id="drag-region"
      >
        {showSingleTabBar && <TabBar />}
      </div>

      <div
        className={cn("flex items-center gap-1 shrink-0 grow-0", {
          "pr-[112px]": isWindowsDesktop && !isRightPanelOpen,
        })}
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
            <PanelRightIcon className={"h-4 w-4"} />
          </Button>
        )}
        {!isDesktopMode && (
          <Button size="xs" variant="ghost" onClick={() => handleAppChange(0)}>
            <PanelRightIcon className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
