import { isDesktopMode } from "@/lib/env"
import { cn } from "@/lib/utils"
import { isMac, isWindowsDesktop } from "@/lib/web/helper"
import { TabBar } from "@/apps/web-app/components/tab-manager/tab-bar"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useAppStore } from "@/apps/web-app/store/app-store"
import { useTabStore } from "@/apps/web-app/store/tabs"

export const Nav = ({ children }: { children?: React.ReactNode }) => {
  const { location } = useRouterAdapter()
  const { isSidebarOpen } = useAppStore()
  const panels = useTabStore((state) => state.panels)

  // Only show TabBar in Nav when there's a single panel (no split view)
  const showSingleTabBar = panels.length <= 1

  // Hide Nav entirely in multi-panel mode - each panel has its own header
  if (!showSingleTabBar) {
    return null
  }

  return (
    <div
      className={cn(
        "flex w-full shrink-0 border-separate items-center justify-between px-1 h-[38px] border-b border-border/60 bg-muted/60",
        {
          "fixed top-0 left-0 z-50": navigator.windowControlsOverlay?.visible,
          "!pl-[72px]":
            (isDesktopMode || navigator.windowControlsOverlay?.visible) &&
            isMac() &&
            !isSidebarOpen,
          "!pr-[230px]":
            navigator.windowControlsOverlay?.visible && isSidebarOpen,
          "pr-[112px]": isWindowsDesktop,
        }
      )}
    >
      {/* TabBar in Nav when single panel, otherwise just drag region */}
      <div
        className="flex-1 min-w-0 overflow-hidden flex items-center gap-2"
        id="drag-region"
      >
        {showSingleTabBar && <TabBar isFirstPanel isLastPanel />}
      </div>
    </div>
  )
}
