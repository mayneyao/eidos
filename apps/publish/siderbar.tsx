"use client"

import { useEffect, useState } from "react"
import { DndProvider } from "react-dnd"
import { HTML5Backend } from "react-dnd-html5-backend"

import { cn } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useAllNodes } from "@/hooks/use-nodes"
import { useSqlite } from "@/hooks/use-sqlite"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TableListLoading } from "@/components/sidebar/loading"
import { NodeTreeContainer } from "@/components/sidebar/tree/node-tree"

export const SideBar = ({ className }: any) => {
  const { space } = useCurrentPathInfo()
  const [loading, setLoading] = useState(true)
  const { updateNodeList } = useSqlite(space)
  const allNodes = useAllNodes()

  useEffect(() => {
    updateNodeList().then(() => {
      setLoading(false)
    })
  }, [updateNodeList])

  return (
    <>
      <div className={cn("flex h-full flex-col gap-2 p-2", className)}>
        <ScrollArea className="flex h-full max-w-[300px] flex-col justify-between overflow-y-auto">
          {loading ? (
            <TableListLoading />
          ) : (
            <div>
              <div className="max-w-[284px] space-y-1">
                <DndProvider backend={HTML5Backend} context={window}>
                  <NodeTreeContainer
                    nodes={allNodes.filter(
                      (node) => !node.parent_id && !node.is_deleted
                    )}
                  />
                </DndProvider>
              </div>
            </div>
          )}
        </ScrollArea>
      </div>
    </>
  )
}
