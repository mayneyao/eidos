"use client"

import { cn } from "@/lib/utils"
import { Loading } from "@/components/loading"
import { ScriptContainer } from "@/components/script-container"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

export function DatabasePWALayoutBase({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { sqlite } = useSqlite()
  const { isShareMode } = useAppRuntimeStore()

  if (!isShareMode && !sqlite) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loading />
      </div>
    )
  }

  return (
    <div className={cn("relative flex h-screen", className)}>
      <ScriptContainer />
      <div className="flex h-screen w-full">
        <div className="flex h-screen flex-col min-w-0 grow">
          <div className="flex w-full pt-[38px]" style={{ height: "100%" }}>
            <div className={cn("flex h-full w-auto grow flex-col")}>
              <main
                id="main-content"
                className="z-[1] flex w-full grow flex-col overflow-y-auto"
              >
                {children}
              </main>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
