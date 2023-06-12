import { useEffect, useState } from "react"
import { useParams } from "next/navigation"

import { useAppStore } from "@/lib/store/app-store"

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
