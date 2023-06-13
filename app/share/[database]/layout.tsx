"use client"

import { useParams, useSearchParams } from "next/navigation"
import { useEffect } from "react"

import { DatabaseLayoutBase } from "@/app/[database]/base-layout"
import { useConfigStore } from "@/app/settings/store"
import { usePeerConnect } from "@/hooks/use-peer"
import { useSqliteStore } from "@/hooks/use-sqlite"
import { getSqliteProxy } from "@/lib/sqlite/proxy"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"

interface RootLayoutProps {
  children: React.ReactNode
}

export default function ShareDatabaseLayout({ children }: RootLayoutProps) {
  const searchParams = useSearchParams()
  const sharePeerId = searchParams.get("peerId")
  const { profile } = useConfigStore()
  const { isConnected, conn } = usePeerConnect(sharePeerId, profile.username)
  const { setShareMode } = useAppRuntimeStore()
  const { setSqliteProxy } = useSqliteStore()
  const { database } = useParams()
  useEffect(() => {
    setShareMode(true)
    return () => {
      setShareMode(false)
    }
  }, [setShareMode])

  useEffect(() => {
    // TODO: handle connection
    const sqliteProxy = getSqliteProxy(database, {
      isShareMode: true,
      connection: conn!,
    })
    console.log(`share mode setSqlWorker`)
    setSqliteProxy(sqliteProxy)
  }, [conn, database, setSqliteProxy])
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
