"use client"

import { Suspense, lazy } from "react"
import { Menu } from "lucide-react"

import { efsManager } from "@/lib/storage/eidos-file-system"
import { useAppStore } from "@/lib/store/app-store"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"
import { useSqlite } from "@/hooks/use-sqlite"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Loading } from "@/components/loading"
import { ScriptContainer } from "@/components/script-container"
import { SideBar } from "@/components/sidebar"

import { Nav } from "../../components/nav"
import { ExtensionPage } from "../extensions/page"
import { useLayoutInit } from "./hook"
import { useSpaceAppStore } from "./store"

const AIChat = lazy(() => import("@/components/ai-chat/ai-chat-new"))

const MobileSideBar = () => {
  const { isMobileSidebarOpen, setMobileSidebarOpen } = useSpaceAppStore()
  return (
    <Sheet open={isMobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
      <SheetTrigger className="flex md:hidden">
        <Menu className="h-6 w-6" />
      </SheetTrigger>
      <SheetContent size="content" position="left" className="w-[250px]">
        <SideBar className="p-2" />
      </SheetContent>
    </Sheet>
  )
}

export function PWALayoutBase({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { sqlite } = useSqlite()
  const { isShareMode, currentPreviewFile } = useAppRuntimeStore()
  const { isSidebarOpen } = useAppStore()
  const { isAiOpen, isExtAppOpen } = useSpaceAppStore()

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
    <div className={cn("relative flex", className)}>
      {currentPreviewFile && (
        <iframe
          className="hidden h-full w-full  md:block"
          src={efsManager.getFileUrlByPath(currentPreviewFile.path)}
        ></iframe>
      )}

      <ScriptContainer />
      <div className="flex h-screen w-full flex-col">
        <Nav />
        <div className="flex h-screen w-full pt-8">
          <div
            className={cn(
              "max-w-[300px] overflow-x-hidden transition-all duration-150 ease-in-out",
              isSidebarOpen ? "hidden  md:block" : "w-0",
              isSidebarOpen && "w-full"
            )}
          >
            <SideBar />
          </div>
          <div className={cn("flex h-full w-auto grow flex-col lg:border-l")}>
            <div className="flex justify-between md:justify-end">
              <MobileSideBar />
            </div>
            <main
              id="main-content"
              className="z-[1] flex w-full grow flex-col overflow-y-auto"
            >
              {children}
            </main>
          </div>
          {isAiOpen && (
            <Suspense fallback={<Loading />}>
              <AIChat />
            </Suspense>
          )}
          {isExtAppOpen && (
            <div className="relative flex h-full w-[24%] min-w-[475px] max-w-[500px] grow flex-col overflow-auto border-l border-l-slate-400 p-2">
              <ExtensionPage />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
