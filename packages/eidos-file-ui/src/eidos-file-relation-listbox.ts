import { useCallback, useEffect, useId, useState } from "react"
import type { EidosFileRelationValue } from "@eidos.space/eidos-file"

type EidosFileRelationListboxEdge = "first" | "last"

export function useEidosFileRelationListbox(choices: EidosFileRelationValue[]) {
  const listboxId = useId()
  const [activeOptionId, setActiveOptionId] = useState<string | null>(null)
  const activeOptionIndex = choices.findIndex(
    (choice) => choice.id === activeOptionId
  )

  useEffect(() => {
    setActiveOptionId((current) =>
      choices.some((choice) => choice.id === current)
        ? current
        : (choices[0]?.id ?? null)
    )
  }, [choices])

  const optionId = useCallback(
    (index: number) => `${listboxId}-option-${index}`,
    [listboxId]
  )
  const activeDescendantId =
    activeOptionIndex >= 0 ? optionId(activeOptionIndex) : undefined

  useEffect(() => {
    if (!activeDescendantId) return
    document
      .getElementById(activeDescendantId)
      ?.scrollIntoView?.({ block: "nearest" })
  }, [activeDescendantId])

  const moveActiveOption = useCallback(
    (direction: -1 | 1 | EidosFileRelationListboxEdge) => {
      if (choices.length === 0) return
      let nextIndex: number
      if (direction === "first") {
        nextIndex = 0
      } else if (direction === "last") {
        nextIndex = choices.length - 1
      } else if (activeOptionIndex < 0) {
        nextIndex = direction === 1 ? 0 : choices.length - 1
      } else {
        nextIndex = Math.min(
          choices.length - 1,
          Math.max(0, activeOptionIndex + direction)
        )
      }
      setActiveOptionId(choices[nextIndex]?.id ?? null)
    },
    [activeOptionIndex, choices]
  )

  return {
    activeOption: activeOptionIndex >= 0 ? choices[activeOptionIndex] : null,
    activeOptionId,
    activeOptionIndex,
    activeDescendantId,
    listboxId,
    moveActiveOption,
    optionId,
    setActiveOptionId,
  }
}
