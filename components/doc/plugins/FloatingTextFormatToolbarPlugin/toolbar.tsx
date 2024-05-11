import { useCallback, useEffect, useRef, useState } from "react"
import { TOGGLE_LINK_COMMAND } from "@lexical/link"
import { mergeRegister } from "@lexical/utils"
import { useKeyPress } from "ahooks"
import {
  $getSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  LexicalEditor,
  SELECTION_CHANGE_COMMAND,
} from "lexical"
import {
  Baseline,
  Bold,
  ChevronDown,
  Code,
  Italic,
  Link,
  SparkleIcon,
  SparklesIcon,
  Strikethrough,
  Subscript,
  Superscript,
  Underline,
} from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Toggle } from "@/components/ui/toggle"

import { getDOMRangeRect } from "../../utils/getDOMRangeRect"
import { setFloatingElemPosition } from "../../utils/setFloatingElemPosition"
import { INSERT_AI_COMMAND } from "../AIToolsPlugin"
import { ColorPicker } from "./color-picker"

export function TextFormatFloatingToolbar({
  editor,
  anchorElem,
  isLink,
  isBold,
  isItalic,
  isUnderline,
  isCode,
  isStrikethrough,
  isSubscript,
  isSuperscript,
}: {
  editor: LexicalEditor
  anchorElem: HTMLElement
  isBold: boolean
  isCode: boolean
  isItalic: boolean
  isLink: boolean
  isStrikethrough: boolean
  isSubscript: boolean
  isSuperscript: boolean
  isUnderline: boolean
}): JSX.Element {
  const popupCharStylesEditorRef = useRef<HTMLDivElement | null>(null)

  const [content, setContent] = useState("")

  const insertLink = useCallback(() => {
    if (!isLink) {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, "https://")
    } else {
      editor.dispatchCommand(TOGGLE_LINK_COMMAND, null)
    }
  }, [editor, isLink])

  function mouseMoveListener(e: MouseEvent) {
    if (
      popupCharStylesEditorRef?.current &&
      (e.buttons === 1 || e.buttons === 3)
    ) {
      if (popupCharStylesEditorRef.current.style.pointerEvents !== "none") {
        const x = e.clientX
        const y = e.clientY
        const elementUnderMouse = document.elementFromPoint(x, y)

        if (!popupCharStylesEditorRef.current.contains(elementUnderMouse)) {
          // Mouse is not over the target element => not a normal click, but probably a drag
          popupCharStylesEditorRef.current.style.pointerEvents = "none"
        }
      }
    }
  }
  function mouseUpListener(e: MouseEvent) {
    if (popupCharStylesEditorRef?.current) {
      if (popupCharStylesEditorRef.current.style.pointerEvents !== "auto") {
        popupCharStylesEditorRef.current.style.pointerEvents = "auto"
      }
    }
  }

  useEffect(() => {
    if (popupCharStylesEditorRef?.current) {
      document.addEventListener("mousemove", mouseMoveListener)
      document.addEventListener("mouseup", mouseUpListener)

      return () => {
        document.removeEventListener("mousemove", mouseMoveListener)
        document.removeEventListener("mouseup", mouseUpListener)
      }
    }
  }, [popupCharStylesEditorRef])

  const updateTextFormatFloatingToolbar = useCallback(() => {
    const selection = $getSelection()

    const text = selection?.getTextContent()
    text && setContent(text)
    const popupCharStylesEditorElem = popupCharStylesEditorRef.current
    const nativeSelection = window.getSelection()

    if (popupCharStylesEditorElem === null) {
      return
    }

    const rootElement = editor.getRootElement()
    if (
      selection !== null &&
      nativeSelection !== null &&
      !nativeSelection.isCollapsed &&
      rootElement !== null &&
      rootElement.contains(nativeSelection.anchorNode)
    ) {
      const rangeRect = getDOMRangeRect(nativeSelection, rootElement)

      setFloatingElemPosition(
        rangeRect,
        popupCharStylesEditorElem,
        anchorElem,
        isLink
      )
    }
  }, [editor, anchorElem, isLink])

  useEffect(() => {
    const scrollerElem = anchorElem.parentElement

    const update = () => {
      editor.getEditorState().read(() => {
        updateTextFormatFloatingToolbar()
      })
    }

    window.addEventListener("resize", update)
    if (scrollerElem) {
      scrollerElem.addEventListener("scroll", update)
    }

    return () => {
      window.removeEventListener("resize", update)
      if (scrollerElem) {
        scrollerElem.removeEventListener("scroll", update)
      }
    }
  }, [editor, updateTextFormatFloatingToolbar, anchorElem])

  useEffect(() => {
    editor.getEditorState().read(() => {
      updateTextFormatFloatingToolbar()
    })
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateTextFormatFloatingToolbar()
        })
      }),

      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateTextFormatFloatingToolbar()
          return false
        },
        COMMAND_PRIORITY_LOW
      )
    )
  }, [editor, updateTextFormatFloatingToolbar])

  useEffect(() => {
    editor.getEditorState().read(() => {
      updateTextFormatFloatingToolbar()
    })
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateTextFormatFloatingToolbar()
        })
      }),

      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateTextFormatFloatingToolbar()
          return false
        },
        COMMAND_PRIORITY_LOW
      )
    )
  }, [editor, updateTextFormatFloatingToolbar])

  useKeyPress("alt.i", (e) => {
    e.preventDefault()
    e.stopPropagation()
    editor.dispatchCommand(INSERT_AI_COMMAND, content)
  })

  return (
    <div
      ref={popupCharStylesEditorRef}
      className="floating-text-format-popup bg-slate-50 dark:bg-slate-700"
    >
      {editor.isEditable() && (
        <>
          <div
            className={cn(
              "mx-2 flex cursor-pointer items-center justify-center gap-1 px-2",
              "border-r text-purple-500 hover:bg-secondary hover:text-purple-600"
            )}
            onMouseDownCapture={(e) => {
              e.preventDefault()
              e.stopPropagation()
              editor.dispatchCommand(INSERT_AI_COMMAND, content)
            }}
            title="alt+i"
          >
            <SparklesIcon className="h-4 w-4" /> AI
          </div>
          <Toggle
            size="sm"
            type="button"
            onClick={() => {
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")
            }}
            pressed={isBold}
            aria-label="Format text as bold"
          >
            <Bold className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            type="button"
            onClick={() => {
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")
            }}
            pressed={isItalic}
            aria-label="Format text as italics"
          >
            <Italic className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            type="button"
            onClick={(e) => {
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")
            }}
            pressed={isUnderline}
            aria-label="Format text to underlined"
          >
            <Underline className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            type="button"
            onClick={() => {
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, "strikethrough")
            }}
            pressed={isStrikethrough}
            aria-label="Format text with a strikethrough"
          >
            <Strikethrough className="h-4 w-4" />
          </Toggle>
          {/* <Toggle
            size="sm"
            type="button"
            onClick={() => {
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, "subscript")
            }}
            pressed={isSubscript}
            title="Subscript"
            aria-label="Format Subscript"
          >
            <Subscript className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            type="button"
            onClick={() => {
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, "superscript")
            }}
            pressed={isSuperscript}
            title="Superscript"
            aria-label="Format Superscript"
          >
            <Superscript className="h-4 w-4" />
          </Toggle> */}
          <Toggle
            size="sm"
            type="button"
            onClick={() => {
              editor.dispatchCommand(FORMAT_TEXT_COMMAND, "code")
            }}
            pressed={isCode}
            aria-label="Insert code block"
          >
            <Code className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            type="button"
            onClick={insertLink}
            pressed={isLink}
            aria-label="Insert link"
          >
            <Link className="h-4 w-4" />
          </Toggle>
          <Popover>
            <PopoverTrigger>
              <div className="mx-2 flex items-center">
                <Baseline className="h-4 w-4" />{" "}
                <ChevronDown className="h-3 w-3" />
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-[350px] p-0">
              <ColorPicker activeEditor={editor} />
            </PopoverContent>
          </Popover>
        </>
      )}
    </div>
  )
}
