"use client"

import { useEffect } from "react"
import dynamic from "next/dynamic"
import { useParams } from "next/navigation"

import { useSqliteStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import { SideBar } from "@/components/sidebar"

import { Nav } from "./nav"
import { useDatabaseAppStore } from "./store"

// import { AIChat } from "./ai-chat";
const AIChat = dynamic(() => import("./ai-chat").then((mod) => mod.AIChat), {
  ssr: false,
})

interface RootLayoutProps {
  children: React.ReactNode
}

export default function DatabaseLayout({ children }: RootLayoutProps) {
  const params = useParams()
  const { setCurrentDatabase } = useSqliteStore()
  const { isAiOpen, setIsAiOpen } = useDatabaseAppStore()

  useEffect(() => {
    setCurrentDatabase(params.database)
  }, [params.database, setCurrentDatabase])

  // when chat is open  2:7:3
  // when chat is close 2:10
  return (
    <div className="relative  grid h-screen w-screen  lg:grid-cols-12">
      <div
        className={cn(
          "col-span-2 h-screen"
          // isAiOpen ? "" : "col-span-3",
        )}
      >
        <SideBar />
      </div>
      <div
        className={cn(
          "flex h-screen flex-col lg:border-l",
          isAiOpen ? "col-span-7" : "col-span-10"
        )}
      >
        <Nav />
        <div className="h-[calc(100vh-2rem)] overflow-auto">{children}</div>
      </div>
      <div
        className={cn(
          "h-screen lg:border-l",
          isAiOpen ? "col-span-3" : "hidden"
        )}
      >
        <AIChat />
      </div>
    </div>
  )
}
