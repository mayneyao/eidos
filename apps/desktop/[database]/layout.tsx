import { useLocalStorageState } from "ahooks"
import { Suspense, lazy, useEffect } from "react"
import { Outlet, useLocation, useNavigate } from "react-router-dom"

import { BlockApp } from "@/components/block-renderer/block-app"
import { DocExtBlockLoader } from "@/components/doc-ext-block-loader"
import { KeyboardShortCuts } from "@/components/keyboard-shortcuts"
import { Loading } from "@/components/loading"
import { Nav } from "@/components/nav"
import { RightPanelNav } from "@/components/nav/right-panel-nav"
import { ScriptContainer } from "@/components/script-container"
import { SideBar } from "@/components/sidebar"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { useActivation } from "@/hooks/use-activation"
import { useEidosFileSystemManager } from "@/hooks/use-fs"
import { useSqlite } from "@/hooks/use-sqlite"
import { EidosDataEventChannelName } from "@/lib/const"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn, isStandaloneBlocksPath } from "@/lib/utils"

import { useLayoutInit } from "../../web-app/[database]/hook"
import { useAppsStore, useSpaceAppStore } from "../../web-app/[database]/store"

const WebLLM = lazy(() => import("@/components/ai-chat/webllm"))

const AIChat = lazy(() => import("@/components/ai-chat/ai-chat-new"))

export function DesktopSpaceLayout() {
  const { sqlite } = useSqlite()
  const { isShareMode, currentPreviewFile } = useAppRuntimeStore()
  const { isRightPanelOpen, currentAppIndex } = useSpaceAppStore()
  const { apps } = useAppsStore()
  const currentApp = apps[currentAppIndex]
  const navigate = useNavigate()
  const { isActivated } = useActivation()
  const isBlocksPath = isStandaloneBlocksPath(useLocation().pathname)

  useLayoutInit()
  const { efsManager } = useEidosFileSystemManager()

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

  const isCurrentAppABlock = currentApp?.startsWith("block://")

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
      <DocExtBlockLoader />
      <KeyboardShortCuts />
      <Suspense fallback={<div></div>}>
        <WebLLM />
      </Suspense>
      <div className={cn("relative flex w-full overflow-hidden")}>
        {currentPreviewFile && (
          <iframe
            className="hidden h-full w-full md:block"
            src={efsManager.getFileUrlByPath(currentPreviewFile.path)}
          ></iframe>
        )}

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
              <div className="flex flex-col h-full min-w-0">
                <Nav />
                <div
                  id="main-content"
                  className="z-[1] flex w-full grow flex-col overflow-y-auto min-w-0"
                >
                  <Outlet />
                </div>
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
                    {isCurrentAppABlock && (
                      <Suspense fallback={<Loading />}>
                        <BlockApp url={currentApp} />
                      </Suspense>
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
