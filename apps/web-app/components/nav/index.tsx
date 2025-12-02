import { Menu, PanelRightIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { isDesktopMode } from "@/lib/env"
import { cn } from "@/lib/utils"
import { isMac, isWindowsDesktop } from "@/lib/web/helper"
import { Button } from "@/components/ui/button"
import { TabBar } from "@/apps/web-app/components/tab-manager/tab-bar"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import { useSpaceAppStore } from "@/apps/web-app/pages/[database]/store"
import { useAppStore } from "@/apps/web-app/store/app-store"

import { BreadCrumb } from "./breadcrumb"
import { NavDropdownMenu } from "./dropdown-menu"
import { NavStatus } from "./nav-status"

export const Nav = ({
  showMenu = true,
  children,
}: {
  showMenu?: boolean
  children?: React.ReactNode
}) => {
  const { location } = useRouterAdapter()
  const searchParams = new URLSearchParams(location.search)
  const { isSidebarOpen, setSidebarOpen } = useAppStore()

  const {
    isRightPanelOpen,
    setIsRightPanelOpen,
    isExtAppOpen,
    setIsExtAppOpen,
    apps,
    currentAppIndex,
    setCurrentAppIndex,
  } = useSpaceAppStore()

  const handleAppChange = (index: number) => {
    if (index === currentAppIndex) {
      setIsRightPanelOpen(false)
    } else {
      setIsRightPanelOpen(true, index)
    }
  }

  const { theme } = useTheme()
  const toggleSidebar = () => {
    setSidebarOpen(!isSidebarOpen)
  }

  return (
    <div
      className={cn(
        "flex w-full shrink-0 border-separate items-center justify-between px-1 h-[38px] border-b",
        {
          fixed: navigator.windowControlsOverlay?.visible,
          "!pl-[72px]":
            (isDesktopMode || navigator.windowControlsOverlay?.visible) &&
            isMac() &&
            !isSidebarOpen,
          "!pr-[230px]":
            navigator.windowControlsOverlay?.visible && isSidebarOpen,
          // // fix title bar height for windows
          // "pt-[6px]": isWindowsDesktop,
          // "bg-primary": theme === "dark",
          // "bg-background": theme === "light",
          // PWA does not support css variables for theme color yet, we just use bg-white text-black for now
          // https://github.com/w3c/manifest/issues/975
          // "bg-white text-black": navigator.windowControlsOverlay?.visible,
        }
      )}
    >
      {showMenu && (
        <Button
          variant="ghost"
          size="xs"
          onClick={toggleSidebar}
          // className="hidden md:block"
        >
          <Menu className="h-5 w-5" />
        </Button>
      )}

      {/* Integrated TabBar with drag-region */}
      <div className="flex-1 min-w-0 overflow-hidden flex items-center gap-2">
        <TabBar />
        <div className="hidden md:block min-w-0 overflow-hidden">
          {children || <BreadCrumb />}
        </div>
      </div>

      <div
        className={cn("flex items-center gap-1 shrink-0 grow-0", {
          "pr-[100px]": isWindowsDesktop && !isRightPanelOpen,
        })}
      >
        <NavStatus />
        <NavDropdownMenu />
        {isDesktopMode && !isRightPanelOpen && (
          <Button size="xs" variant="ghost" onClick={() => handleAppChange(0)}>
            <PanelRightIcon className="h-5 w-5" />
          </Button>
        )}
        {!isDesktopMode && (
          <Button size="xs" variant="ghost" onClick={() => handleAppChange(0)}>
            <PanelRightIcon className="h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  )
}
