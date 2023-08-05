"use client"

import { Menu } from "lucide-react"

// import SplitPane, { Pane } from "react-split-pane"

import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"
import { useSqlite } from "@/hooks/use-sqlite"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Loading } from "@/components/loading"
import { SideBar } from "@/components/sidebar"

import { useLayoutInit } from "./hook"
import { Nav } from "./nav"
import { useSpaceAppStore } from "./store"

const MobileSideBar = () => {
  const { isMobileSidebarOpen, setMobileSidebarOpen } = useSpaceAppStore()
  return (
    <Sheet open={isMobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
      <SheetTrigger className="flex md:hidden">
        <Menu className="h-6 w-6" />
      </SheetTrigger>
      <SheetContent size="content" position="left" className="w-[300px]">
        <SideBar className="p-2" />
      </SheetContent>
    </Sheet>
  )
}

export function DatabaseLayoutBase({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { sqlite } = useSqlite()
  const { isShareMode, currentPreviewFileUrl } = useAppRuntimeStore()
  const { isSidebarOpen } = useSpaceAppStore()

  // event listen should be in useLayoutInit, and just listen once
  useLayoutInit()
  if (!isShareMode && !sqlite) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loading />
      </div>
    )
  }
  // when chat is open  2:7:3
  // when chat is close 2:10
  return (
    <div className={cn("relative  flex h-screen ", className)}>
      {currentPreviewFileUrl && (
        <iframe
          className="hidden h-full w-full  md:block"
          src={currentPreviewFileUrl}
        ></iframe>
      )}

      <div className="flex h-full w-full">
        <div
          className={cn(
            "h-full w-[350px] grow overflow-x-hidden transition-all duration-150 ease-in-out",
            isSidebarOpen ? "hidden  md:block" : "w-0"
          )}
        >
          <SideBar />
        </div>
        <div className={cn("flex h-full w-full grow flex-col lg:border-l")}>
          <div className="flex justify-between p-2 md:justify-end">
            <MobileSideBar />
            <Nav />
          </div>
          <main
            id="main-content"
            className="z-[1] flex w-full grow overflow-auto"
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
