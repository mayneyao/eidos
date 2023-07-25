import { useEffect, useState } from "react"
import { useKeyPress } from "ahooks"
import * as d3 from "d3"

import { MsgType } from "@/lib/const"
import { getSqliteProxy } from "@/lib/sqlite/proxy"
import { getWorker } from "@/lib/sqlite/worker"
import { useAppStore } from "@/lib/store/app-store"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { uuidv4 } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { usePeer } from "@/hooks/use-peer"
import { useSqlite, useSqliteStore } from "@/hooks/use-sqlite"
import { useWorker } from "@/hooks/use-worker"

import { useConfigStore } from "../settings/store"
import { useSpaceAppStore } from "./store"

export const useTableChange = (callback: Function) => {
  const { database, tableName: table } = useCurrentPathInfo()
  useEffect(() => {
    callback()
  }, [callback, database, table])
}

export const useCurrentDomain = () => {
  const [domain, setDomain] = useState("")

  useEffect(() => {
    const currentDomain = window.location.origin
    setDomain(currentDomain)
  }, [])

  return domain
}

export const useLastOpened = () => {
  const { lastOpenedDatabase, setLastOpenedDatabase } = useAppStore()
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
  }
}

export const useLayoutInit = () => {
  const { space: database } = useCurrentPathInfo()
  const { setSqliteProxy: setSqlWorker } = useSqliteStore()
  const { setCurrentDatabase, currentDatabase } = useSqliteStore()
  const { experiment, backupServer } = useConfigStore()
  const { sqlite } = useSqlite(database)
  const { isSidebarOpen, setSidebarOpen } = useSpaceAppStore()

  const { isInitialized, initWorker } = useWorker()
  useLastOpened()

  const { initPeer } = usePeer()

  useKeyPress("ctrl.backslash", () => {
    setSidebarOpen(!isSidebarOpen)
  })

  useEffect(() => {
    initPeer()
  }, [initPeer])

  useEffect(() => {
    const worker = getWorker()
    worker.postMessage({
      type: MsgType.SetConfig,
      data: {
        experiment,
        backupServer,
      },
    })
    ;(window as any).d3 = d3
  }, [experiment, backupServer])

  useEffect(() => {
    if (database && sqlite) {
      if (currentDatabase === database) return
      const switchDdMsgId = uuidv4()
      const worker = getWorker()
      worker.postMessage({
        type: MsgType.SwitchDatabase,
        data: {
          databaseName: database,
        },
        id: switchDdMsgId,
      })
      worker.onmessage = (e) => {
        const { id: returnId, data } = e.data
        if (returnId === switchDdMsgId) {
          setCurrentDatabase(data.dbName)
        }
      }
    }
  }, [database, setCurrentDatabase, currentDatabase, sqlite])

  useEffect(() => {
    if (!isInitialized) {
      initWorker()
    }
    const sqlWorker = getSqliteProxy(database)
    setSqlWorker(sqlWorker)
  }, [database, setSqlWorker, isInitialized, initWorker])

  useEffect(() => {
    setCurrentDatabase(database)
    navigator?.serviceWorker?.controller?.postMessage({
      type: "space",
      data: database,
    })
  }, [database, setCurrentDatabase])
}
