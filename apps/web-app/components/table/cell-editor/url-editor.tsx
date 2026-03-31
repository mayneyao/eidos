import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"

import { cn } from "@/lib/utils"
import { useRouterAdapter } from "@/apps/web-app/hooks/use-router-adapter"
import useChangeEffect from "../hooks/use-change-effect"
import { EmptyValue, getLayoutClasses, getInputWrapperClasses } from "./common"
import type { CellEditorRef } from "./types"
import { useCellEditor } from "./use-cell-editor"

interface IUrlEditorProps {
  value: string | null
  onChange: (value: string | null) => void
  isEditing: boolean
  onFinishEditing?: () => void
  onCancelEditing?: () => void
  multiline?: boolean
  displayMode?: boolean
  /**
   * Layout mode
   * @default "flow"
   */
  layout?: "fill" | "flow" | "inline"
  disabled?: boolean
}

export const UrlEditor = forwardRef<CellEditorRef, IUrlEditorProps>(
  (
    {
      value,
      isEditing,
      onChange,
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
    const inputRef = useRef<HTMLInputElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const { navigate } = useRouterAdapter()

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
        if (multiline) {
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

    useEffect(() => {
      setValue(value)
    }, [value])

    useEffect(() => {
      if (multiline && textareaRef.current) {
        textareaRef.current.style.height = "auto"
        textareaRef.current.style.height =
          textareaRef.current.scrollHeight + "px"
      }
    }, [_value, multiline, isActuallyEditing])

    const containerClasses = getLayoutClasses(
      layout,
      isActuallyEditing,
      disabled
    )
    const inputWrapperClasses = getInputWrapperClasses(layout)

    // Helper function to handle internal link navigation
    const handleLinkClick = (e: React.MouseEvent, url: string) => {
      e.stopPropagation()
      // Internal paths starting with "/" should use navigate
      // to avoid triggering Electron's setWindowOpenHandler which throws
      // "Unsupported path" error for non-standalone-blocks/files paths
      if (url.startsWith("/") && navigate) {
        e.preventDefault()
        const openInNewTab = e.ctrlKey || e.metaKey
        navigate(url, {
          target: openInNewTab ? "_blank" : undefined,
        })
      }
    }

    // displayMode: always display full content
    if (displayMode && !isActuallyEditing) {
      return (
        <div className={containerClasses}>
          <div className="text-sm whitespace-pre-wrap leading-[1.5] w-full">
            {_value ? (
              <a
                href={_value}
                target={_value.startsWith("/") ? undefined : "_blank"}
                rel="noopener noreferrer"
                className="text-primary underline hover:text-primary/80"
                onClick={(e) => handleLinkClick(e, _value)}
              >
                {_value}
              </a>
            ) : (
              <EmptyValue />
            )}
          </div>
        </div>
      )
    }

    // Non-editing state
    if (!isActuallyEditing) {
      return (
        <div className={containerClasses}>
          {_value ? (
            <a
              href={_value}
              target={_value.startsWith("/") ? undefined : "_blank"}
              rel="noopener noreferrer"
              className="text-primary underline hover:text-primary/80 truncate w-full text-sm"
              onClick={(e) => handleLinkClick(e, _value)}
            >
              {_value}
            </a>
          ) : (
            <EmptyValue />
          )}
        </div>
      )
    }

    // Editing state
    if (multiline) {
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
            placeholder="Enter URL..."
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
          type="url"
          value={_value || ""}
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
            "text-sm border-none rounded-none focus:outline-hidden bg-transparent px-0",
            inputWrapperClasses
          )}
          placeholder="Enter URL..."
          autoFocus
        />
      </div>
    )
  }
)

UrlEditor.displayName = "UrlEditor"
