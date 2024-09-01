import { motion } from "framer-motion"

import { useAppStore } from "@/lib/store/app-store"
import { cn } from "@/lib/utils"
import { ScriptContainer } from "@/components/script-container"

import { Nav } from "./nav"
import { SideBar } from "./siderbar"

export function DatabaseLayoutBase({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { isSidebarOpen } = useAppStore()

  const sidebarVariants = {
    open: { x: 0 },
    closed: { x: "-100%", width: 0 },
  }

  return (
    <div className={cn("relative  flex h-screen", className)}>
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
      </motion.div>
    </div>
  )
}
