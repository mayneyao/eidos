import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"

import { cn } from "@/lib/utils"
import useChangeEffect from "../hooks/use-change-effect"
import { EmptyValue, getLayoutClasses, getInputWrapperClasses } from "./common"
import type { CellEditorRef } from "./types"
import { useCellEditor } from "./use-cell-editor"

interface ITextBaseEditorProps {
  value: string | null
  onChange: (value: string | null) => void
  type?: "text" | "number" | "url"
  isEditing: boolean
  onFinishEditing?: () => void
  onCancelEditing?: () => void
  multiline?: boolean
  /**
   * When true, display full content even in non-editing state (no line break truncation),
   * used for scenarios like doc-property that need to always show complete content
   */
  displayMode?: boolean
  /**
   * Layout mode
   * @default "flow"
   */
  layout?: "fill" | "flow" | "inline"
  disabled?: boolean
}

export const TextBaseEditor = forwardRef<CellEditorRef, ITextBaseEditorProps>(
  (
    {
      value,
      isEditing,
      onChange,
      type = "text",
      onFinishEditing,
      onCancelEditing,
      multiline = false,
      displayMode = false,
      layout = "flow",
      disabled = false,
    },
    ref
  ) => {
    const [_value, setValue] = useState(value)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

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
        if (multiline && type === "text") {
          const el = textareaRef.current
          if (el) {
            el.focus()
            const length = el.value.length
            el.setSelectionRange(length, length)
          }
        } else {
          const el = inputRef.current
          if (el) {
            el.focus()
            const length = el.value.length
            el.setSelectionRange(length, length)
          }
        }
      },
    }))

    useChangeEffect(() => {
      onChange(_value || null)
    }, [_value, onChange])

    // Sync internal state when external value changes
    useEffect(() => {
      setValue(value)
    }, [value])

    // Auto-adjust textarea height
    useEffect(() => {
      if (multiline && textareaRef.current) {
        textareaRef.current.style.height = "auto"
        textareaRef.current.style.height =
          textareaRef.current.scrollHeight + "px"
      }
    }, [_value, multiline, isActuallyEditing])

    // Number type: validate input to only allow numbers, decimal points, and minus signs
    const handleNumberInputChange = (
      e: React.ChangeEvent<HTMLInputElement>
    ) => {
      const inputValue = e.target.value
      if (inputValue === "" || /^-?\d*\.?\d*$/.test(inputValue)) {
        setValue(inputValue)
      }
    }

    const parseNumber = (str: any): number | null => {
      if (!str || typeof str !== "string" || str.trim() === "") return null
      const num = Number(str)
      return isNaN(num) ? null : num
    }

    const containerClasses = getLayoutClasses(
      layout,
      isActuallyEditing,
      disabled
    )
    const inputWrapperClasses = getInputWrapperClasses(layout)

    // displayMode: for doc-property, always display full content
    if (displayMode && !isActuallyEditing) {
      // Handle number type: convert to string for display
      const displayValue =
        type === "number" && _value != null
          ? Number(_value).toLocaleString()
          : _value
      const hasValue = displayValue != null && String(displayValue).length > 0
      return (
        <div className={containerClasses}>
          <div className="text-sm leading-[1.5] w-full whitespace-pre-wrap break-words min-h-[21px]">
            {hasValue ? displayValue : <EmptyValue />}
          </div>
        </div>
      )
    }

    // Non-editing state
    if (!isActuallyEditing) {
      if (type === "number") {
        const strValue = _value != null ? String(_value) : ""
        const displayValue = strValue ? parseNumber(strValue) : null
        return (
          <div className={containerClasses}>
            <span className="text-sm text-foreground truncate">
              {displayValue !== null ? (
                displayValue.toLocaleString()
              ) : (
                <EmptyValue />
              )}
            </span>
          </div>
        )
      }
      if (multiline) {
        return (
          <div className={containerClasses}>
            <span className="text-sm whitespace-pre-wrap w-full">
              {_value?.length ? _value : <EmptyValue />}
            </span>
          </div>
        )
      }
      return (
        <div className={containerClasses}>
          <span className="text-sm truncate w-full">
            {_value?.length ? _value : <EmptyValue />}
          </span>
        </div>
      )
    }

    // Editing state
    if (type === "number") {
      return (
        <div className={containerClasses}>
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            value={_value || ""}
            onChange={handleNumberInputChange}
            onKeyDown={(e) => {
              handleKeyDown(e)
              if (e.key === "Enter") {
                e.preventDefault()
                e.stopPropagation()
                const strValue = String(_value || "")
                const numValue = parseNumber(strValue)
                setValue(numValue !== null ? String(numValue) : "")
                finishEditing()
              }
            }}
            onBlur={() => {
              const strValue = String(_value || "")
              const numValue = parseNumber(strValue)
              setValue(numValue !== null ? String(numValue) : "")
              finishEditing()
            }}
            className={cn(
              "min-h-[21px] bg-transparent border-none outline-hidden focus:outline-hidden text-sm px-0",
              inputWrapperClasses
            )}
            placeholder="Enter number..."
            autoFocus
          />
        </div>
      )
    }

    if (multiline && type === "text") {
      return (
        <div className={containerClasses}>
          <textarea
            ref={textareaRef}
            value={_value || ""}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              handleKeyDown(e)
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                e.stopPropagation()
                finishEditing()
              }
            }}
            onBlur={() => finishEditing()}
            className={cn(
              "min-h-[21px] px-0 py-0 text-sm border-none rounded-none focus:outline-hidden bg-transparent resize-none overflow-hidden leading-[1.5]",
              inputWrapperClasses
            )}
            placeholder="Empty"
            autoFocus
            rows={1}
          />
        </div>
      )
    }

    return (
      <div className={containerClasses}>
        <input
          ref={inputRef}
          value={_value || ""}
          type={type}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            handleKeyDown(e)
            if (e.key === "Enter") {
              e.preventDefault()
              e.stopPropagation()
              finishEditing()
            }
          }}
          onBlur={() => finishEditing()}
          className={cn(
            "min-h-[21px] text-sm border-none rounded-none focus:outline-hidden bg-transparent px-0",
            inputWrapperClasses
          )}
          placeholder="Enter value..."
          autoFocus
        />
      </div>
    )
  }
)

TextBaseEditor.displayName = "TextBaseEditor"
