import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import * as d3 from "d3"

import { MsgType } from "@/lib/const"
import { SQLWorker, getWorker } from "@/lib/sqlite/sql-worker"
import { useAppStore } from "@/lib/store/app-store"
import { uuidv4 } from "@/lib/utils"
import { usePeer } from "@/hooks/use-peer"
import { useSqlite, useSqliteStore } from "@/hooks/use-sqlite"

import { useConfigStore } from "../settings/store"

export const useTableChange = (callback: Function) => {
  const { database, table } = useParams()
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

export const useLastOpenedDatabase = () => {
  const { lastOpenedDatabase, setLastOpenedDatabase } = useAppStore()
  const { database, table } = useParams()

  useEffect(() => {
    if (database) {
      setLastOpenedDatabase(database)
    }
  }, [database, setLastOpenedDatabase])

  return lastOpenedDatabase
}

export const useLayoutInit = () => {
  const { database } = useParams()
  const { setInitialized, setSqlWorker } = useSqliteStore()
  const { setCurrentDatabase, currentDatabase } = useSqliteStore()
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
      console.log("switching database", switchDdMsgId)
      worker.onmessage = (e) => {
        const { id: returnId, data } = e.data
        if (returnId === switchDdMsgId) {
          setCurrentDatabase(data.dbName)
        }
      }
    }
  }, [database, setCurrentDatabase, currentDatabase, sqlite])

  useEffect(() => {
    const worker = getWorker()
    worker.onmessage = async (e) => {
      if (e.data === "init") {
        console.log("database is ready to query")
        setInitialized(true)
      }
    }
    const sqlWorker = SQLWorker(database)
    setSqlWorker(sqlWorker)
    ;(window as any).SQLWorker = sqlWorker
  }, [database, setInitialized, setSqlWorker])

  useEffect(() => {
    setCurrentDatabase(database)
  }, [database, setCurrentDatabase])
}
