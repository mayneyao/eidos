import { useEffect, useState } from "react"
import { useKeyPress } from "ahooks"

import {
  EidosSharedEnvChannelName,
  MainServiceWorkerMsgType,
  MsgType,
} from "@/lib/const"
import { getSqliteProxy } from "@/lib/sqlite/proxy"
import { getWorker } from "@/lib/sqlite/worker"
import { useAppStore } from "@/lib/store/app-store"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { uuidv4 } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useIndexedDB } from "@/hooks/use-indexed-db"
import { usePeer } from "@/hooks/use-peer"
import { useRegisterPeriodicSync } from "@/hooks/use-register-period-sync"
import { useSqlite, useSqliteStore } from "@/hooks/use-sqlite"
import { useSqliteMetaTableSubscribe } from "@/hooks/use-sqlite-meta-table-subscribe"
import { useWorker } from "@/hooks/use-worker"
import { useCurrentUser } from "@/hooks/user-current-user"

const mainServiceWorkerChannel = new BroadcastChannel(EidosSharedEnvChannelName)
export const useCurrentDomain = () => {
  const [domain, setDomain] = useState("")

  useEffect(() => {
    const currentDomain = window.location.origin
    setDomain(currentDomain)
  }, [])

  return domain
}

export const useLastOpened = () => {
  const [lastOpenedDatabase, setLastOpenedDatabase] = useIndexedDB(
    "kv",
    "lastOpenedDatabase",
    ""
  )
  const { isShareMode } = useAppRuntimeStore()
  const { database, tableId: table } = useCurrentPathInfo()
  const { lastOpenedTable, setLastOpenedTable } = useAppStore()

  useEffect(() => {}, [isShareMode, setLastOpenedTable, table])
  useEffect(() => {
    if (!isShareMode && database) {
      setLastOpenedDatabase(database)
    }
    if (!isShareMode && table) {
      setLastOpenedTable(table)
    }
  }, [database, isShareMode, setLastOpenedDatabase, setLastOpenedTable, table])

  return {
    lastOpenedDatabase,
    lastOpenedTable,
    setLastOpenedDatabase,
  }
}

export const useLayoutInit = () => {
  const { space: database, tableName } = useCurrentPathInfo()
  const { setSqliteProxy: setSqlWorker } = useSqliteStore()
  const { sqlite } = useSqlite(database)
  const { isSidebarOpen, setSidebarOpen } = useAppStore()

  const { isInitialized, initWorker, initEmbeddingWorker } = useWorker()
  const { lastOpenedDatabase, setLastOpenedDatabase } = useLastOpened()

  const { initPeer } = usePeer()

  useKeyPress(["ctrl.backslash", "meta.backslash"], () => {
    setSidebarOpen(!isSidebarOpen)
  })

  useEffect(() => {
    initPeer()
  }, [initPeer])

  useSqliteMetaTableSubscribe()
  useEffect(() => {
    console.log("initEmbeddingWorker")
    initEmbeddingWorker()
  }, [initEmbeddingWorker])

  useEffect(() => {
    if (database && sqlite) {
      if (lastOpenedDatabase === database) return
      const switchDdMsgId = uuidv4()
      const worker = getWorker()
      worker.postMessage({
        type: MsgType.SwitchDatabase,
        data: {
          databaseName: database,
        },
        id: switchDdMsgId,
      })
      worker.addEventListener("message", (e) => {
        const { id: returnId, data } = e.data
        if (returnId === switchDdMsgId) {
          setLastOpenedDatabase(data.dbName)
        }
      })
    }
  }, [database, lastOpenedDatabase, setLastOpenedDatabase, sqlite])

  const { id: userId } = useCurrentUser()
  useEffect(() => {
    if (!isInitialized) {
      initWorker()
    }
    const sqlWorker = getSqliteProxy(database, userId || "")
    setSqlWorker(sqlWorker)
  }, [database, setSqlWorker, isInitialized, initWorker, userId])

  useEffect(() => {
    setLastOpenedDatabase(database)
  }, [database, setLastOpenedDatabase])

  useEffect(() => {
    mainServiceWorkerChannel.postMessage({
      type: MainServiceWorkerMsgType.SetData,
      data: {
        space: database,
      },
    })
  }, [database])

  useEffect(() => {
    // when table name changed
    if (database && tableName) {
      sqlite?.onTableChange(database, tableName)
    }
  }, [database, tableName, sqlite])

  useRegisterPeriodicSync()
}
