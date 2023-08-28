"use client"

import { useEffect, useState } from "react"

import { useCurrentNode } from "@/hooks/use-current-node"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useSqlite } from "@/hooks/use-sqlite"
import { Editor } from "@/components/doc/editor"
import { Table } from "@/components/table"

export default function ShareNodePage() {
  const params = useCurrentPathInfo()
  const node = useCurrentNode()
  const { updateNodeName } = useSqlite(params.database)

  return (
    <>
      {node?.type === "table" && (
        <Table tableName={params.tableName!} space={params.database!} />
      )}
      {node?.type === "doc" && (
        <Editor
          isEditable={false}
          docId={params.docId!}
          title={node.name}
          showTitle
          onTitleChange={(title) => {
            updateNodeName(node.id, title)
          }}
        />
      )}
    </>
  )
}
