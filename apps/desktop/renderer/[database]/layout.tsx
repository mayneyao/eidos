import { Suspense, lazy, useEffect, useRef } from "react"
import { useLocalStorageState, useSize } from "ahooks"
import { Outlet, useLocation, useNavigate, useParams } from "react-router-dom"

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
import { useActivation } from "@/apps/web-app/hooks/use-activation"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import {
  useEidosFileSystemInitialized,
  useEidosFileSystemManager,
} from "@/apps/web-app/hooks/use-fs"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { ScriptBreadcrumb } from "@/apps/web-app/pages/[database]/extensions/components/extension-breadcrumb"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

import { useLayoutInit } from "../../../web-app/pages/[database]/hook"
import { useSpaceAppStore } from "../../../web-app/pages/[database]/store"

const AIChat = lazy(() => import("@/components/ai-chat/ai-chat-new"))

export function DesktopSpaceLayout() {
  const { sqlite } = useSqlite()
  const { isShareMode, currentPreviewFile } = useAppRuntimeStore()
  const { isRightPanelOpen, currentApp, resetCurrentApp, tempPanelNode } =
    useSpaceAppStore()
  const navigate = useNavigate()
  const { isActivated } = useActivation()
  const isBlocksPath = isStandaloneBlocksPath(useLocation().pathname)

  const { scriptId } = useParams()
  const rightPanelRef = useRef<HTMLDivElement>(null)
  const size = useSize(rightPanelRef)
  const { space } = useCurrentPathInfo()

  useEffect(() => {
    resetCurrentApp()
  }, [space])

  useLayoutInit()
  useEidosFileSystemInitialized()
  const { efsManager, isLoading, error } = useEidosFileSystemManager()

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
      navigate("/my-license")
    }
  }, [isActivated, navigate])

  if (!efsManager || isLoading || error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loading />
      </div>
    )
  }
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

  // Check if we're on file-handler page and get file path
  const isFileHandlerPage = location.pathname.includes("/file-handler")
  const filePath =
    isFileHandlerPage && location.hash.startsWith("#")
      ? decodeURIComponent(location.hash.substring(1))
      : isFileHandlerPage
        ? decodeURIComponent(location.hash)
        : ""

  const showCustomNav = scriptId || filePath
  return (
    <>
      {/* <DocExtBlockLoader /> */}
      <KeyboardShortCuts />
      <div className={cn("relative flex w-full overflow-hidden")}>
        {currentPreviewFile && (
          <iframe
            className="hidden h-full w-full md:block"
            src={efsManager?.getFileUrlByPath(currentPreviewFile.path)}
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
                <Nav>
                  {
                    showCustomNav && <>
                      {scriptId && <ScriptBreadcrumb scriptIdOrSlug={scriptId} />}
                      {filePath && (
                        <div
                          className="flex items-center text-sm text-muted-foreground pointer-events-none select-none max-w-full overflow-hidden"
                          title={filePath}
                        >
                          <span className="truncate block">{filePath}</span>
                        </div>
                      )}
                    </>
                  }
                </Nav>
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
                  minSize={20}
                  maxSize={50}
                  className="min-w-[450px]"
                  onResize={(size) => setRightPanelSize(size)}
                >
                  <div
                    className={cn(
                      "px-1 flex justify-end h-[38px] items-center shrink-0 border-b",
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
