"use client"

import { Suspense, lazy } from "react"
import { Menu } from "lucide-react"

import { opfsManager } from "@/lib/opfs"
// import SplitPane, { Pane } from "react-split-pane"

import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"
import { useSqlite } from "@/hooks/use-sqlite"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Loading } from "@/components/loading"
import { ScriptContainer } from "@/components/script-container"
import { SideBar } from "@/components/sidebar"

// import { FileManager } from "./files/page"
import { useLayoutInit } from "./hook"
import { Nav } from "./nav"
import { useSpaceAppStore } from "./store"

const AIChat = lazy(() => import("@/components/ai-chat/ai-chat-new"))

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
  const { isShareMode, currentPreviewFile } = useAppRuntimeStore()
  const { isSidebarOpen } = useSpaceAppStore()
  const { isAiOpen } = useSpaceAppStore()

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
      {currentPreviewFile && (
        <iframe
          className="hidden h-full w-full  md:block"
          src={opfsManager.getFileUrlByPath(currentPreviewFile.path)}
        ></iframe>
      )}

      <ScriptContainer />
      <div className="flex h-full w-full">
        {/* <div
          className={cn(
            "h-full w-[350px]  overflow-x-hidden transition-all duration-150 ease-in-out"
          )}
        >
          <FileManager />
        </div> */}
        <div
          className={cn(
            "h-full w-[350px]  overflow-x-hidden transition-all duration-150 ease-in-out",
            isSidebarOpen ? "hidden  md:block" : "w-0"
          )}
        >
          <SideBar />
        </div>
        <div className={cn("flex h-full w-auto grow flex-col lg:border-l")}>
          <div className="flex justify-between p-2 md:justify-end">
            <MobileSideBar />
            <Nav />
          </div>
          <main
            id="main-content"
            className="z-[1] flex w-full grow flex-col overflow-auto"
          >
            {children}
          </main>
        </div>
        {isAiOpen && (
          <Suspense fallback={<Loading />}>
            <AIChat />
          </Suspense>
        )}
      </div>
    </div>
  )
}
