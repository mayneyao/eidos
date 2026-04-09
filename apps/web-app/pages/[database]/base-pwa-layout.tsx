"use client"

import { cn } from "@/lib/utils"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

import { Loading } from "@/components/loading"
import { ScriptContainer } from "@/components/script-container"
import { RightPanelContent } from "@/components/nav/right-panel-content"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

import { useSpaceAppStore } from "./store"

export function DatabasePWALayoutBase({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { sqlite } = useSqlite()
  const { isShareMode } = useAppRuntimeStore()
  const { isRightPanelOpen } = useSpaceAppStore()

  if (!isShareMode && !sqlite) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loading />
      </div>
    )
  }

  return (
    <div className={cn("relative  flex h-screen", className)}>
      <ScriptContainer />
      <div className="flex h-screen w-full">
        <div className="flex h-screen flex-col min-w-0 grow">
          <ResizablePanelGroup direction="horizontal">
            <div className="flex w-full pt-[38px]" style={{ height: "100%" }}>
              <ResizablePanel minSize={50}>
                <div className={cn("flex h-full w-auto grow flex-col")}>
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
            </div>
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  )
}
