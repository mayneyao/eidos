"use client"

import * as d3 from "d3"
import dynamic from "next/dynamic"
import { useParams } from "next/navigation"
import { useEffect } from "react"

import { Loading } from "@/components/loading"
import { SideBar } from "@/components/sidebar"
import { usePeer } from "@/hooks/use-peer"
import { useSqlite, useSqliteStore } from "@/hooks/use-sqlite"
import { MsgType } from "@/lib/const"
import { getWorker } from "@/lib/sqlite/sql-worker"
import { cn } from "@/lib/utils"

import { useConfigStore } from "../settings/store"
import { useLastOpenedDatabase } from "./hook"
import { Nav } from "./nav"
import { useDatabaseAppStore } from "./store"

// import { AIChat } from "./ai-chat";
const AIChat = dynamic(() => import("./ai-chat").then((mod) => mod.AIChat), {
  ssr: false,
})

interface RootLayoutProps {
  children: React.ReactNode
  className?: string
}

export default function DatabaseLayout({
  children,
  className,
}: RootLayoutProps) {
  const { database } = useParams()
  const { setCurrentDatabase } = useSqliteStore()
  const { isAiOpen, setIsAiOpen } = useDatabaseAppStore()
  const { experiment } = useConfigStore()
  const { sqlite } = useSqlite(database)

  useLastOpenedDatabase()

  const { initPeer } = usePeer()

  useEffect(() => {
    initPeer()
  }, [])

  useEffect(() => {
    const worker = getWorker()
    worker.postMessage({
      type: MsgType.SetConfig,
      data: {
        experiment,
      },
    })
    ;(window as any).d3 = d3
  }, [experiment])

  useEffect(() => {
    setCurrentDatabase(database)
  }, [database, setCurrentDatabase])

  if (!sqlite) {
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
