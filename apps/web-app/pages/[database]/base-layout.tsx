import { cn } from "@/lib/utils"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { Loading } from "@/components/loading"
import { Nav } from "@/components/nav"
import { ScriptContainer } from "@/components/script-container"
import { SideBar } from "@/components/sidebar"
import { RightPanelContent } from "@/components/nav/right-panel-content"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useAppStore } from "@/apps/web-app/store/app-store"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { useTabStore } from "@/apps/web-app/store/tabs"

import { useSpaceAppStore } from "./store"

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
  const {
    isRightPanelOpen,
    isExtAppOpen,
    currentAppIndex,
    apps,
    tempPanelNode,
  } = useSpaceAppStore()
  const currentApp = apps[currentAppIndex]

  // Check if Nav is visible (only for single panel mode)
  const panels = useTabStore((state) => state.panels)
  const isNavVisible = panels.length <= 1
  const contentHeight = isNavVisible ? "calc(100vh - 38px)" : "100vh"

  if (!isShareMode && !sqlite) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loading />
      </div>
    )
  }

  return (
    <div className={cn("relative  flex h-screen", className)}>
      {currentPreviewFile && (
        <iframe
          className="hidden h-full w-full  md:block"
          src={`/ ${currentPreviewFile.path} `}
        ></iframe>
      )}
      <ScriptContainer />
      <div className="flex h-screen w-full overflow-hidden">
        <SideBar />
        <div className="flex h-screen flex-col min-w-0 grow">
          <Nav />
          <ResizablePanelGroup
            direction="horizontal"
            className="flex-1 min-h-0"
          >
            <ResizablePanel minSize={50}>
              <div className={cn("flex h-full w-full flex-col")}>
                {children}
              </div>
            </ResizablePanel>
            {isRightPanelOpen && (
              <>
                <ResizableHandle className="hover:cursor-col-resize w-[2px] opacity-55" />
                <ResizablePanel
                  className="min-w-[400px]"
                  defaultSize={isRightPanelOpen ? 20 : 0}
                  minSize={20}
                  maxSize={50}
                >
                  <div className="h-full shrink-0 overflow-x-hidden">
                    <RightPanelContent />
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
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  )
}
