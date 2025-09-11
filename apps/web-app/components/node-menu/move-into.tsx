import { useTranslation } from "react-i18next"

import type { ITreeNode} from "@/packages/core/types/ITreeNode";
import { TreeNodeType } from "@/packages/core/types/ITreeNode"
import { useNodeTree } from "@/apps/web-app/hooks/use-node-tree"
import { useAllNodes } from "@/apps/web-app/hooks/use-nodes"
import { useSqlite } from "@/apps/web-app/hooks/use-sqlite"

import { NodeName } from "../node-name"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../ui/command"
import { ScrollArea } from "../ui/scroll-area"

export const NodeMoveInto = ({ node }: { node: ITreeNode }) => {
  const tableNodes = useAllNodes({
    type: [TreeNodeType.Table, TreeNodeType.Folder],
    isDeleted: false,
  })
  const { t } = useTranslation()
  const { sqlite } = useSqlite()
  const { setNode } = useNodeTree()

  const moveDraftIntoTable = async (nodeId: string, tableId: string) => {
    if (!sqlite) return
    await sqlite.tree.moveIntoTable(nodeId, tableId)
    setNode({
      id: nodeId,
      parent_id: tableId,
    })
  }
  return (
    <Command>
      <CommandInput placeholder={t("common.filter")} autoFocus={true} />
      <ScrollArea>
        <CommandList className="max-h-[300px]">
          <CommandEmpty>{t("common.noTableFound")}</CommandEmpty>
          <CommandGroup>
            {tableNodes.map((tableNode, index) => (
              <CommandItem
                key={tableNode.id}
                value={`${tableNode.name || "Untitled"} ${index}`}
                onClick={() => {}}
                title={tableNode.name || "Untitled"}
                className=" flex gap-1 truncate"
                onSelect={(value) => {
                  moveDraftIntoTable(node.id, tableNode.id)
                }}
              >
                <NodeName node={tableNode} />
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </ScrollArea>
    </Command>
  )
}
