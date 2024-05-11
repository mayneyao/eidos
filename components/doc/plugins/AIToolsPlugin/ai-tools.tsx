import { useCallback, useMemo, useRef, useState } from "react"
import { $convertFromMarkdownString } from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useClickAway, useKeyPress } from "ahooks"
import { useChat } from "ai/react"
import { $createParagraphNode, $getRoot, RangeSelection } from "lexical"
import { PauseIcon, RefreshCcwIcon } from "lucide-react"

import { uuidv4 } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
import { $transformExtCodeBlock } from "../../utils/helper"
import { allTransformers } from "../const"
import { AIContentEditor } from "./ai-msg-editor"
import { useUpdateLocation } from "./hooks"

enum AIActionEnum {
  INSERT_BELOW = "insert_below",
  REPLACE = "replace",
  TRY_AGAIN = "try_again",
}

const AIActionDisplay = Object.values(AIActionEnum).reduce((acc, key) => {
  // uppercase to title case
  acc[key] = key
    .split("_")
    .join(" ")
    .replace(/\b\w/g, (l) => l.toUpperCase())
  return acc
}, {} as Record<string, string>)

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
  const { messages, setMessages, reload, isLoading, stop } = useChat({
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
            $transformExtCodeBlock(extBlocks)
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
    [__allTransformers, aiResult, cancelAIAction, editor, extBlocks, reload]
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
  const regenerate = () => {
    reload()
  }

  const { editorWidth } = useUpdateLocation(editor, selectionRef, boxRef)

  return (
    <div className=" fixed z-50" ref={boxRef}>
      {!isFinished && (
        <div>
          <div
            className=" rounded-md border bg-white p-2 shadow-md dark:border-gray-700 dark:bg-slate-800"
            style={{
              width: editorWidth,
            }}
          >
            <AIContentEditor markdown={messages[2]?.content} />
            <div className="flex  w-full items-center justify-end opacity-50">
              {isLoading && (
                <Button onClick={stop} variant="ghost" size="sm">
                  <PauseIcon className="h-5 w-5" />
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={regenerate}
                size="sm"
                disabled={isLoading}
              >
                <RefreshCcwIcon className="h-5 w-5" />
              </Button>
            </div>
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
                    {AIActionDisplay[action]}
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
                value={prompt.name}
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
