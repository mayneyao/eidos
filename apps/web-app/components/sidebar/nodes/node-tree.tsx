import { useCallback, useEffect, useState } from "react"

import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import { cn } from "@/lib/utils"
import { useNode } from "@/apps/web-app/hooks/use-nodes"

import type { DragItem } from "./card";
import { Card } from "./card"
import type { IHoverTarget } from "./store";
import { useFolderStore } from "./store"

export interface ContainerState {
  cards: ITreeNode[]
}

export const NodeTreeContainer = ({
  nodes,
  depth = 0,
  containerId,
  target: propTarget,
  targetFolderId: propTargetFolderId,
  setTarget: propSetTarget,
  setTargetFolderId: propSetTargetFolderId,
}: {
  nodes: ITreeNode[]
  depth?: number
  containerId?: string
  target?: IHoverTarget | null
  targetFolderId?: string | null
  setTarget?: (target: IHoverTarget | null) => void
  setTargetFolderId?: (id: string | null) => void
}) => {
  const [cards, setCards] = useState(nodes)
  const {
    currentCut,
    setCut,
    targetFolderId: globalTargetFolderId,
    setTargetFolderId: globalSetTargetFolderId,
    target: globalTarget,
    setTarget: globalSetTarget,
  } = useFolderStore()
  
  // Use prop values if provided, otherwise fall back to global state
  const targetFolderId = propTargetFolderId !== undefined ? propTargetFolderId : globalTargetFolderId
  const target = propTarget !== undefined ? propTarget : globalTarget
  const setTarget = propSetTarget || globalSetTarget
  const setTargetFolderId = propSetTargetFolderId || globalSetTargetFolderId
  
  useEffect(() => {
    setCards(nodes)
  }, [nodes])
  // console.log(cards.map((card) => card.name))
  // const currentNode = useCurrentNode()

  // useKeyPress(["meta.x", "ctrl.x"], () => {
  //   setCut(currentNode?.id || null)
  // })

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
        const dragNode = cards.find((card) => card.id === dragId)
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
      cards,
      setTarget,
      setTargetFolderId,
      target,
      targetFolderId,
      updateParentId,
    ]
  )

  const renderCard = useCallback(
    (node: ITreeNode, index: number) => {
      if (!node?.id) return null
      const showBorder = targetFolderId === node.id
      const showNewIndex =
        !showBorder && target?.index === index && target.depth === depth
      return (
        <Card
          className={cn({
            "rounded-sm ring-2": showBorder,
            "border-b border-blue-400":
              showNewIndex && target.direction === "down",
            "border-t border-blue-400 inset-0":
              showNewIndex && target.direction === "up",
          })}
          depth={depth}
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
        />
      )
    },
    [targetFolderId, target, depth, setTarget, setTargetFolderId, onDrop, containerId]
  )

  return (
    <>
      <div className="flex flex-col">
        {cards.map((card, i) => renderCard(card, i))}
      </div>
    </>
  )
}
