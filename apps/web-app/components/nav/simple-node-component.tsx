import { useMemo } from "react"

import { getRawTableNameById, isDayPageId } from "@/lib/utils"
import { Editor } from "@/components/doc/editor"
import { Table } from "@/components/table"
import { useNodeMap } from "@/apps/web-app/hooks/use-current-node"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

interface SimpleNodeComponentProps {
  nodeId: string
  space?: string
}

export const SimpleNodeComponent = ({
  nodeId,
  space,
}: SimpleNodeComponentProps) => {
  const nodeMap = useNodeMap()
  const currentPathInfo = useCurrentPathInfo()
  const { isCmdkOpen } = useAppRuntimeStore()

  const actualSpace = space || currentPathInfo.space

  const node = useMemo(() => {
    return (
      nodeMap[nodeId] ||
      (isDayPageId(nodeId)
        ? {
            id: nodeId,
            name: nodeId,
            type: "day",
          }
        : null)
    )
  }, [nodeMap, nodeId])

  if (!node) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p>Node not found</p>
      </div>
    )
  }

  if (node.type === "doc" || node.type === "day") {
    return (
      <Editor
        isActive={false}
        isEditable={!isCmdkOpen}
        docId={node.id}
        title={node.name}
        showTitle={true}
        disableSelectionPlugin
        disableSafeBottomPaddingPlugin
        disablePlaceholder
        className="prose w-full max-w-full dark:prose-invert"
      />
    )
  }

  if (node.type === "table" || node.type === "dataview") {
    return (
      <Table
        tableName={getRawTableNameById(node.id, node.type === "dataview")}
        space={actualSpace!}
        isEmbed
      />
    )
  }

  return (
    <div className="p-4 text-center text-muted-foreground">
      <p>This node type is not supported in preview mode.</p>
      <p className="text-sm mt-2">Type: {node.type}</p>
    </div>
  )
}
