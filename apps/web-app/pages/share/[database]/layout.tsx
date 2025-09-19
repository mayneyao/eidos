"use client"

import { useEffect } from "react"
import { Outlet, useSearchParams } from "react-router-dom"

import { getSqliteProxy } from "@/packages/core/sqlite/channel"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { cn } from "@/lib/utils"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { usePeerConnect } from "@/apps/web-app/hooks/use-peer"
import { useSqliteStore } from "@/apps/web-app/store/sqlite-store"
import { useCurrentUser } from "@/apps/web-app/hooks/user-current-user"
import { DatabaseLayoutBase } from "@/apps/web-app/pages/[database]/base-layout"
import { useConfigStore } from "@/apps/web-app/pages/settings/store"

const SwitchProxyWrapper = ({ children, conn }: any) => {
  const { setSqliteProxy } = useSqliteStore()
  const { space } = useCurrentPathInfo()
  const { id: userId } = useCurrentUser()
  useEffect(() => {
    // TODO: handle connection
    if (conn) {
      const sqliteProxy = getSqliteProxy(space, userId || "", {
        isShareMode: true,
        connection: conn,
      })
      console.log(`share mode setSqlWorker`)
      setSqliteProxy(sqliteProxy)
    }
  }, [conn, space, setSqliteProxy, userId])
  return <>{children}</>
}

export default function ShareDatabaseLayout() {
  const [searchParams] = useSearchParams()
  const sharePeerId = searchParams.get("peerId")
  const { profile } = useConfigStore()
  const { isConnected, conn } = usePeerConnect(sharePeerId, profile.username)
  const { setShareMode } = useAppRuntimeStore()
  useEffect(() => {
    setShareMode(true)
    return () => {
      setShareMode(false)
    }
  }, [setShareMode])

  // border to show difference between share and app
  // first we need init peer client at DatabaseLayoutBase, then we can use connect to share peer
  return (
    <DatabaseLayoutBase
      className={cn(
        "border-box border-2",
        isConnected ? "border-green-400" : "border-red-400"
      )}
    >
      <SwitchProxyWrapper conn={conn}>
        <Outlet />
      </SwitchProxyWrapper>
    </DatabaseLayoutBase>
  )
}
