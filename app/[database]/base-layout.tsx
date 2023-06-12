"use client"

import dynamic from "next/dynamic"
import { useParams } from "next/navigation"

import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"
import { useSqlite } from "@/hooks/use-sqlite"
import { Loading } from "@/components/loading"
import { SideBar } from "@/components/sidebar"

import { useLayoutInit } from "./hook"
import { Nav } from "./nav"
import { useDatabaseAppStore } from "./store"

// import { AIChat } from "./ai-chat";
const AIChat = dynamic(() => import("./ai-chat").then((mod) => mod.AIChat), {
  ssr: false,
})

export function DatabaseLayoutBase({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const { isAiOpen } = useDatabaseAppStore()
  const { sqlite } = useSqlite()
  const { isShareMode } = useAppRuntimeStore()

  // event listen should be in useLayoutInit, and just listen once
  useLayoutInit()
  if (!isShareMode && !sqlite) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loading />
      </div>
    )
  }
  // when chat is open  2:7:3
  // when chat is close 2:10
  return (
    <div
      className={cn(
        "relative  grid h-screen w-screen  lg:grid-cols-12",
        className
      )}
    >
      <div
        className={cn(
          "col-span-2 h-full"
          // isAiOpen ? "" : "col-span-3",
        )}
      >
        <SideBar />
      </div>
      <div
        className={cn(
          "flex h-full flex-col lg:border-l",
          isAiOpen ? "col-span-7" : "col-span-10"
        )}
      >
        <Nav />
        <div className="flex grow overflow-auto">
          <div className="grow">{children}</div>
        </div>
      </div>
      <div
        className={cn("h-full lg:border-l", isAiOpen ? "col-span-3" : "hidden")}
      >
        <AIChat />
      </div>
    </div>
  )
}
