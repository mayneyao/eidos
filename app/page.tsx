"use client"

import { useEffect } from "react"

import { useAllDatabases } from "@/hooks/use-database"
import { useGoto } from "@/hooks/use-goto"
import { DatabaseSelect } from "@/components/database-select"

import { useLastOpened } from "./[database]/hook"

export default function IndexPage() {
  const databaseList = useAllDatabases()
  const { lastOpenedDatabase } = useLastOpened()
  const goto = useGoto()

  useEffect(() => {
    if (lastOpenedDatabase) {
      goto(lastOpenedDatabase)
    }
  }, [lastOpenedDatabase, goto])
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="w-[200px]">
        <DatabaseSelect databases={databaseList} />
      </div>
    </div>
  )
}
