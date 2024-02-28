import { useRef, type FC } from "react"
import type { Identifier, XYCoord } from "dnd-core"
import { useDrag, useDrop } from "react-dnd"
import { Link, useSearchParams } from "react-router-dom"

import { ITreeNode } from "@/lib/store/ITreeNode"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { useCurrentNode } from "@/hooks/use-current-node"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useAllNodes } from "@/hooks/use-nodes"
import { Button } from "@/components/ui/button"
import { NodeIconEditor } from "@/app/[database]/[node]/node-icon"

import { ItemIcon } from "../item-tree"
import { NodeItem } from "../node-menu"

export const ItemTypes = {
  CARD: "card",
}

export interface CardProps {
  id: any
  node: ITreeNode
  index: number
  moveCard: (dragIndex: number, hoverIndex: number) => void
  onDrop: (dragId: string, index: number) => void
}

interface DragItem {
  index: number
  id: string
  type: string
}

export const Card: FC<CardProps> = ({ id, node, index, moveCard, onDrop }) => {
  const { space: spaceName } = useCurrentPathInfo()
  const [searchParams] = useSearchParams()
  const allTableNodes = useAllNodes({ type: "table" })
  const currentNode = useCurrentNode()
  const ref = useRef<HTMLDivElement>(null)
  const [{ handlerId }, drop] = useDrop<
    DragItem,
    void,
    { handlerId: Identifier | null }
  >({
    accept: ItemTypes.CARD,
    collect(monitor) {
      return {
        handlerId: monitor.getHandlerId(),
      }
    },
    hover(item: DragItem, monitor) {
      if (!ref.current) {
        return
      }
      const dragIndex = item.index
      const hoverIndex = index

      // Don't replace items with themselves
      if (dragIndex === hoverIndex) {
        return
      }

      // Determine rectangle on screen
      const hoverBoundingRect = ref.current?.getBoundingClientRect()

      // Get vertical middle
      const hoverMiddleY =
        (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2

      // Determine mouse position
      const clientOffset = monitor.getClientOffset()

      // Get pixels to the top
      const hoverClientY = (clientOffset as XYCoord).y - hoverBoundingRect.top

      // Only perform the move when the mouse has crossed half of the items height
      // When dragging downwards, only move when the cursor is below 50%
      // When dragging upwards, only move when the cursor is above 50%

      // Dragging downwards
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return
      }

      // Dragging upwards
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
        return
      }

      // Time to actually perform the action
      moveCard(dragIndex, hoverIndex)

      // Note: we're mutating the monitor item here!
      // Generally it's better to avoid mutations,
      // but it's good here for the sake of performance
      // to avoid expensive index searches.
      item.index = hoverIndex
    },
  })

  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.CARD,
    item: () => {
      return { id, index }
    },
    collect: (monitor: any) => ({
      isDragging: monitor.isDragging(),
    }),
    end: (item, monitor) => {
      const didDrop = monitor.didDrop()
      if (didDrop) {
        onDrop(item.id, index)
      }
    },
  })

  const opacity = isDragging ? 0 : 1
  const { isShareMode } = useAppRuntimeStore()

  drag(drop(ref))

  const link = isShareMode
    ? `/share/${spaceName}/${node.id}?` + searchParams.toString()
    : `/${spaceName}/${node.id}`
  return (
    <div ref={ref} style={{ opacity }} data-handler-id={handlerId}>
      <NodeItem
        node={node}
        databaseName={spaceName}
        key={node.id}
        tableNodes={allTableNodes}
      >
        <Button
          variant={node.id === currentNode?.id ? "secondary" : "ghost"}
          size="sm"
          className="w-full justify-start font-normal"
          asChild
        >
          <Link to={link}>
            <NodeIconEditor
              icon={node.icon!}
              nodeId={node.id}
              size="1em"
              className="ml-[-2px] pr-[6px]"
              customTrigger={<ItemIcon type={node.type} className="pr-2" />}
            />
            <span className="truncate" title={node.name}>
              {node.name.length === 0 ? "Untitled" : node.name}
            </span>
          </Link>
        </Button>
      </NodeItem>
    </div>
  )
}
