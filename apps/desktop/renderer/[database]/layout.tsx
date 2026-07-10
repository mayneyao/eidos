import { useEffect, useRef, useState, useCallback } from "react"
import { useTabStore } from "@/apps/web-app/store/tabs"
import { useSize } from "ahooks"
import { Outlet, useRoutes, useParams, useLocation } from "react-router-dom"

import { EidosDataEventChannelName } from "@/lib/const"
import { cn, isStandaloneBlocksPath } from "@/lib/utils"
import { KeyboardShortCuts } from "@/components/keyboard-shortcuts"
import { Loading } from "@/components/loading"
import { Nav } from "@/components/nav"
import { ScriptContainer } from "@/components/script-container"
import { SideBar } from "@/components/sidebar"
import { FileSpaceSidebar } from "@/apps/web-app/components/file-space/sidebar"
import { TabManager } from "@/apps/web-app/components/tab-manager"
import { useTabContext } from "@/apps/web-app/components/tab-manager/tab-context"
import { useCurrentSpace } from "@/apps/web-app/hooks/use-current-space"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { fileSpaceRoutes } from "@/apps/web-app/file-space-routes"
import { spaceRoutes } from "@/apps/web-app/routes"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { LandingPage } from "@/apps/web-app/pages/page"
import { IntegratedTerminal } from "@/components/integrated-terminal"

import { useLayoutInit } from "../../../web-app/pages/[database]/hook"
import { useSpaceAppStore } from "../../../web-app/pages/[database]/store"
import { useRelayHandler } from "@/apps/web-app/hooks/use-relay-handler"
import { TabErrorBoundary } from "../TabErrorBoundary"
import { Webview } from "@/apps/web-app/components/webview"

// Component for tab-specific content (only the main content area)
function TabContentLayout() {
  const { tabId } = useTabContext()
  const { currentSpace } = useCurrentSpace()
  const element = useRoutes(
    currentSpace?.mode === "file" ? fileSpaceRoutes : spaceRoutes
  )
  const location = useLocation()

  // Get the actual tab URL from store to check if it's an external URL
  const tabUrl = useTabStore(
    (state) => state.tabs.find((t) => t.id === tabId)?.url
  )

  // Check if this is an external URL (http/https)
  const isExternalUrl = !!tabUrl && /^https?:\/\//i.test(tabUrl)

  return (
    <div className="flex flex-col h-full min-w-0">
      <div
        id="main-content"
        className="z-[1] flex w-full grow flex-col overflow-y-auto min-w-0"
      >
        <TabErrorBoundary tabId={tabId}>
          {isExternalUrl ? <Webview url={tabUrl!} /> : element}
        </TabErrorBoundary>
      </div>
    </div>
  )
}

export function DesktopSpaceLayout() {
  const { currentSpace, isLoading } = useCurrentSpace()

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loading />
      </div>
    )
  }
  if (!currentSpace) return <LandingPage />
  if (currentSpace.mode === "file") {
    return <DesktopFileSpaceLayout />
  }
  return <DesktopLegacySpaceLayout />
}

function DesktopFileSpaceLayout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <FileSpaceSidebar />
      <main className="flex h-screen min-w-0 flex-1 flex-col">
        <Nav />
        <TabManager>
          <TabContentLayout />
        </TabManager>
      </main>
    </div>
  )
}

function DesktopLegacySpaceLayout() {
  const { sqlite } = useSqlite()
  const { isShareMode, isTerminalVisible, setIsTerminalVisible } =
    useAppRuntimeStore()
  const { resetCurrentApp } = useSpaceAppStore()
  const isBlocksPath = isStandaloneBlocksPath(window.location.pathname)
  const [spacePath, setSpacePath] = useState<string>("")

  const params = useParams()
  const { space: spaceFromPath } = useCurrentPathInfo()

  // Use space from path info or from route params
  const space = spaceFromPath || params.database

  // Get space path for terminal
  useEffect(() => {
    const getSpacePath = async () => {
      try {
        // Try to get space by ID first (most reliable)
        if (space) {
          const spaceInfo = await window.eidos?.spaceMgmt?.getSpaceById(space)
          if (spaceInfo?.path) {
            setSpacePath(spaceInfo.path)
            return
          }
        }

        // Fallback: try get-current-space
        const currentSpace = await window.eidos?.spaceMgmt?.getCurrentSpace()
        if (currentSpace?.path) {
          setSpacePath(currentSpace.path)
          return
        }

        // Fallback: try to construct from dataFolder (legacy)
        if (space) {
          const dataFolder = await window.eidos?.config?.get("dataFolder")
          if (dataFolder) {
            const fullPath = `${dataFolder}/${space}`
            setSpacePath(fullPath)
            return
          }
        }
      } catch (e) {
        console.error("[Layout] Failed to get space path:", e)
      }
    }
    getSpacePath()
  }, [space, params.database])

  useEffect(() => {
    resetCurrentApp()
  }, [space])

  // Listen for new tab requests from browser views
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.eidos?.browser?.view?.onNewTab
    ) {
      const unsubscribe = window.eidos.browser.view.onNewTab(({ url }) => {
        // Open with the actual URL (https://...) as tab URL
        // TabContentLayout will detect this and render webview
        useTabStore.getState().openTab(url, url)
      })
      return unsubscribe
    } else {
      console.warn("[DesktopLayout] onNewTab not available")
    }
  }, [])

  useLayoutInit()
  useRelayHandler()

  const toggleTerminal = useCallback(() => {
    setIsTerminalVisible(!isTerminalVisible)
  }, [isTerminalVisible, setIsTerminalVisible])

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
          <div className="h-screen w-full flex flex-col">
            <Nav />
            <TabManager>
              <TabContentLayout />
            </TabManager>
            {/* Terminal Panel - at bottom of main content area */}
            <IntegratedTerminal
              isVisible={isTerminalVisible}
              onToggleVisibility={toggleTerminal}
              spacePath={spacePath}
            />
          </div>
        </main>
      </div>
    </>
  )
}
