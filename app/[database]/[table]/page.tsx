"use client"

import dynamic from "next/dynamic"

import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useCurrentNodeType } from "@/hooks/use-node-type"
import { Editor } from "@/components/doc/editor"

const Grid = dynamic(
  () => {
    return import("@/components/grid")
  },
  { ssr: false }
)

export default function TablePage() {
  const params = useCurrentPathInfo()
  const nodeType = useCurrentNodeType()
  return (
    <>
      {nodeType === "table" && (
        <Grid tableName={params.tableName!} databaseName={params.database} />
      )}
      {nodeType === "doc" && (
        <div className="flex  items-center justify-center">
          <div className="h-full w-[49rem]">
            <Editor />
          </div>
        </div>
      )}
    </>
  )
}
