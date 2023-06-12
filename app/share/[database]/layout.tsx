"use client"

import { useEffect } from "react"
import { useParams, useSearchParams } from "next/navigation"

import { SQLWorker } from "@/lib/sqlite/sql-worker"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"
import { usePeerConnect } from "@/hooks/use-peer"
import { useSqliteStore } from "@/hooks/use-sqlite"
import DatabaseLayout from "@/app/[database]/layout"
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
    if (!conn) return
    // TODO: handle connection
    const sqlWorker = SQLWorker(database, {
      isShareMode: true,
      connection: conn,
    })
    setSqlWorker(sqlWorker)
  }, [conn, database, setSqlWorker])
  return (
    // border to show difference between share and app
    <DatabaseLayout
      className={cn(
        "border-box border-2",
        isConnected ? "border-green-400" : "border-red-400"
      )}
    >
      {children}
    </DatabaseLayout>
  )
}
