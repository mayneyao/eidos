import { useCallback, useEffect, useMemo, useRef } from "react"
import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import { useVirtualList } from "ahooks"

import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useNode } from "@/apps/web-app/hooks/use-nodes"

import { Card, type DragItem } from "./card"
import { useFolderStore, type IHoverTarget } from "./store"
import { flattenTree, type FlattenedNode } from "./tree-flattener"
import { useTreeSidebarStore } from "./tree-sidebar-store"

export interface ContainerState {
  cards: ITreeNode[]
}

export const VirtualNodeTreeContainer = ({
  nodes,
  allNodes,
  depth = 0,
  containerId,
  target: propTarget,
  targetFolderId: propTargetFolderId,
  setTarget: propSetTarget,
  setTargetFolderId: propSetTargetFolderId,
}: {
  nodes: ITreeNode[]
  allNodes: ITreeNode[]
  depth?: number
  containerId?: string
  target?: IHoverTarget | null
  targetFolderId?: string | null
  setTarget?: (target: IHoverTarget | null) => void
  setTargetFolderId?: (id: string | null) => void
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const {
    currentCut,
    setCut,
    folders,
    targetFolderId: globalTargetFolderId,
    setTargetFolderId: globalSetTargetFolderId,
    target: globalTarget,
    setTarget: globalSetTarget,
  } = useFolderStore()

  const { searchTerm, sortField, sortOrder } = useTreeSidebarStore()

  // Use prop values if provided, otherwise fall back to global state
  const targetFolderId =
    propTargetFolderId !== undefined ? propTargetFolderId : globalTargetFolderId
  const target = propTarget !== undefined ? propTarget : globalTarget
  const setTarget = propSetTarget || globalSetTarget
  const setTargetFolderId = propSetTargetFolderId || globalSetTargetFolderId

  // Flatten the tree structure for virtual scrolling
  const flattenedNodes = useMemo(() => {
    return flattenTree(
      allNodes,
      folders,
      depth,
      0,
      null,
      searchTerm,
      sortField,
      sortOrder
    )
  }, [allNodes, folders, depth, searchTerm, sortField, sortOrder])

  const [list, scrollTo] = useVirtualList(flattenedNodes, {
    containerTarget: containerRef,
    wrapperTarget: wrapperRef,
    itemHeight: 34, // 32px height + 2px marginBottom
    overscan: 10, // Increase overscan to ensure bottom items are rendered
  })

  // Force re-render when flattened nodes change
  useEffect(() => {
    if (containerRef.current && wrapperRef.current) {
      // Trigger a resize event to force virtual list recalculation
      window.dispatchEvent(new Event("resize"))
    }
  }, [flattenedNodes.length])

  const { updatePosition, updateParentId } = useNode()

  const onDrop = useCallback(
    (dragItem: DragItem) => {
      const { id: dragId } = dragItem
      setTargetFolderId(null)
      setTarget(null)
      if (!target) return

      // same depth
      if (dragItem.depth === target?.depth) {
        if (targetFolderId && dragId !== targetFolderId) {
          updateParentId(dragId, targetFolderId)
          return
        }
        const dragNode = flattenedNodes.find((item) => item.node.id === dragId)
        if (!dragNode) return
        updateParentId(dragId, target?.parent_id, {
          targetId: target.id,
          targetDirection: target.direction,
        })
      } else {
        updateParentId(dragId, target?.parent_id, {
          targetId: target.id,
          targetDirection: target.direction,
        })
      }
    },
    [
      flattenedNodes,
      setTarget,
      setTargetFolderId,
      target,
      targetFolderId,
      updateParentId,
    ]
  )

  const renderCard = useCallback(
    (flattenedNode: FlattenedNode, index: number) => {
      const { node, depth: nodeDepth } = flattenedNode
      if (!node?.id) return null
      const showBorder = targetFolderId === node.id
      const showNewIndex =
        !showBorder && target?.index === index && target.depth === nodeDepth
      return (
        <Card
          className={cn({
            "rounded-sm ring-2": showBorder,
            "border-b border-blue-400":
              showNewIndex && target.direction === "down",
            "border-t border-blue-400 inset-0":
              showNewIndex && target.direction === "up",
          })}
          depth={nodeDepth}
          key={node.id}
          index={index}
          id={node.id}
          node={node}
          setTarget={setTarget}
          setTargetFolderId={setTargetFolderId}
          onDrop={onDrop}
          containerId={containerId}
          target={target}
          targetFolderId={targetFolderId}
          disableChildren={true}
        />
      )
    },
    [targetFolderId, target, setTarget, setTargetFolderId, onDrop, containerId]
  )

  if (flattenedNodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 px-2 text-center">
        <div className="text-muted-foreground text-xs mb-2">
          {searchTerm ? "No matching nodes" : "No nodes found"}
        </div>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full w-full" ref={containerRef}>
      <div
        ref={wrapperRef}
        className="h-full w-full p-1"
        style={{
          height: flattenedNodes.length * 34, // Set explicit height for virtual scrolling
        }}
      >
        {list.map((item) => {
          const flattenedNode = item.data
          const index = item.index

          return (
            <div
              key={flattenedNode.node.id}
              className="w-full"
              style={{
                height: 32,
                width: "100%",
                display: "flex",
                alignItems: "center",
                marginBottom: 2,
                paddingLeft: flattenedNode.depth * 12, // Add indentation based on depth
              }}
            >
              {renderCard(flattenedNode, index)}
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}
