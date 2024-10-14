import { motion } from "framer-motion"
import { Suspense, lazy } from "react"

import { FileManager } from "@/components/file-manager"
import { Loading } from "@/components/loading"
import { ScriptContainer } from "@/components/script-container"
import { SideBar } from "@/components/sidebar"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { useEidosFileSystemManager } from "@/hooks/use-fs"
import { useSqlite } from "@/hooks/use-sqlite"
import { useAppStore } from "@/lib/store/app-store"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"

import { Nav } from "../../../components/nav"
import { useSpaceAppStore } from "./store"

const AIChat = lazy(() => import("@/components/ai-chat/ai-chat-new"))

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
  const { isRightPanelOpen, isExtAppOpen, currentAppIndex, apps } =
    useSpaceAppStore()
  const currentApp = apps[currentAppIndex]
  const { efsManager } = useEidosFileSystemManager()
  if (!isShareMode && !sqlite) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loading />
      </div>
    )
  }
  const sidebarVariants = {
    open: { x: 0 },
    closed: { x: "-100%", width: 0 },
  }

  return (
    <div className={cn("relative  flex h-screen", className)}>
      {currentPreviewFile && (
        <iframe
          className="hidden h-full w-full  md:block"
          src={efsManager.getFileUrlByPath(currentPreviewFile.path)}
        ></iframe>
      )}

      <ScriptContainer />
      <div className="flex h-screen w-full flex-col">
        <div className="flex h-screen flex-col">
          <Nav />
          <ResizablePanelGroup direction="horizontal">
            <div
              className={cn("flex w-full", {})}
              style={{ height: "calc(100vh - 38px)" }}
            >
              <motion.div
                className={cn("h-full w-[300px] shrink-0 overflow-x-hidden")}
                animate={isSidebarOpen ? "open" : "closed"}
                variants={sidebarVariants}
                transition={{ type: "tween", duration: 0.2 }}
              >
                <SideBar />
              </motion.div>
              <ResizablePanel minSize={50}>
                <div
                  className={cn("flex h-full w-auto grow flex-col border-l")}
                >
                  <main
                    id="main-content"
                    className="z-[1] flex w-full grow flex-col overflow-y-auto"
                  >
                    {children}
                  </main>
                </div>
              </ResizablePanel>
              {isRightPanelOpen && (
                <>
                  <ResizableHandle className="hover:cursor-col-resize w-[2px] opacity-55" />
                  <ResizablePanel
                    className={cn("min-w-[400px]")}
                    defaultSize={isRightPanelOpen ? 20 : 0}
                    minSize={20}
                    maxSize={50}
                  >
                    <div className={cn("h-full shrink-0 overflow-x-hidden")}>
                      {currentApp === "chat" && (
                        <Suspense fallback={<Loading />}>
                          <AIChat />
                        </Suspense>
                      )}
                      {currentApp === "file-manager" && (
                        <Suspense fallback={<Loading />}>
                          <FileManager />
                        </Suspense>
                      )}
                    </div>
                  </ResizablePanel>
                </>
              )}
              {/* {isExtAppOpen && (
                  <>
                    <ResizableHandle withHandle />
                    <ResizablePanel
                      className="min-w-[400px]"
                      defaultSize={30}
                      minSize={30}
                      maxSize={isAiOpen ? 40 : 50}
                    >
                      <div className="relative flex h-full  w-[475px] shrink-0  flex-col overflow-auto p-2">
                        <ExtensionPage />
                      </div>
                    </ResizablePanel>
                  </>
                )} */}
            </div>
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  )
}
