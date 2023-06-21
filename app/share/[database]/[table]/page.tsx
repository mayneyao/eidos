"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"

import { useCurrentNode } from "@/hooks/use-current-node"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useSqlite } from "@/hooks/use-sqlite"
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
  const { updateDoc, getDoc } = useSqlite(params.database)
  const handleSaveDoc = (content: string) => {
    updateDoc(params.docId!, content)
  }

  const [initContent, setInitContent] = useState<string>("")

  useEffect(() => {
    if (node?.type === "doc") {
      getDoc(params.docId!).then((content) => {
        content && setInitContent(content)
      })
    }
  }, [getDoc, node?.type, params.docId])

  return (
    <>
      {node?.type === "table" && (
        <Grid tableName={params.tableName!} databaseName={params.database} />
      )}
      {node?.type === "doc" && (
        <Editor
          isEditable={false}
          docId={params.docId!}
          onSave={handleSaveDoc}
          initContent={initContent}
        />
      )}
    </>
  )
}
