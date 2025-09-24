import { useEffect, useMemo, useRef, type FC } from "react"
import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import type { Identifier, XYCoord } from "dnd-core"
import { PinIcon } from "lucide-react"
import { useDrag, useDrop } from "react-dnd"
import { Link, useSearchParams } from "react-router-dom"

import { isInkServiceMode } from "@/lib/env"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ExtNodeBadge } from "@/components/ext-node-badge"
import { useCurrentNode } from "@/apps/web-app/hooks/use-current-node"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useAllNodes } from "@/apps/web-app/hooks/use-nodes"
import { NodeIconEditor } from "@/apps/web-app/pages/[database]/[node]/node-icon"
import { useAppRuntimeStore } from "@/apps/web-app/store/runtime-store"

import { ItemIcon } from "../item-tree"
import { NodeItem } from "./node-menu"
import { NodeTreeContainer } from "./node-tree"
import { useFolderStore, type IHoverTarget } from "./store"

export const ItemTypes = {
  CARD: "card",
}

export interface CardProps {
  id: any
  node: ITreeNode
  index: number
  depth: number
  className?: string
  containerId?: string
  // moveCard: (dragIndex: number, hoverIndex: number, dragNodeId: string) => void
  setTarget: (target: IHoverTarget | null) => void
  setTargetFolderId: (id: string | null) => void
  onDrop: (dragItem: DragItem) => void
  // Add optional state props for independent tree instances
  target?: IHoverTarget | null
  targetFolderId?: string | null
  // Add flag to disable child rendering for virtual scrolling
  disableChildren?: boolean
}

export interface DragItem {
  index: number
  id: string
  type: string
  depth: number
  containerId?: string
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
  containerId,
  target: propTarget,
  targetFolderId: propTargetFolderId,
  disableChildren = false,
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
      // Check if the drag item is from the same container
      // Only block if both containers are defined and different
      if (containerId && item.containerId && item.containerId !== containerId) {
        setTargetFolderId(null)
        setTarget(null)
        return
      }

      const drag = item
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
      return { index, depth, containerId, ...node }
    },
    collect: (monitor: any) => ({
      isDragging: monitor.isDragging(),
    }),
    end: (item, monitor) => {
      const didDrop = monitor.didDrop()
      const dropResult = monitor.getDropResult()

      // Only call onDrop if the drop was within the react-dnd context
      // If dropped outside (like on AI editor), react-dnd will consider it as not dropped
      if (didDrop && dropResult) {
        onDrop(item)
      }
      // If dropped outside react-dnd context, we don't need to do anything
      // as the native drag-drop will handle it
    },
    canDrag: !isInkServiceMode,
  })

  // This useEffect adds native drag-and-drop support to coexist with react-dnd.
  // react-dnd uses its own event handling, but doesn't set the native dataTransfer,
  // which is needed for dropping outside of the react-dnd context (e.g., an external editor).
  // By using addEventListener, we can add our own logic without overwriting react-dnd's handlers.
  // useEffect(() => {
  //   const element = ref.current
  //   if (!element) {
  //     return
  //   }

  //   const handleDragStart = (event: DragEvent) => {
  //     // We must not stop propagation, so both react-dnd and native handlers can run.
  //     event.dataTransfer?.setData("text/plain", node.id)
  //     if (event.dataTransfer) {
  //       event.dataTransfer.effectAllowed = "copy"
  //     }
  //     console.log("Native drag started for node:", node.name, node.id)
  //   }

  //   const handleDragEnd = () => {
  //     console.log("Native drag ended for node:", node.name)
  //   }

  //   // react-dnd's `drag` ref will set `draggable=true` on this element.
  //   // We're just adding our listeners to the element.
  //   element.addEventListener("dragstart", handleDragStart)
  //   element.addEventListener("dragend", handleDragEnd)

  //   return () => {
  //     element.removeEventListener("dragstart", handleDragStart)
  //     element.removeEventListener("dragend", handleDragEnd)
  //   }
  // }, [node.id, node.name])

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
      className={cn("flex flex-col gap-1 w-full", {
        "opacity-50": currentCut === node.id,
      })}
    >
      <div
        ref={ref}
        data-handler-id={handlerId}
        className={cn("flex flex-col gap-1 w-full")}
      >
        <div className={cn("group flex w-full", className)}>
          <NodeItem
            node={node}
            databaseName={spaceName}
            key={node.id}
            depth={depth}
          >
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "w-full justify-start font-normal rounded-sm px-2 py-1 text-sm transition-colors text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20",
                node.id === currentNode?.id ? "bg-muted/80" : "hover:bg-muted/80"
              )}
              onClick={setOpen}
              asChild
            >
              <Link
                to={node.type !== "folder" ? link : window.location.pathname}
                className="w-full flex items-center gap-2"
              >
                <NodeIconEditor
                  icon={node.icon!}
                  nodeId={node.id}
                  size="1em"
                  className="flex h-5 w-5 items-center justify-start"
                  customTrigger={
                    <ItemIcon
                      type={
                        node.type === "folder"
                          ? open
                            ? "folder-open"
                            : "folder"
                          : node.type
                      }
                      className="pr-1"
                    />
                  }
                />
                <span className="flex-1 truncate" title={node.name}>
                  {node.name.length === 0 ? "Untitled" : node.name}
                </span>
                <ExtNodeBadge type={node.type} />
                {Boolean(node.is_pinned) && (
                  <PinIcon className="h-4 w-4" />
                )}
              </Link>
            </Button>
          </NodeItem>
          {/* {node.type === "folder" && <CreateNodeTrigger parent_id={node.id} />} */}
        </div>
      </div>
      {!disableChildren && open && node.type === "folder" && (
        <div className="ml-3 border-l pl-1">
          <NodeTreeContainer
            nodes={children}
            depth={depth + 1}
            containerId={containerId}
            target={propTarget}
            targetFolderId={propTargetFolderId}
            setTarget={setTarget}
            setTargetFolderId={setTargetFolderId}
          />
        </div>
      )}
    </div>
  )
}
