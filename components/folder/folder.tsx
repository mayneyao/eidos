import { useVirtualList } from "ahooks"
import { useRef } from "react"

import { useAllNodes } from "@/hooks/use-nodes"
import { ITreeNode } from "@/lib/store/ITreeNode"
import { cn } from "@/lib/utils"

import { NodeName } from "../node-name"
import { Button } from "../ui/button"
import { ScrollArea } from "../ui/scroll-area"

export const FolderComponent = ({
  folderId,
  setFolder: appendFolder,
  currentNode,
  index,
  folderList,
  setCurrentNode,
  setCurrentIndex,
}: {
  folderList: (string | undefined)[]
  index: number
  folderId?: string
  setFolder: (fid: string, index: number) => void
  currentNode: ITreeNode | null
  setCurrentNode: (node: ITreeNode) => void
  setCurrentIndex: (index: number) => void
}) => {
  const allNodes = useAllNodes({ parent_id: folderId })
  const activeFolder = folderList[index + 1]
  const containerRef = useRef(null)
  const wrapperRef = useRef(null)
  const [list] = useVirtualList(allNodes, {
    containerTarget: containerRef,
    wrapperTarget: wrapperRef,
    itemHeight: 36,
    overscan: 10,
  })

  const handleNodeClick = (node: ITreeNode) => {
    setCurrentNode(node)
    setCurrentIndex(index)
    if (node.type === "folder") {
      appendFolder(node.id, index)
    }
  }
  return (
    <ScrollArea
      className={cn("w-[300px] space-y-1 border-r p-2", {
        hidden: allNodes.length === 0,
      })}
      ref={containerRef}
    >
      <div ref={wrapperRef} className="h-full">
        {list.map((item) => {
          const node = item.data
          return (
            <div className={cn("group flex w-full")}>
              <Button
                variant={
                  activeFolder === node.id || node.id === currentNode?.id
                    ? "secondary"
                    : "ghost"
                }
                size="sm"
                className="w-full cursor-default justify-start font-normal"
                onClick={() => handleNodeClick(node)}
                asChild
              >
                <div>
                  <NodeName node={node} />
                </div>
              </Button>
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}
