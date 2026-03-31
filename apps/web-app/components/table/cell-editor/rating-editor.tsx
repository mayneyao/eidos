import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import { cn } from "@/lib/utils"
import useChangeEffect from "../hooks/use-change-effect"
import type { CellEditorProps, CellEditorRef } from "./types"
import { useCellEditor } from "./use-cell-editor"

interface IRatingEditorProps extends CellEditorProps<number> {}

export const RatingEditor = forwardRef<CellEditorRef, IRatingEditorProps>(
  (
    {
      value,
      onChange,
      isEditing,
      onFinishEditing,
      onCancelEditing,
      layout = "flow",
    },
    ref
  ) => {
    const [_value, setValue] = useState<number>(value)
    const [hover, setHover] = useState(0)
    const containerRef = useRef<HTMLDivElement>(null)

    const { isActuallyEditing, handleKeyDown, finishEditing, cancelEditing } =
      useCellEditor({
        isEditing,
        onFinishEditing,
        onCancelEditing,
        originalValue: value,
        setValue,
      })

    useImperativeHandle(ref, () => ({
      startEditing: () => {},
      finishEditing,
      cancelEditing,
      focus: () => {
        containerRef.current?.focus()
      },
    }))

    useChangeEffect(() => {
      onChange(_value)
    }, [_value, onChange])

    useEffect(() => {
      setValue(value)
    }, [value])

    const handleStarClick = (ratingValue: number) => {
      setValue(ratingValue)
      finishEditing()
    }

    const handleKeyDownLocal = (e: React.KeyboardEvent) => {
      handleKeyDown(e)
      if (e.defaultPrevented) return

      if (!isActuallyEditing) return

      if (e.key === "ArrowLeft") {
        e.preventDefault()
        e.stopPropagation()
        setValue((prev) => Math.max(0, prev - 1))
        return
      }

      if (e.key === "ArrowRight") {
        e.preventDefault()
        e.stopPropagation()
        setValue((prev) => Math.min(5, prev + 1))
        return
      }

      if (e.key >= "1" && e.key <= "5") {
        e.preventDefault()
        e.stopPropagation()
        setValue(parseInt(e.key, 10))
        return
      }

      if (e.key === "0") {
        e.preventDefault()
        e.stopPropagation()
        setValue(0)
        return
      }

      if (e.key === "Enter") {
        e.preventDefault()
        e.stopPropagation()
        finishEditing()
        return
      }
    }

    // Select container styles based on layout mode
    const containerClasses = cn(
      "flex items-center",
      layout === "fill" && "absolute inset-0 px-2",
      layout === "inline" && "inline-flex px-2",
      layout === "flow" && "relative w-full h-full",
      isActuallyEditing && "bg-muted/30 rounded-xs px-2"
    )

    return (
      <div
        ref={containerRef}
        className={containerClasses}
        onKeyDown={handleKeyDownLocal}
        tabIndex={0}
      >
        {[...Array(5)].map((_, i) => {
          const ratingValue = i + 1
          return (
            <label
              key={i}
              className={cn(
                "cursor-pointer transition-colors",
                ratingValue <= (isActuallyEditing ? hover || _value : _value)
                  ? "text-amber-400"
                  : "text-gray-300 hover:text-gray-400"
              )}
            >
              <svg
                onClick={() =>
                  isActuallyEditing && handleStarClick(ratingValue)
                }
                className="h-5 w-5"
                fill={
                  ratingValue <= (isActuallyEditing ? hover || _value : _value)
                    ? "currentColor"
                    : "none"
                }
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                onMouseEnter={() => isActuallyEditing && setHover(ratingValue)}
                onMouseLeave={() => isActuallyEditing && setHover(_value)}
                viewBox="0 0 24 24"
              >
                <path d="M12 2l3.09 6.89L22 9.5l-5 4.36 1.18 6.85L12 17.77l-6.18 3.94L7 13.86 2 9.5l6.91-0.61L12 2z"></path>
              </svg>
            </label>
          )
        })}
      </div>
    )
  }
)

RatingEditor.displayName = "RatingEditor"
