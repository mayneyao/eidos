import { useCurrentNode } from "@/hooks/use-current-node"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useEmoji } from "@/hooks/use-emoji"
import { useNode } from "@/hooks/use-nodes"
import { useSqlite } from "@/hooks/use-sqlite"
import { Button } from "@/components/ui/button"
import { Editor } from "@/components/doc/editor"
import { Table } from "@/components/table"

import { NodeIconEditor } from "./node-icon"

export default function TablePage() {
  const params = useCurrentPathInfo()
  const node = useCurrentNode()
  const { updateNodeName } = useSqlite(params.database)

  const { getEmoji } = useEmoji()
  const { updateIcon } = useNode()

  const handleAddIcon = async () => {
    const emojiNative = await getEmoji(node?.name!)
    await updateIcon(node?.id!, emojiNative)
  }
  return (
    <>
      {node?.type === "table" && (
        <Table tableName={params.tableName!} space={params.database!} />
      )}
      {node?.type === "doc" && (
        <Editor
          isEditable
          docId={params.docId!}
          title={node.name}
          showTitle
          onTitleChange={(title) => {
            updateNodeName(node.id, title)
          }}
          beforeTitle={
            node.icon && <NodeIconEditor icon={node.icon} nodeId={node.id} />
          }
          topComponent={
            <div className="flex cursor-pointer gap-2 opacity-0 hover:opacity-100">
              {!node.icon && (
                <Button size="sm" variant="ghost" onClick={handleAddIcon}>
                  Add Icon
                </Button>
              )}
              <Button size="sm" variant="ghost">
                Add Cover
              </Button>
            </div>
          }
        />
      )}
    </>
  )
}
