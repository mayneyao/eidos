import { useCallback, useEffect, useState } from "react"
import update from "immutability-helper"

import { ITreeNode } from "@/lib/store/ITreeNode"
import { cn } from "@/lib/utils"
import { useNode } from "@/hooks/use-nodes"

import { Card } from "./card"

export interface ContainerState {
  cards: ITreeNode[]
}

export const NodeTreeContainer = ({ nodes }: { nodes: ITreeNode[] }) => {
  {
    const [cards, setCards] = useState(nodes)
    useEffect(() => {
      setCards(nodes)
    }, [nodes])

    const [targetCard, setTargetCard] = useState<ITreeNode | null>(null)
    const { updatePosition, updateParentId } = useNode()
    const onDrop = useCallback(
      (dragId: string, index: number) => {
        if (targetCard) {
          // move into folder
          if (dragId !== targetCard.id) {
            updateParentId(dragId, targetCard.id)
          }
        } else {
          const dragNode = cards.find((card) => card.id === dragId)
          if (!dragNode) return
          const prevIndex = index - 1
          const nextIndex = index + 1
          const prevNode = cards[prevIndex]
          const nextNode = cards[nextIndex]
          const newPosition = () => {
            if (prevIndex === -1) {
              return nextNode?.position! + 0.5
            }
            if (!nextNode) {
              return prevNode?.position! / 2
            }
            return ((prevNode?.position! || 0) + nextNode?.position!) / 2
          }
          updatePosition(dragId, newPosition())
        }
        setTargetCard(null)
      },
      [cards, targetCard, updateParentId, updatePosition]
    )

    const moveCard = useCallback((dragIndex: number, hoverIndex: number) => {
      setCards((prevCards: ITreeNode[]) => {
        return update(prevCards, {
          $splice: [
            [dragIndex, 1],
            [hoverIndex, 0, prevCards[dragIndex] as ITreeNode],
          ],
        })
      })
      setTargetCard(null)
    }, [])

    const moveIntoCard = useCallback(
      (dragIndex: number, hoverIndex: number) => {
        const _targetCard = cards[hoverIndex]
        if (!_targetCard) {
          setTargetCard(null)
          return
        }
        if (_targetCard.id === targetCard?.id) return
        if (_targetCard.type === "folder") {
          setTargetCard(_targetCard)
        } else {
          setTargetCard(null)
        }
      },
      [cards, targetCard]
    )

    const renderCard = useCallback(
      (node: ITreeNode, index: number) => {
        if (!node?.id) return null
        const showBorder = targetCard?.id === node.id
        return (
          <Card
            className={cn({
              border: showBorder,
            })}
            key={node.id}
            index={index}
            id={node.id}
            node={node}
            moveCard={moveCard}
            moveIntoCard={moveIntoCard}
            onDrop={onDrop}
          />
        )
      },
      [moveCard, moveIntoCard, onDrop, targetCard?.id]
    )

    return (
      <>
        <div className="flex flex-col gap-1">
          {cards.map((card, i) => renderCard(card, i))}
        </div>
      </>
    )
  }
}
