import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { IScript } from "@/worker/web-worker/meta_table/script"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { createDOMRange, createRectsFromDOMRange } from "@lexical/selection"
import { useClickAway } from "ahooks"
import { useChat } from "ai/react"
import { $getSelection, $isRangeSelection, RangeSelection } from "lexical"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command"
import { useUserPrompts } from "@/components/ai-chat/hooks"
import { useConfigStore } from "@/app/settings/store"

export function AITools({
  cancelAIAction,
  content,
}: {
  cancelAIAction: () => void
  content: string
}) {
  const { prompts } = useUserPrompts()
  const [editor] = useLexicalComposerContext()
  const selectionRef = useRef<RangeSelection | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const { aiConfig } = useConfigStore()
  const [currentModel, setCurrentModel] = useState<string>("")

  const {
    messages,
    setMessages,
    reload,
    input,
    handleInputChange,
    handleSubmit,
    append,
    isLoading,
    stop,
  } = useChat({
    onFinish(message) {
      editor.update(() => {
        const selection = selectionRef.current
        selection?.insertText(message.content)
      })
    },
    body: {
      token: aiConfig.token,
      baseUrl: aiConfig.baseUrl,
      GOOGLE_API_KEY: aiConfig.GOOGLE_API_KEY,
      model: currentModel,
    },
  })

  const runAction = (prompt: IScript) => {
    if (prompt.model) {
      setCurrentModel(prompt.model)
      setTimeout(() => {
        //
        setMessages([
          {
            id: "1",
            content: prompt.code,
            role: "system",
          },
          {
            id: "2",
            content: content,
            role: "user",
          },
        ])
        reload()
        cancelAIAction()
      }, 100)
    }
  }
  useClickAway(() => {
    cancelAIAction()
  }, boxRef)

  const selectionState = useMemo(
    () => ({
      container: document.createElement("div"),
      elements: [],
    }),
    []
  )
  const updateLocation = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection()

      if ($isRangeSelection(selection)) {
        selectionRef.current = selection.clone()
        const anchor = selection.anchor
        const focus = selection.focus
        const range = createDOMRange(
          editor,
          anchor.getNode(),
          anchor.offset,
          focus.getNode(),
          focus.offset
        )
        const boxElem = boxRef.current
        if (range !== null && boxElem !== null) {
          const { left, bottom, width } = range.getBoundingClientRect()
          const selectionRects = createRectsFromDOMRange(editor, range)
          let correctedLeft =
            selectionRects.length === 1 ? left + width / 2 - 125 : left - 125
          if (correctedLeft < 10) {
            correctedLeft = 10
          }
          boxElem.style.left = `${correctedLeft}px`
          boxElem.style.top = `${
            bottom +
            20 +
            (window.pageYOffset || document.documentElement.scrollTop)
          }px`
          const selectionRectsLength = selectionRects.length
          const { container } = selectionState
          const elements: Array<HTMLSpanElement> = selectionState.elements
          const elementsLength = elements.length

          for (let i = 0; i < selectionRectsLength; i++) {
            const selectionRect = selectionRects[i]
            let elem: HTMLSpanElement = elements[i]
            if (elem === undefined) {
              elem = document.createElement("span")
              elements[i] = elem
              container.appendChild(elem)
            }
            const color = "255, 212, 0"
            const style = `position:absolute;top:${
              selectionRect.top +
              (window.pageYOffset || document.documentElement.scrollTop)
            }px;left:${selectionRect.left}px;height:${
              selectionRect.height
            }px;width:${
              selectionRect.width
            }px;background-color:rgba(${color}, 0.3);pointer-events:none;z-index:5;`
            elem.style.cssText = style
          }
          for (let i = elementsLength - 1; i >= selectionRectsLength; i--) {
            const elem = elements[i]
            container.removeChild(elem)
            elements.pop()
          }
        }
      }
    })
  }, [editor, selectionState])

  useLayoutEffect(() => {
    updateLocation()
    const container = selectionState.container
    const body = document.body
    if (body !== null) {
      body.appendChild(container)
      return () => {
        body.removeChild(container)
      }
    }
  }, [selectionState.container, updateLocation])

  useEffect(() => {
    window.addEventListener("resize", updateLocation)

    return () => {
      window.removeEventListener("resize", updateLocation)
    }
  }, [updateLocation])

  return (
    <div
      className="absolute z-50 h-[300px] w-[200px] rounded-md border"
      ref={boxRef}
    >
      <Command>
        <CommandInput placeholder="Search Action..." autoFocus />
        <CommandEmpty>No Action found.</CommandEmpty>
        <CommandGroup>
          {prompts.map((prompt) => (
            <CommandItem
              key={prompt.id}
              value={prompt.id}
              onSelect={(currentValue) => {
                runAction(prompt)
              }}
            >
              {prompt.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </Command>
    </div>
  )
}
