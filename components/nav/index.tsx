import { Menu } from "lucide-react"

import { Button } from "@/components/ui/button"

import { useSpaceAppStore } from "../../app/[database]/store"
import { BreadCrumb } from "./breadcrumb"
import { NavDropdownMenu } from "./dropdown-menu"
import { NavStatus } from "./nav-status"

export const Nav = () => {
  const { isSidebarOpen, setSidebarOpen } = useSpaceAppStore()

  const toggleSidebar = () => {
    setSidebarOpen(!isSidebarOpen)
  }

  return (
    <div className="flex h-8 w-full border-separate items-center justify-between">
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleSidebar}
        className="hidden md:block"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <div className="hidden md:block">
        <BreadCrumb />
      </div>
      <div className="grow" />
      <div className="flex items-center justify-between self-end">
        <NavStatus />
        <NavDropdownMenu />
      </div>
    </div>
  )
}
