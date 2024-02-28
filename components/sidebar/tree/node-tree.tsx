import update from "immutability-helper"
import { useCallback, useEffect, useState } from "react"

import { useNode } from "@/hooks/use-nodes"
import { ITreeNode } from "@/lib/store/ITreeNode"

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

    const { updatePosition } = useNode()
    const onDrop = useCallback(
      (dragId: string, index: number) => {
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
      },
      [cards, updatePosition]
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
    }, [])

    const renderCard = useCallback(
      (node: ITreeNode, index: number) => {
        return (
          <Card
            key={node.id}
            index={index}
            id={node.id}
            node={node}
            moveCard={moveCard}
            onDrop={onDrop}
          />
        )
      },
      [moveCard, onDrop]
    )

    return (
      <>
        <div>{cards.map((card, i) => renderCard(card, i))}</div>
      </>
    )
  }
}
