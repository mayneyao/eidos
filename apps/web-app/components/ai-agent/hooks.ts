import {
  useCallback,
  useState,
  useLayoutEffect,
  useRef,
  useEffect,
} from "react"
import { useClickAway } from "ahooks"

/**
 * Hook to handle popover positioning relative to an anchor element
 */
export function usePopoverPosition(
  anchorRef: React.RefObject<HTMLElement | null>,
  open: boolean
) {
  const [position, setPosition] = useState(() => {
    const anchor = anchorRef.current
    if (!anchor) return { top: 0, left: 0, width: 0 }
    const rect = anchor.getBoundingClientRect()
    return {
      top: rect.top - 4,
      left: rect.left,
      width: rect.width,
    }
  })

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current
    if (!anchor) return
    const rect = anchor.getBoundingClientRect()
    setPosition({
      top: rect.top - 4,
      left: rect.left,
      width: rect.width,
    })
  }, [anchorRef])

  useLayoutEffect(() => {
    if (open) {
      updatePosition()
    }
  }, [open, updatePosition])

  return { position, updatePosition }
}

/**
 * Hook to manage the trigger state (@ or $) in a textarea
 */
export function useTriggerState() {
  const [triggerState, setTriggerState] = useState<{
    active: boolean
    type: "skill" | "node" | null
    startIndex: number
    query: string
  }>({ active: false, type: null, startIndex: -1, query: "" })

  const [activeIndex, setActiveIndex] = useState(0)

  const resetTrigger = useCallback(() => {
    setTriggerState({ active: false, type: null, startIndex: -1, query: "" })
    setActiveIndex(0)
  }, [])

  return {
    triggerState,
    setTriggerState,
    activeIndex,
    setActiveIndex,
    resetTrigger,
  }
}
