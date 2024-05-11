import { Menu } from "lucide-react"
import { Suspense, lazy } from "react"

import { Loading } from "@/components/loading"
import { ScriptContainer } from "@/components/script-container"
import { SideBar } from "@/components/sidebar"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { useSqlite } from "@/hooks/use-sqlite"
import { efsManager } from "@/lib/storage/eidos-file-system"
import { useAppStore } from "@/lib/store/app-store"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"

import { Nav } from "../../components/nav"
import { ExtensionPage } from "../extensions/page"
import { useSpaceAppStore } from "./store"

const AIChat = lazy(() => import("@/components/ai-chat/ai-chat-new"))

const MobileSideBar = () => {
  const { isMobileSidebarOpen, setMobileSidebarOpen } = useSpaceAppStore()
  return (
    <Sheet open={isMobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
      <SheetTrigger className="mx-2 flex items-center md:hidden">
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
  const { isSidebarOpen } = useAppStore()
  const { isAiOpen, isExtAppOpen } = useSpaceAppStore()

  if (!isShareMode && !sqlite) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loading />
      </div>
    )
  }
  return (
    <div className={cn("relative  flex h-screen ", className)}>
      {currentPreviewFile && (
        <iframe
          className="hidden h-full w-full  md:block"
          src={efsManager.getFileUrlByPath(currentPreviewFile.path)}
        ></iframe>
      )}

      <ScriptContainer />
      <div className="flex h-full w-full">
        <div
          className={cn(
            "h-full max-w-[350px] overflow-x-hidden transition-all duration-150 ease-in-out",
            isSidebarOpen ? "hidden  md:block" : "w-0",
            isSidebarOpen && "w-full"
          )}
        >
          <SideBar />
        </div>
        <div className={cn("flex h-full w-auto grow flex-col lg:border-l")}>
          <div className="flex justify-between md:justify-end">
            <MobileSideBar />
            <Nav />
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
          <div className="relative flex h-screen w-[24%] min-w-[475px] max-w-[500px] grow flex-col overflow-auto border-l border-l-slate-400 p-2">
            <ExtensionPage />
          </div>
        )}
      </div>
    </div>
  )
}
