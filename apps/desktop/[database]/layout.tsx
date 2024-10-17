import { Suspense, lazy, useEffect } from "react"
import { useLocalStorageState } from "ahooks"
import { Outlet, useNavigate } from "react-router-dom"

import { EidosDataEventChannelName } from "@/lib/const"
import { useAppStore } from "@/lib/store/app-store"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"
import { isMac } from "@/lib/web/helper"
import { useActivation } from "@/hooks/use-activation"
import { useEidosFileSystemManager } from "@/hooks/use-fs"
import { useSqlite } from "@/hooks/use-sqlite"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { DocExtBlockLoader } from "@/components/doc-ext-block-loader"
import { FileManager } from "@/components/file-manager"
import { KeyboardShortCuts } from "@/components/keyboard-shortcuts"
import { Loading } from "@/components/loading"
import { Nav } from "@/components/nav"
import { RightPanelNav } from "@/components/nav/right-panel-nav"
import { ScriptContainer } from "@/components/script-container"
import { SideBar } from "@/components/sidebar"

import { useLayoutInit } from "../../web-app/[database]/hook"
import { useSpaceAppStore } from "../../web-app/[database]/store"
import { ExtensionPage } from "../../web-app/extensions/page"

const WebLLM = lazy(() => import("@/components/ai-chat/webllm"))

const AIChat = lazy(() => import("@/components/ai-chat/ai-chat-new"))

export function DesktopSpaceLayout() {
  const { sqlite } = useSqlite()
  const { isShareMode, currentPreviewFile } = useAppRuntimeStore()
  const { isSidebarOpen } = useAppStore()
  const { isRightPanelOpen, currentAppIndex, apps } = useSpaceAppStore()
  const currentApp = apps[currentAppIndex]
  const navigate = useNavigate()
  const { isActivated } = useActivation()

  useLayoutInit()
  const { efsManager } = useEidosFileSystemManager()

  const [sidebarSize, setSidebarSize] = useLocalStorageState<number>(
    "sidebarSize",
    {
      defaultValue: 20,
    }
  )
  const [mainPanelSize, setMainPanelSize] = useLocalStorageState<number>(
    "mainPanelSize",
    {
      defaultValue: 60,
    }
  )
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
    window.eidos.on(EidosDataEventChannelName, handler)
    return () => {
      window.eidos.off(EidosDataEventChannelName, handler)
    }
  }, [])

  useEffect(() => {
    if (!isActivated) {
      navigate("/my-license")
    }
  }, [isActivated, navigate])

  if (!isShareMode && !sqlite) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loading />
      </div>
    )
  }

  return (
    <>
      <DocExtBlockLoader />
      <KeyboardShortCuts />
      <Suspense fallback={<div></div>}>
        <WebLLM />
      </Suspense>
      <div className={cn("relative flex w-full")}>
        {currentPreviewFile && (
          <iframe
            className="hidden h-full w-full  md:block"
            src={efsManager.getFileUrlByPath(currentPreviewFile.path)}
          ></iframe>
        )}

        <ScriptContainer />
        <div className="flex h-screen w-full flex-col">
          <ResizablePanelGroup direction="horizontal" className="h-screen">
            <ResizablePanel
              className={cn(
                "flex flex-col h-full overflow-x-hidden",
                isSidebarOpen ? "min-w-[300px]" : "w-0 min-w-0 hidden"
              )}
              defaultSize={sidebarSize}
              minSize={0}
              maxSize={30}
              onResize={(size) => setSidebarSize(size)}
            >
              <div
                className={cn("flex flex-col h-full shrink-0", {
                  "pt-8": isMac(),
                })}
              >
                <SideBar />
              </div>
            </ResizablePanel>
            <ResizableHandle className="hover:cursor-col-resize w-[2px] opacity-55" />
            <ResizablePanel
              defaultSize={
                100 - sidebarSize! - (isRightPanelOpen ? rightPanelSize! : 0)
              }
              minSize={50}
            >
              <div className="flex flex-col h-full">
                <Nav />
                <main
                  id="main-content"
                  className="z-[1] flex w-full grow flex-col overflow-y-auto"
                >
                  <Outlet />
                </main>
              </div>
            </ResizablePanel>
            {isRightPanelOpen && (
              <>
                <ResizableHandle className="hover:cursor-col-resize w-[2px] opacity-55" />
                <ResizablePanel
                  defaultSize={rightPanelSize}
                  minSize={30}
                  maxSize={50}
                  onResize={(size) => setRightPanelSize(size)}
                >
                  <div className="mx-3 flex justify-end !h-[38px] items-center shrink-0">
                    <RightPanelNav />
                  </div>
                  <div className="grow border-t h-[calc(100%-38px)] overflow-y-auto">
                    {currentApp === "chat" && (
                      <Suspense fallback={<Loading />}>
                        <AIChat />
                      </Suspense>
                    )}
                    {currentApp === "ext" && <ExtensionPage />}
                    {currentApp === "file-manager" && (
                      <Suspense fallback={<Loading />}>
                        <FileManager />
                      </Suspense>
                    )}
                  </div>
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </div>
      </div>
    </>
  )
}
