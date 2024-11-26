import { Menu, PanelRightIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { useSpaceAppStore } from "@/apps/web-app/[database]/store"
import { Button } from "@/components/ui/button"
import { isDesktopMode } from "@/lib/env"
import { useAppStore } from "@/lib/store/app-store"
import { cn } from "@/lib/utils"
import { isMac } from "@/lib/web/helper"

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
      id={isMac() ? "title-bar-mac" : "title-bar"}
      className={cn(
        "flex h-8 w-full border-separate items-center justify-between pl-2 shrink-0",
        {
          fixed: navigator.windowControlsOverlay?.visible,
          "!pl-[72px]":
            (isDesktopMode || navigator.windowControlsOverlay?.visible) &&
            isMac() &&
            !isSidebarOpen,
          "!pr-[230px]":
            navigator.windowControlsOverlay?.visible && isSidebarOpen,
          "!h-[38px]": isMac(),
          "bg-[#000]": theme === "dark",
          "bg-[#fff]": theme === "light",
          // PWA does not support css variables for theme color yet, we just use bg-white text-black for now
          // https://github.com/w3c/manifest/issues/975
          "bg-white text-black": navigator.windowControlsOverlay?.visible,
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

      <div className="hidden md:block">{children || <BreadCrumb />}</div>
      <div className="h-full grow" id="drag-region" />
      <div className="mr-3 flex items-center justify-between gap-2">
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
