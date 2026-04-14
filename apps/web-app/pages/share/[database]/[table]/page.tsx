"use client"

import { useCurrentNode } from "@/apps/web-app/hooks/use-current-node"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"
import { useDocFindInPage } from "@/apps/web-app/hooks/use-doc-find-in-page"
import { Editor } from "@/components/doc/editor"
import { Table } from "@/components/table"

export default function ShareNodePage() {
  const params = useCurrentPathInfo()
  const node = useCurrentNode()
  const { updateNodeName } = useSqlite(params.database)

  useDocFindInPage()

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
