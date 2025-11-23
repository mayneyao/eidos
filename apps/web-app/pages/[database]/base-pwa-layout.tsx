"use client"

import { Suspense, lazy } from "react"

import { cn } from "@/lib/utils"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"

import { Loading } from "@/components/loading"
import { ScriptContainer } from "@/components/script-container"
import { TempPanel } from "@/components/nav/temp-panel"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

import { useSpaceAppStore } from "./store"

const AIChat = lazy(() => import("@/components/ai-chat/ai-chat-new"))

export function DatabasePWALayoutBase({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { sqlite } = useSqlite()
  const { isShareMode } = useAppRuntimeStore()
  const { isRightPanelOpen, currentAppIndex, apps, tempPanelNode } = useSpaceAppStore()
  const currentApp = apps[currentAppIndex]

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
                    className={cn("min-w-[400px]")}
                    defaultSize={isRightPanelOpen ? 20 : 0}
                    minSize={20}
                    maxSize={50}
                  >
                    <div className={cn("h-full shrink-0 overflow-x-hidden")}>
                      {tempPanelNode ? (
                        <TempPanel />
                      ) : (
                        <>
                          {currentApp === "chat" && (
                            <Suspense fallback={<Loading />}>
                              <AIChat />
                            </Suspense>
                          )}
                        </>
                      )}
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
