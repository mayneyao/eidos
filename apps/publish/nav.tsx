import { Menu } from "lucide-react"
import { useTheme } from "next-themes"
import { Link } from "react-router-dom"

import { useAppStore } from "@/lib/store/app-store"
import { cn } from "@/lib/utils"
import { isMac } from "@/lib/web/helper"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { BreadCrumb } from "@/components/nav/breadcrumb"

export const Nav = ({ showMenu = true }: { showMenu?: boolean }) => {
  const { isSidebarOpen, setSidebarOpen } = useAppStore()

  const { theme } = useTheme()
  const toggleSidebar = () => {
    setSidebarOpen(!isSidebarOpen)
  }

  return (
    <div
      id="title-bar"
      className={cn(
        "flex h-8 w-full border-separate items-center justify-between pl-2",
        {
          fixed: navigator.windowControlsOverlay?.visible,
          "!h-[38px]": isMac(),
          "bg-[#000]": theme === "dark",
          "bg-[#fff]": theme === "light",
          // PWA does not support css variables for theme color yet, we just use bg-white text-black for now
          // https://github.com/w3c/manifest/issues/975
          // "bg-white text-black": navigator.windowControlsOverlay?.visible,
        }
      )}
    >
      {showMenu && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                onClick={toggleSidebar}
                // className="hidden md:block"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {isSidebarOpen ? "Close Sidebar" : "Open Sidebar"} <br />
                <span className={"ml-auto text-xs tracking-widest opacity-60"}>
                  ctrl/cmd + \
                </span>
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      <div className="hidden md:block">
        <BreadCrumb />
      </div>
      <div className="h-full grow" id="drag-region" />
      <div className="mr-3 flex items-center justify-between gap-2">
        <Link to="https://eidos.space?home=1" target="_blank">
          <Button size="xs" variant="outline">
            Try Eidos
          </Button>
        </Link>
      </div>
    </div>
  )
}
