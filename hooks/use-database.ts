import { useEffect } from "react"

import { getSQLiteFilesInRootDirectory } from "@/lib/fs"
import { useSqliteStore } from "@/lib/store"

export const useAllDatabases = () => {
  const { setDatabaseList, databaseList } = useSqliteStore()

  useEffect(() => {
    getSQLiteFilesInRootDirectory().then((files) => {
      setDatabaseList(files.map((file) => file.name.split(".")[0]))
    })
  }, [setDatabaseList])

  return databaseList
}
