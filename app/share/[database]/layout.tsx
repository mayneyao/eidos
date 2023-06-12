"use client"

import { useEffect } from "react"
import { useParams, useSearchParams } from "next/navigation"

import { SQLWorker } from "@/lib/sqlite/sql-worker"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"
import { usePeerConnect } from "@/hooks/use-peer"
import { useSqliteStore } from "@/hooks/use-sqlite"
import { DatabaseLayoutBase } from "@/app/[database]/base-layout"
import { useConfigStore } from "@/app/settings/store"

interface RootLayoutProps {
  children: React.ReactNode
}

export default function ShareDatabaseLayout({ children }: RootLayoutProps) {
  const searchParams = useSearchParams()
  const sharePeerId = searchParams.get("peerId")
  const { profile } = useConfigStore()
  const { isConnected, conn } = usePeerConnect(sharePeerId, profile.username)
  const { setShareMode } = useAppRuntimeStore()
  const { setSqlWorker } = useSqliteStore()
  const { database } = useParams()
  useEffect(() => {
    setShareMode(true)
  }, [])

  useEffect(() => {
    // TODO: handle connection
    const sqlWorker = SQLWorker(database, {
      isShareMode: true,
      connection: conn ?? undefined,
    })
    console.log(`share mode setSqlWorker`)
    setSqlWorker(sqlWorker)
    ;(window as any).SQLWorker = sqlWorker
    console.log("switch to  new sqlWorker", sqlWorker)
  }, [conn, database, setSqlWorker])
  // border to show difference between share and app
  return (
    <DatabaseLayoutBase
      className={cn(
        "border-box border-2",
        isConnected ? "border-green-400" : "border-red-400"
      )}
    >
      {children}
    </DatabaseLayoutBase>
  )
}
