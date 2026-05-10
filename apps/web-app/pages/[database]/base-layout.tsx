import { useEffect } from "react"
import { cn } from "@/lib/utils"
import { Loading } from "@/components/loading"
import { Nav } from "@/components/nav"
import { ScriptContainer } from "@/components/script-container"
import { SideBar } from "@/components/sidebar"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { useTabStore } from "@/apps/web-app/store/tabs"

export function DatabaseLayoutBase({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  // Listen for new tab requests from browser views
  useEffect(() => {
    console.log(
      "[BaseLayout] Setting up onNewTab listener, eidos available:",
      !!window.eidos?.browser?.view?.onNewTab
    )
    if (
      typeof window !== "undefined" &&
      window.eidos?.browser?.view?.onNewTab
    ) {
      const unsubscribe = window.eidos.browser.view.onNewTab(({ url }) => {
        console.log("[BaseLayout] Received newTab event:", url)
        // Open with the actual URL (https://...) as tab URL
        // TabContentLayout will detect this and render webview
        useTabStore.getState().openTab(url, url)
        console.log("[BaseLayout] Opened new tab for:", url)
      })
      return unsubscribe
    } else {
      console.warn("[BaseLayout] onNewTab not available")
    }
  }, [])

  const { sqlite } = useSqlite()
  const { isShareMode, currentPreviewFile } = useAppRuntimeStore()

  if (!isShareMode && !sqlite) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loading />
      </div>
    )
  }

  return (
    <div className={cn("relative flex h-screen", className)}>
      {currentPreviewFile && (
        <iframe
          className="hidden h-full w-full md:block"
          src={`/ ${currentPreviewFile.path} `}
        ></iframe>
      )}
      <ScriptContainer />
      <div className="flex h-screen w-full overflow-hidden">
        <SideBar />
        <div className="flex h-screen flex-col min-w-0 grow">
          <Nav />
          <div className="flex-1 min-h-0 overflow-hidden">
            <div className={cn("flex h-full w-full flex-col")}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
