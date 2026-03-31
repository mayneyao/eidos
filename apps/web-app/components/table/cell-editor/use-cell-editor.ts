import { useCallback, useEffect, useRef, useState } from "react"

export interface UseCellEditorOptions {
  /** Whether in editing mode */
  isEditing: boolean
  /** Callback when finishing editing */
  onFinishEditing?: () => void
  /** Callback when canceling editing */
  onCancelEditing?: () => void
  /** Whether editable */
  editable?: boolean
  /** Original value for restoration when canceling editing */
  originalValue?: any
  /** Function to set current value for restoration when canceling editing */
  setValue?: (value: any) => void
}

export interface UseCellEditorReturn {
  /** Whether currently actually editing (considering internal state) */
  isActuallyEditing: boolean
  /** Enter editing mode */
  enterEditing: () => void
  /** Finish editing mode */
  finishEditing: () => void
  /** Cancel editing mode */
  cancelEditing: () => void
  /** Keyboard event handler */
  handleKeyDown: (e: React.KeyboardEvent) => void
  /** Container ref for focusing */
  containerRef: React.RefObject<HTMLDivElement | null>
}

/**
 * Cell Editor unified behavior Hook
 *
 * Provides unified keyboard interaction and editing state management:
 * - Enter: Enter editing mode
 * - Escape: Cancel editing and restore original value
 */
export function useCellEditor({
  isEditing,
  onFinishEditing,
  onCancelEditing,
  editable = true,
  originalValue,
  setValue,
}: UseCellEditorOptions): UseCellEditorReturn {
  const [isInternalEditing, setIsInternalEditing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const isActuallyEditing = editable && (isEditing || isInternalEditing)

  const enterEditing = useCallback(() => {
    if (editable) {
      setIsInternalEditing(true)
    }
  }, [editable])

  const finishEditing = useCallback(() => {
    setIsInternalEditing(false)
    onFinishEditing?.()
  }, [onFinishEditing])

  const cancelEditing = useCallback(() => {
    setIsInternalEditing(false)
    if (setValue && originalValue !== undefined) {
      setValue(originalValue)
    }
    onCancelEditing?.()
  }, [onCancelEditing, originalValue, setValue])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!editable) return

      if (e.key === "Enter" && !isActuallyEditing) {
        e.preventDefault()
        e.stopPropagation()
        enterEditing()
        return
      }

      if (e.key === "Escape" && isActuallyEditing) {
        e.preventDefault()
        e.stopPropagation()
        cancelEditing()
        return
      }
    },
    [editable, isActuallyEditing, enterEditing, cancelEditing]
  )

  // Sync internal state when external isEditing becomes true
  useEffect(() => {
    if (isEditing) {
      setIsInternalEditing(true)
    } else {
      setIsInternalEditing(false)
    }
  }, [isEditing])

  return {
    isActuallyEditing,
    enterEditing,
    finishEditing,
    cancelEditing,
    handleKeyDown,
    containerRef,
  }
}
