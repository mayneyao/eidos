import { useEffect, useMemo, useRef, type FC } from "react"
import type { Identifier, XYCoord } from "dnd-core"
import { useDrag, useDrop } from "react-dnd"
import { Link, useSearchParams } from "react-router-dom"

import { isInkServiceMode } from "@/lib/env"
import { ITreeNode } from "@/lib/store/ITreeNode"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { cn } from "@/lib/utils"
import { useCurrentNode } from "@/hooks/use-current-node"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useAllNodes } from "@/hooks/use-nodes"
import { Button } from "@/components/ui/button"
import { NodeIconEditor } from "@/apps/web-app/[database]/[node]/node-icon"

import { ItemIcon } from "../item-tree"
import { NodeItem } from "./node-menu"
import { NodeTreeContainer } from "./node-tree"
import { IHoverTarget, useFolderStore } from "./store"

export const ItemTypes = {
  CARD: "card",
}

export interface CardProps {
  id: any
  node: ITreeNode
  index: number
  depth: number
  className?: string
  // moveCard: (dragIndex: number, hoverIndex: number, dragNodeId: string) => void
  setTarget: (target: IHoverTarget | null) => void
  setTargetFolderId: (id: string | null) => void
  onDrop: (dragItem: DragItem) => void
}

export interface DragItem {
  index: number
  id: string
  type: string
  depth: number
  parent_id?: string
}

export const Card: FC<CardProps> = ({
  id,
  node,
  index,
  setTarget,
  onDrop,
  className,
  depth,
  setTargetFolderId,
}) => {
  const { space: spaceName } = useCurrentPathInfo()
  const [searchParams] = useSearchParams()
  const allNodes = useAllNodes({ parent_id: node.id })
  const currentNode = useCurrentNode()
  const ref = useRef<HTMLDivElement>(null)
  const { folders, toggleFolder, closeFolder, currentCut } = useFolderStore()

  const children = useMemo(
    () => allNodes.filter((i) => !i.is_deleted),
    [allNodes]
  )
  const open = folders[node.id]
  const setOpen = () => {
    toggleFolder(node.id)
  }

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
      const drag = monitor.getItem()
      // if (drag.depth !== depth && node.type !== "folder") {
      // if (drag.depth !== depth && node.type !== "folder") {
      //   console.log("return 1")
      //   setTargetFolderId(null)
      //   return
      // }
      // if (drag.parent_id === node.id) {
      //   console.log("return 2")
      //   setTargetFolderId(null)
      //   return
      // }
      if (!ref.current) {
        setTargetFolderId(null)
        setTarget(null)
        return
      }
      if (node.type === "folder") {
        setTargetFolderId(node.id)
        // return
      }

      const dragIndex = item.index
      const hoverIndex = index
      // Don't replace items with themselves
      if (dragIndex === hoverIndex && drag.depth === depth) {
        setTargetFolderId(null)
        setTarget(null)
        return
      }

      // Determine rectangle on screen
      const hoverBoundingRect = ref.current?.getBoundingClientRect()
      // set ref.current style with border

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

      // // Dragging downwards
      // if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY * 3) {
      //   // moveIntoCard(dragIndex, hoverIndex)
      //   // setTarget(hoverIndex, "up")
      //   return
      // }

      // // Dragging upwards
      // if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
      //   // moveIntoCard(dragIndex, hoverIndex)
      //   // setTarget(hoverIndex, "down")
      //   return
      // }

      // if node is folder, we split the drop area into 3 parts, up: 1/4, middle: 1/2, down: 1/4
      if (
        node.type === "folder" &&
        hoverClientY > hoverBoundingRect.height / 4 &&
        hoverClientY < (hoverBoundingRect.height / 4) * 3
      ) {
        return
      }

      const direction = hoverClientY < hoverMiddleY ? "up" : "down"
      setTarget({
        index: hoverIndex,
        direction,
        depth,
        ...node,
      })

      // Time to actually perform the action
      // moveCard(dragIndex, hoverIndex, drag.id)

      // Note: we're mutating the monitor item here!
      // Generally it's better to avoid mutations,
      // but it's good here for the sake of performance
      // to avoid expensive index searches.
      // item.index = hoverIndex
    },
  })

  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.CARD,
    item: () => {
      return { index, depth, ...node }
    },
    collect: (monitor: any) => ({
      isDragging: monitor.isDragging(),
    }),
    end: (item, monitor) => {
      const didDrop = monitor.didDrop()
      if (didDrop) {
        onDrop(item)
      }
    },
    canDrag: !isInkServiceMode,
  })

  // const opacity = isDragging ? 0 : 1
  useEffect(() => {
    isDragging && closeFolder(node.id)
  }, [isDragging, node.id, closeFolder])

  const { isShareMode } = useAppRuntimeStore()

  drag(drop(ref))

  const link = isShareMode
    ? `/share/${spaceName}/${node.id}?` + searchParams.toString()
    : `/${spaceName}/${node.id}`

  return (
    <div
      className={cn("flex flex-col gap-1", {
        "opacity-50": currentCut === node.id,
      })}
    >
      <div
        ref={ref}
        data-handler-id={handlerId}
        className={cn("flex flex-col gap-1")}
      >
        <div className={cn("group flex w-full", className)}>
          <NodeItem
            node={node}
            databaseName={spaceName}
            key={node.id}
            depth={depth}
          >
            <Button
              variant={node.id === currentNode?.id ? "secondary" : "ghost"}
              size="sm"
              className="w-full justify-start font-normal"
              onClick={setOpen}
              asChild
            >
              <Link
                to={node.type !== "folder" ? link : window.location.pathname}
                className="w-full"
              >
                <NodeIconEditor
                  icon={node.icon!}
                  nodeId={node.id}
                  size="1em"
                  className="flex h-6 w-6 items-center justify-start"
                  customTrigger={
                    <ItemIcon
                      type={
                        node.type === "folder"
                          ? open
                            ? "folder-open"
                            : "folder"
                          : node.type
                      }
                      className="pr-2"
                    />
                  }
                />
                <span className="truncate" title={node.name}>
                  {node.name.length === 0 ? "Untitled" : node.name}
                </span>
              </Link>
            </Button>
          </NodeItem>
          {/* {node.type === "folder" && <CreateNodeTrigger parent_id={node.id} />} */}
        </div>
      </div>
      {open && node.type === "folder" && (
        <div className="ml-3 border-l pl-1">
          <NodeTreeContainer nodes={children} depth={depth + 1} />
        </div>
      )}
    </div>
  )
}
