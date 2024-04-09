import { ITreeNode } from "@/lib/store/ITreeNode"
import { useNodeTree } from "@/hooks/use-node-tree"
import { useAllNodes } from "@/hooks/use-nodes"
import { useSqlite } from "@/hooks/use-sqlite"
import { NodeIconEditor } from "@/app/[database]/[node]/node-icon"

import { ItemIcon } from "../sidebar/item-tree"
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
  const tableNodes = useAllNodes({ type: "table", isDeleted: false })
  const { sqlite } = useSqlite()
  const { setNode } = useNodeTree()

  const moveDraftIntoTable = async (nodeId: string, tableId: string) => {
    if (!sqlite) return
    await sqlite.moveDraftIntoTable(nodeId, tableId)
    setNode({
      id: nodeId,
      parent_id: tableId,
    })
  }
  return (
    <Command>
      <CommandInput placeholder="Filter table..." autoFocus={true} />
      <ScrollArea className="">
        <CommandList className="max-h-[300px]">
          <CommandEmpty>No table found.</CommandEmpty>
          <CommandGroup>
            {tableNodes.map((tableNode) => (
              <CommandItem
                key={tableNode.id}
                onClick={() => {}}
                title={tableNode.name || "Untitled"}
                className=" truncate"
                onSelect={(value) => {
                  moveDraftIntoTable(node.id, tableNode.id)
                }}
              >
                <NodeIconEditor
                  icon={tableNode.icon}
                  nodeId={tableNode.id}
                  size="1em"
                  disabled
                  className="ml-[-2px] pr-[6px]"
                  customTrigger={
                    <ItemIcon type={tableNode.type} className="pr-2" />
                  }
                />
                {tableNode.name || "Untitled"}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </ScrollArea>
    </Command>
  )
}
