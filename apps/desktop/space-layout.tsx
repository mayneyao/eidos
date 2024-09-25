import { Suspense, lazy, useEffect } from "react"
import { Outlet, useNavigate } from "react-router-dom"

import { EidosDataEventChannelName } from "@/lib/const"
import { useAppStore } from "@/lib/store/app-store"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"
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

import { useLayoutInit } from "../web-app/[database]/hook"
import { useSpaceAppStore } from "../web-app/[database]/store"
import { ExtensionPage } from "../web-app/extensions/page"
import { useDataFolderCheck } from "./hooks"

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
  const isDataFolderSet = useDataFolderCheck()

  useLayoutInit()
  const { efsManager } = useEidosFileSystemManager()

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
    if (!isDataFolderSet) {
      navigate("/settings/storage")
    }
  }, [isDataFolderSet, navigate])

  useEffect(() => {
    if (!isActivated) {
      // navigate to home page
      navigate("/")
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
              defaultSize={20}
              minSize={0}
              maxSize={30}
            >
              <div className="flex flex-col h-full shrink-0 pt-8">
                <SideBar />
              </div>
            </ResizablePanel>
            <ResizableHandle className="hover:cursor-col-resize w-[2px] opacity-55" />
            <ResizablePanel defaultSize={60} minSize={50}>
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
              <ResizableHandle className="hover:cursor-col-resize w-[2px] opacity-55" />
            )}
            <ResizablePanel
              className={cn(
                "flex flex-col h-full overflow-x-hidden",
                isRightPanelOpen ? "min-w-[400px]" : "w-0 min-w-0 hidden"
              )}
              defaultSize={isRightPanelOpen ? 40 : 0}
              minSize={0}
              maxSize={50}
            >
              <div className="mx-3 flex justify-end !h-[38px] items-center shrink-0">
                <RightPanelNav />
              </div>
              <div className="grow border-t h-full overflow-y-auto">
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
          </ResizablePanelGroup>
        </div>
      </div>
    </>
  )
}
