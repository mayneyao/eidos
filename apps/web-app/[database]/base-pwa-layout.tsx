"use client"

import { Suspense, lazy } from "react"
import { motion } from "framer-motion"

import { useAppStore } from "@/lib/store/app-store"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"
import { isMac } from "@/lib/web/helper"
import { useEidosFileSystemManager } from "@/hooks/use-fs"
import { useSqlite } from "@/hooks/use-sqlite"
import { Loading } from "@/components/loading"
import { ScriptContainer } from "@/components/script-container"
import { SideBar } from "@/components/sidebar"

import { Nav } from "../../../components/nav"
import { ExtensionPage } from "../extensions/page"
import { useSpaceAppStore } from "./store"

const AIChat = lazy(() => import("@/components/ai-chat/ai-chat-new"))

export function PWALayoutBase({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { sqlite } = useSqlite()
  const { isShareMode, currentPreviewFile } = useAppRuntimeStore()
  const { isSidebarOpen } = useAppStore()
  const { isRightPanelOpen: isAiOpen, isExtAppOpen } = useSpaceAppStore()
  const { efsManager } = useEidosFileSystemManager()
  if (!isShareMode && !sqlite) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loading />
      </div>
    )
  }

  const sidebarVariants = {
    open: { x: 0 },
    closed: { x: "-100%", width: 0 },
  }
  // when chat is open  2:7:3
  // when chat is close 2:10
  return (
    <div className={cn("relative flex", className)}>
      {currentPreviewFile && (
        <iframe
          className="hidden h-full w-full  md:block"
          src={efsManager.getFileUrlByPath(currentPreviewFile.path)}
        ></iframe>
      )}

      <ScriptContainer />
      <div className="flex h-screen w-full flex-col">
        <Nav />
        <div
          className={cn("flex h-screen w-full pt-8", {
            "!pt-[38px]": isMac(),
          })}
        >
          <motion.div
            className={cn("h-full w-[300px] shrink-0 overflow-x-hidden")}
            animate={isSidebarOpen ? "open" : "closed"}
            variants={sidebarVariants}
            transition={{ type: "tween", duration: 0.2 }}
          >
            <SideBar />
          </motion.div>
          <div className={cn("flex h-full w-auto grow flex-col border-l")}>
            <main
              id="main-content"
              className="z-[1] flex w-full grow flex-col overflow-y-auto"
            >
              {children}
            </main>
          </div>
          {isAiOpen && (
            <Suspense fallback={<Loading />}>
              <AIChat />
            </Suspense>
          )}
          {isExtAppOpen && (
            <div className="relative flex h-full  w-[475px] shrink-0  flex-col overflow-auto border-l border-l-slate-400 p-2">
              <ExtensionPage />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
