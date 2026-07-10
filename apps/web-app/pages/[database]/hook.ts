import { useKeyPress } from "ahooks"
import { useEffect, useState } from "react"

import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useIndexedDB } from "@/apps/web-app/hooks/use-indexed-db"
import { usePeer } from "@/apps/web-app/hooks/use-peer"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useSqliteStore } from "@/apps/web-app/store/sqlite-store"
import { useSqliteMetaTableSubscribe } from "@/apps/web-app/hooks/use-sqlite-meta-table-subscribe"
import { useWorker } from "@/apps/web-app/hooks/use-worker"
import { useCurrentUser } from "@/apps/web-app/hooks/user-current-user"
import {
  EidosSharedEnvChannelName,
  MainServiceWorkerMsgType,
  MsgType,
} from "@/lib/const"
import { embeddingTexts } from "@/lib/embedding/worker"
import { getSqliteProxy } from "@/packages/core/sqlite/channel"
import { getWorker } from "@/packages/core/sqlite/worker"
import { useAppStore } from "@/apps/web-app/store/app-store"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"
import { uuidv7 } from "@/lib/utils"

import { isDesktopMode, isInkServiceMode } from "@/lib/env"
import { useAIConfigStore } from "@/components/settings/stores"
import { useReadSqliteStore } from "@/apps/web-app/hooks/use-readonly-sqlite"
import { useSyncExtNodes } from "@/apps/web-app/hooks/use-all-ext-nodes"
import { useSyncMblocks } from "@/apps/web-app/hooks/use-all-mblocks"
import { useDocPropertyTypes } from "@/components/doc-property-global/property-type-hook"
import { useSyncFileActions } from "@/apps/web-app/hooks/use-all-file-actions"
import { createEidos, useEidosStore } from "@eidos.space/react"

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
  const { setReadSqliteProxy } = useReadSqliteStore()

  const { sqlite } = useSqlite(database)
  const { isSidebarOpen, setSidebarOpen } = useAppStore()

  const { initEmbeddingWorker } = useWorker()
  const { lastOpenedDatabase, setLastOpenedDatabase } = useLastOpened()

  const { getPropertyTypes } = useDocPropertyTypes()
  const { initPeer } = usePeer()
  const { updateNodeList } = useSqlite()

  useSyncExtNodes()
  useSyncMblocks()
  useSyncFileActions()
  useEffect(() => {
    updateNodeList()
  }, [updateNodeList])

  useEffect(() => {
    // refresh property types when space changed
    if (database) {
      getPropertyTypes()
    }
  }, [database, getPropertyTypes])

  useKeyPress(["ctrl.backslash", "meta.backslash"], () => {
    setSidebarOpen(!isSidebarOpen)
  })
  const { aiConfig } = useAIConfigStore()
  useEffect(() => {
    if (aiConfig.autoLoadEmbeddingModel) {
      embeddingTexts(["hi"])
    }
  }, [aiConfig.autoLoadEmbeddingModel])
  useEffect(() => {
    initPeer()
  }, [initPeer])

  useSqliteMetaTableSubscribe()
  useEffect(() => {
    initEmbeddingWorker()
  }, [initEmbeddingWorker])

  useEffect(() => {
    if (isDesktopMode && database) {
      if (lastOpenedDatabase === database) return
      const switchDdMsgId = uuidv7()
      window.eidos.space
        .switchDatabase({
          databaseName: database,
          id: switchDdMsgId,
        })
        .then((response: any) => {
          const { id: returnId, data } = response
          if (returnId === switchDdMsgId) {
            setLastOpenedDatabase(data.dbName)
          }
        })
    } else if (!isInkServiceMode && database && sqlite) {
      if (lastOpenedDatabase === database) return
      const switchDdMsgId = uuidv7()
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
  const { setEidos } = useEidosStore()
  useEffect(() => {
    const sqlWorker = getSqliteProxy(database, userId || "")

    setSqlWorker(sqlWorker)
    // Set Eidos instance for useEidos hook (built-in extensions)
    setEidos(createEidos(sqlWorker))

    if (isDesktopMode) {
      const readonlySqlite = getSqliteProxy(database, userId || "", {
        isReadonly: true,
      })
      setReadSqliteProxy(readonlySqlite)
    }
  }, [database, setSqlWorker, setEidos, userId])

  useEffect(() => {
    setLastOpenedDatabase(database)
  }, [database, setLastOpenedDatabase])

  useEffect(() => {
    const mainServiceWorkerChannel = new BroadcastChannel(
      EidosSharedEnvChannelName
    )
    mainServiceWorkerChannel.postMessage({
      type: MainServiceWorkerMsgType.SetData,
      data: {
        space: database,
      },
    })
    return () => mainServiceWorkerChannel.close()
  }, [database])

  useEffect(() => {
    // when table name changed
    if (database && tableName) {
      sqlite?.onTableChange(database, tableName)
    }
  }, [database, tableName, sqlite])
}
