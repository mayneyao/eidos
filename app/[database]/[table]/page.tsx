"use client"

import dynamic from "next/dynamic"

import { useCurrentNode } from "@/hooks/use-current-node"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { Editor } from "@/components/doc/editor"

const Grid = dynamic(
  () => {
    return import("@/components/grid")
  },
  { ssr: false }
)

export default function TablePage() {
  const params = useCurrentPathInfo()
  const node = useCurrentNode()
  return (
    <>
      {node?.type === "table" && (
        <Grid tableName={params.tableName!} databaseName={params.database} />
      )}
      {node?.type === "doc" && <Editor docId={params.docId!} />}
    </>
  )
}
