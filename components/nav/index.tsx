import { Menu } from "lucide-react"

import { useAppStore } from "@/lib/store/app-store"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

import { BreadCrumb } from "./breadcrumb"
import { NavDropdownMenu } from "./dropdown-menu"
import { NavStatus } from "./nav-status"

export const Nav = ({ showMenu = true }: { showMenu?: boolean }) => {
  const { isSidebarOpen, setSidebarOpen } = useAppStore()

  const fixStyle =
    navigator.userAgent.toLowerCase().indexOf("windows") > -1 &&
    navigator.windowControlsOverlay.visible

  const toggleSidebar = () => {
    setSidebarOpen(!isSidebarOpen)
  }

  return (
    <div
      id="title-bar"
      className={cn(
        "flex h-8 w-full border-separate items-center justify-between",
        {
          "!mt-[5px]": fixStyle,
          fixed: navigator.windowControlsOverlay.visible,
        }
      )}
    >
      {showMenu && (
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSidebar}
          className="hidden md:block"
        >
          <Menu className="h-5 w-5" />
        </Button>
      )}

      <div className="hidden md:block">
        <BreadCrumb />
      </div>
      <div className="h-full grow" id="drag-region" />
      <div className="flex items-center justify-between self-end">
        <NavStatus />
        <NavDropdownMenu />
      </div>
    </div>
  )
}
