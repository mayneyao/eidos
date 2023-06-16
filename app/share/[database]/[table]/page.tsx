"use client"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import dynamic from "next/dynamic"

const Grid = dynamic(
  () => {
    return import("@/components/grid")
  },
  { ssr: false }
)

export default function TablePage() {
  const params  = useCurrentPathInfo()

  return (
    <>
      <Grid tableName={params.tableName} databaseName={params.database} />
    </>
  )
}
