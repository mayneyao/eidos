import { Suspense, lazy, useEffect, useRef } from "react"
import { useLocalStorageState, useSize } from "ahooks"
import { Outlet, useLocation, useRoutes } from "react-router-dom"

import { EidosDataEventChannelName } from "@/lib/const"
import { cn, isStandaloneBlocksPath } from "@/lib/utils"
import { isWindowsDesktop } from "@/lib/web/helper"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { BlockApp } from "@/components/block-renderer/block-app"
import { DevTools } from "@/components/dev-tools"
import { DocExtBlockLoader } from "@/components/doc-ext-block-loader"
import { KeyboardShortCuts } from "@/components/keyboard-shortcuts"
import { Loading } from "@/components/loading"
import { Nav } from "@/components/nav"
import { NodeAppPanel } from "@/components/nav/node-app-panel"
import { RightPanelNav } from "@/components/nav/right-panel-nav"
import { TempPanel } from "@/components/nav/temp-panel"
import { ScriptContainer } from "@/components/script-container"
import { SideBar } from "@/components/sidebar"
import { TabManager } from "@/apps/web-app/components/tab-manager"
import { useActivation } from "@/apps/web-app/hooks/use-activation"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { ScriptBreadcrumb } from "@/apps/web-app/pages/[database]/extensions/components/extension-breadcrumb"
import { spaceRoutes } from "@/apps/web-app/routes"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

import { useLayoutInit } from "../../../web-app/pages/[database]/hook"
import { useSpaceAppStore } from "../../../web-app/pages/[database]/store"

const AIChat = lazy(() => import("@/components/ai-chat/ai-chat-new"))

// Component for tab-specific content (only the main content area)
function TabContentLayout() {
  const element = useRoutes(spaceRoutes)
  return (
    <div className="flex flex-col h-full min-w-0">
      <div
        id="main-content"
        className="z-[1] flex w-full grow flex-col overflow-y-auto min-w-0"
      >
        {element}
      </div>
    </div>
  )
}

export function DesktopSpaceLayout() {
  const { sqlite } = useSqlite()
  const { isShareMode, currentPreviewFile } = useAppRuntimeStore()
  const { isRightPanelOpen, currentApp, resetCurrentApp, tempPanelNode } =
    useSpaceAppStore()
  const { isActivated } = useActivation()
  const isBlocksPath = isStandaloneBlocksPath(window.location.pathname)

  const rightPanelRef = useRef<HTMLDivElement>(null)
  const size = useSize(rightPanelRef)
  const { space } = useCurrentPathInfo()

  useEffect(() => {
    resetCurrentApp()
  }, [space])

  useLayoutInit()

  const [rightPanelSize, setRightPanelSize] = useLocalStorageState<number>(
    "rightPanelSize",
    {
      defaultValue: 20,
    }
  )

  useEffect(() => {
    const dataEventChannel = new BroadcastChannel(EidosDataEventChannelName)
    const handler = (event: any, data: any) => {
      dataEventChannel.postMessage(data)
    }
    let listenerId = window.eidos.on(EidosDataEventChannelName, handler)
    return () => {
      if (listenerId) {
        window.eidos.off(EidosDataEventChannelName, listenerId)
      }
    }
  }, [])

  const isCurrentAppABlock = currentApp?.startsWith("block://")

  useEffect(() => {
    if (!isActivated) {
      window.location.href = "/my-license"
    }
  }, [isActivated])

  if (!isShareMode && !sqlite) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loading />
      </div>
    )
  }
  if (isBlocksPath) {
    return (
      <>
        <ScriptContainer />

        <div
          id="main-content"
          className="z-[1] flex w-screen h-screen grow overflow-hidden min-w-0"
        >
          <Outlet />
        </div>
      </>
    )
  }

  return (
    <>
      {/* <DocExtBlockLoader /> */}
      <KeyboardShortCuts />
      <div className={cn("relative flex w-full overflow-hidden")}>
        <ScriptContainer />
        <SideBar />
        <main className="flex min-w-0 grow">
          <ResizablePanelGroup
            direction="horizontal"
            className="h-screen w-full"
          >
            <ResizablePanel
              defaultSize={100 - (isRightPanelOpen ? rightPanelSize! : 0)}
              minSize={50}
            >
              <div className="h-full flex flex-col">
                <Nav />
                <TabManager>
                  <TabContentLayout />
                </TabManager>
              </div>
            </ResizablePanel>
            {isRightPanelOpen && (
              <>
                <ResizableHandle className="hover:cursor-col-resize w-[2px] opacity-55" />
                <ResizablePanel
                  defaultSize={rightPanelSize}
                  minSize={20}
                  maxSize={50}
                  className="min-w-[450px]"
                  onResize={(size) => setRightPanelSize(size)}
                >
                  <div
                    className={cn(
                      "px-1 flex justify-end h-[38px] items-center shrink-0 border-b border-border/60 bg-muted/60",
                      {
                        "pr-[100px]": isWindowsDesktop && isRightPanelOpen,
                      }
                    )}
                  >
                    <RightPanelNav />
                  </div>
                  <div
                    className="grow  h-[calc(100%-38px)] overflow-y-auto"
                    ref={rightPanelRef}
                  >
                    {tempPanelNode ? (
                      <TempPanel />
                    ) : (
                      <>
                        {currentApp === "chat" && (
                          <Suspense fallback={<Loading />}>
                            <AIChat />
                          </Suspense>
                        )}
                        {isCurrentAppABlock && (
                          <Suspense fallback={<Loading />}>
                            <BlockApp url={currentApp} height={size?.height} />
                          </Suspense>
                        )}
                        {currentApp && currentApp.startsWith("node://") && (
                          <NodeAppPanel />
                        )}
                      </>
                    )}
                  </div>
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </main>
      </div>
    </>
  )
}
