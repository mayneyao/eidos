import { useCurrentNode, useNodeMap } from "@/hooks/use-current-node"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useEmoji } from "@/hooks/use-emoji"
import { useNode } from "@/hooks/use-nodes"
import { useSqlite } from "@/hooks/use-sqlite"
import { Button } from "@/components/ui/button"
import { DocProperty } from "@/components/doc-property"
import { Editor } from "@/components/doc/editor"
import { Table } from "@/components/table"

import { DefaultColors } from "./image-selector"
import { NodeCover } from "./node-cover"
import { NodeIconEditor } from "./node-icon"
import { NodeRestore } from "./node-restore"

export const NodeComponent = ({ nodeId }: { nodeId?: string }) => {
  const params = useCurrentPathInfo()
  const { updateNodeName } = useSqlite(params.database)

  const nodeMap = useNodeMap()

  const { getEmoji } = useEmoji()
  const { updateIcon, updateCover } = useNode()
  if (!nodeId) {
    return null
  }
  const node = nodeMap[nodeId]
  const handleAddIcon = async () => {
    const emojiNative = await getEmoji(node?.name)
    await updateIcon(node?.id!, emojiNative)
  }
  const handleAddCover = async () => {
    const color =
      DefaultColors[Math.floor(Math.random() * DefaultColors.length)]
    await updateCover(node?.id!, `color://${color}`)
  }

  return (
    <>
      <NodeRestore node={node} />
      {node?.type === "table" && (
        <Table tableName={params.tableName!} space={params.database!} />
      )}
      {node?.type === "doc" && (
        <Editor
          isEditable
          docId={node.id}
          title={node.name}
          showTitle
          className={node.is_full_width ? "max-w-full md:!px-8" : ""}
          onTitleChange={(title) => {
            updateNodeName(node.id, title)
          }}
          beforeTitle={
            node.icon && <NodeIconEditor icon={node.icon} nodeId={node.id} />
          }
          coverComponent={node.cover && <NodeCover node={node} />}
          propertyComponent={
            node.parent_id && (
              <DocProperty tableId={node.parent_id!} docId={node.id} />
            )
          }
          topComponent={
            <div className="flex h-[36px] cursor-pointer gap-2 opacity-0 hover:opacity-100">
              {!node.icon && (
                <Button size="sm" variant="ghost" onClick={handleAddIcon}>
                  Add Icon
                </Button>
              )}
              {!node.cover && (
                <Button size="sm" variant="ghost" onClick={handleAddCover}>
                  Add Cover
                </Button>
              )}
            </div>
          }
        />
      )}
    </>
  )
}
export default function TablePage() {
  const node = useCurrentNode()
  return <NodeComponent nodeId={node?.id} />
}
