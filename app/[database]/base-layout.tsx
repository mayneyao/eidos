import { motion } from "framer-motion"
import { Suspense, lazy } from "react"

import { Loading } from "@/components/loading"
import { ScriptContainer } from "@/components/script-container"
import { SideBar } from "@/components/sidebar"
import { useSqlite } from "@/hooks/use-sqlite"
import { efsManager } from "@/lib/storage/eidos-file-system"
import { useAppStore } from "@/lib/store/app-store"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"

import { Nav } from "../../components/nav"
import { ExtensionPage } from "../extensions/page"
import { useSpaceAppStore } from "./store"

const AIChat = lazy(() => import("@/components/ai-chat/ai-chat-new"))

export function DatabaseLayoutBase({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { sqlite } = useSqlite()
  const { isShareMode, currentPreviewFile } = useAppRuntimeStore()
  const { isSidebarOpen } = useAppStore()
  const { isAiOpen, isExtAppOpen } = useSpaceAppStore()

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

  return (
    <div className={cn("relative  flex h-screen", className)}>
      {currentPreviewFile && (
        <iframe
          className="hidden h-full w-full  md:block"
          src={efsManager.getFileUrlByPath(currentPreviewFile.path)}
        ></iframe>
      )}

      <ScriptContainer />
      <motion.div className="flex h-full w-full">
        <motion.div
          className={cn("h-full w-[300px] shrink-0 overflow-x-hidden")}
          animate={isSidebarOpen ? "open" : "closed"}
          variants={sidebarVariants}
          transition={{ type: "tween", duration: 0.2 }}
        >
          <SideBar />
        </motion.div>
        <div className={cn("flex h-full w-auto grow flex-col border-l")}>
          <div className="flex justify-between md:justify-end">
            {/* <MobileSideBar /> */}
            <Nav />
          </div>
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
          <div className="relative flex h-screen w-[24%] min-w-[475px] max-w-[500px] grow flex-col overflow-auto border-l border-l-slate-400 p-2">
            <ExtensionPage />
          </div>
        )}
      </motion.div>
    </div>
  )
}
