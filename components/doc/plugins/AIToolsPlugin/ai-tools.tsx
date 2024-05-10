import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { $convertFromMarkdownString } from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { createDOMRange, createRectsFromDOMRange } from "@lexical/selection"
import { useClickAway, useKeyPress } from "ahooks"
import { useChat } from "ai/react"
import {
  $createParagraphNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  RangeSelection,
} from "lexical"

import { uuidv4 } from "@/lib/utils"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command"
import { useUserPrompts } from "@/components/ai-chat/hooks"
import { useConfigStore } from "@/app/settings/store"

import { useExtBlocks } from "../../hooks/use-ext-blocks"
import { allTransformers } from "../const"
import { AIContentEditor } from "./ai-msg-editor"

enum AIActionEnum {
  INSERT_BELOW = "insert_below",
  REPLACE = "replace",
  TRY_AGAIN = "try_again",
}

export function AITools({
  cancelAIAction,
  content,
}: {
  cancelAIAction: (flag?: boolean) => void
  content: string
}) {
  const { prompts } = useUserPrompts()
  const [editor] = useLexicalComposerContext()
  const selectionRef = useRef<RangeSelection | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const { aiConfig } = useConfigStore()
  const [currentModel, setCurrentModel] = useState<string>("")
  const extBlocks = useExtBlocks()
  const __allTransformers = useMemo(() => {
    return [...extBlocks.map((block) => block.transform), ...allTransformers]
  }, [extBlocks])

  const [isFinished, setIsFinished] = useState(true)
  const [customPrompt, setCustomPrompt] = useState<string>("")
  const [open, setOpen] = useState(true)
  const [actionOpen, setActionOpen] = useState(false)
  const [aiResult, setAiResult] = useState<string>("")
  const [editorWidth, setEditorWidth] = useState(0)

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
      setAiResult(message.content)
      setActionOpen(true)
    },
    body: {
      token: aiConfig.token,
      baseUrl: aiConfig.baseUrl,
      GOOGLE_API_KEY: aiConfig.GOOGLE_API_KEY,
      model: currentModel,
    },
  })

  const handleAction = useCallback(
    (action: AIActionEnum) => {
      setActionOpen(false)
      switch (action) {
        case AIActionEnum.INSERT_BELOW:
          editor.update(() => {
            const selection = selectionRef.current
            const text = aiResult
            editor.focus()
            const paragraphNode = $createParagraphNode()
            $convertFromMarkdownString(text, __allTransformers, paragraphNode)
            if (selection) {
              const newSelection = selection.clone()
              let node
              try {
                const selectNodes = newSelection.getNodes()
                node = selectNodes[selectNodes.length - 1]
              } catch (error) {}
              if (node) {
                try {
                  node.getParent()?.insertAfter(paragraphNode)
                } catch (error) {
                  node.insertAfter(paragraphNode)
                }
                paragraphNode.select()
              } else {
                const root = $getRoot()
                root.append(paragraphNode)
              }
            } else {
              const root = $getRoot()
              root.append(paragraphNode)
            }
          })
          setIsFinished(true)
          break
        case AIActionEnum.REPLACE:
          editor.update(() => {
            const selection = selectionRef.current
            const text = aiResult
            editor.focus()
            const paragraphNode = $createParagraphNode()
            $convertFromMarkdownString(text, __allTransformers, paragraphNode)
            if (selection) {
              const newSelection = selection.clone()
              let node
              try {
                node = newSelection.getNodes()[0]
              } catch (error) {}
              if (node) {
                node.replace(paragraphNode)
                paragraphNode.select()
              } else {
                const root = $getRoot()
                root.append(paragraphNode)
              }
            } else {
              const root = $getRoot()
              root.append(paragraphNode)
            }
          })
          break
        case AIActionEnum.TRY_AGAIN:
          reload()
          return
      }
      cancelAIAction()
    },
    [__allTransformers, aiResult, cancelAIAction, editor, reload]
  )

  const runAction = (prompt: string, model?: string) => {
    if (model) {
      setIsFinished(false)
      setCurrentModel(model)
      setTimeout(() => {
        setMessages([
          {
            id: uuidv4(),
            content: prompt,
            role: "system",
          },
          {
            id: uuidv4(),
            content: content,
            role: "user",
          },
        ])
        reload()
        setOpen(false)
      }, 100)
    }
  }

  useKeyPress("esc", () => {
    cancelAIAction(Boolean(isLoading || aiResult.length))
  })
  useClickAway(
    (e) => {
      if (
        document
          .querySelector("[role=ai-action-cancel-confirm]")
          ?.parentElement?.contains(e.target as Node)
      ) {
        return
      }
      cancelAIAction(Boolean(isLoading || aiResult.length))
    },
    boxRef,
    ["touchstart", "mousedown"]
  )

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
          boxElem.style.left = `${left}px`
          boxElem.style.top = `${
            bottom +
            8 +
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
    const editorContainer = document.querySelector("#editor-container-inner")
    if (editorWidth !== editorContainer?.clientWidth) {
      setEditorWidth(editorContainer?.clientWidth || 0)
    }
    const body = document.body
    if (body !== null) {
      body.appendChild(container)
      return () => {
        body.removeChild(container)
      }
    }
  }, [editorWidth, selectionState.container, updateLocation])

  useEffect(() => {
    window.addEventListener("resize", updateLocation)

    return () => {
      window.removeEventListener("resize", updateLocation)
    }
  }, [updateLocation])

  return (
    <div className=" absolute z-50" ref={boxRef}>
      {!isFinished && (
        <div>
          <div
            className=" rounded-md border bg-white p-2 shadow-md dark:border-gray-700 dark:bg-slate-800"
            style={{
              width: editorWidth,
            }}
          >
            <AIContentEditor markdown={messages[2]?.content} />
          </div>
          {actionOpen && (
            <Command className="mt-1 h-[300px] w-[200px] rounded-md border shadow-md">
              <CommandInput
                placeholder="Search Action..."
                autoFocus
                value={customPrompt}
                onValueChange={(value) => {
                  setCustomPrompt(value)
                }}
              />
              <CommandEmpty>No Action found.</CommandEmpty>
              <CommandGroup>
                {Object.values(AIActionEnum).map((action) => (
                  <CommandItem
                    key={action}
                    value={action}
                    onSelect={(currentValue) => {
                      handleAction(action)
                    }}
                  >
                    {action}
                  </CommandItem>
                ))}
              </CommandGroup>
            </Command>
          )}
        </div>
      )}
      {open && (
        <Command className=" h-[300px] w-[200px] rounded-md border shadow-md">
          <CommandInput
            placeholder="Search Action..."
            autoFocus
            value={customPrompt}
            onValueChange={(value) => {
              setCustomPrompt(value)
            }}
          />
          <CommandEmpty>No Action found.</CommandEmpty>
          <CommandGroup>
            {prompts.map((prompt) => (
              <CommandItem
                key={prompt.id}
                value={prompt.id}
                onSelect={(currentValue) => {
                  runAction(prompt.code, prompt.model)
                }}
              >
                {prompt.name}
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      )}
    </div>
  )
}
