import { useEffect } from "react"

import { getAllSpaceNames } from "@/lib/fs"

import { useSqliteStore } from "./use-sqlite"

export const useAllDatabases = () => {
  const { setDatabaseList, databaseList } = useSqliteStore()

  useEffect(() => {
    getAllSpaceNames().then((spaceNames) => {
      setDatabaseList(spaceNames)
    })
  }, [setDatabaseList])

  return databaseList
}
