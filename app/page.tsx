"use client"

import { useAllDatabases } from "@/hooks/use-database"
import { DatabaseSelect } from "@/components/database-select"

export default function IndexPage() {
  const databaseList = useAllDatabases()
  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <DatabaseSelect databases={databaseList} />
    </div>
  )
}
