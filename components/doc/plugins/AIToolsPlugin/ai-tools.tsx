import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { $convertFromMarkdownString, Transformer } from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { useClickAway, useKeyPress } from "ahooks"
import { useChat } from "ai/react"
import {
  $createParagraphNode,
  $getRoot,
  $isParagraphNode,
  RangeSelection,
} from "lexical"
import {
  ChevronRightIcon,
  LucideIcon,
  PauseIcon,
  RefreshCcwIcon,
} from "lucide-react"
import * as Icons from "lucide-react"

import { getCodeFromMarkdown } from "@/lib/markdown"
import { generateId, getBlockUrl, uuidv7 } from "@/lib/utils"
import { compileCode } from "@/lib/v3/compiler"
import builtInRemixPrompt from "@/lib/v3/prompts/built-in-remix-prompt.md?raw"
import { useAiConfig } from "@/hooks/use-ai-config"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { toast } from "@/components/ui/use-toast"
import { useUserPrompts } from "@/components/ai-chat/hooks"
import { BlockRenderer } from "@/components/block-renderer/block-renderer"
import { Loading } from "@/components/loading"
import { PreviewMessage } from "@/components/remix-chat/components/message"
import { useAllMblocks } from "@/apps/web-app/[database]/scripts/hooks/use-all-mblocks"
import { useScript } from "@/apps/web-app/[database]/scripts/hooks/use-script"

import { $createCustomBlockNode } from "../../blocks/custom/node"
import { useAllDocBlocks } from "../../hooks/use-all-doc-blocks"
import { useExtBlocks } from "../../hooks/use-ext-blocks"
import { $transformExtCodeBlock } from "../../utils/helper"
import { allTransformers } from "../const"
import { AIContentEditor } from "./ai-msg-editor"
import { useBuiltInPrompts, useUpdateLocation } from "./hooks"

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
  const builtInPrompts = useBuiltInPrompts()
  const [editor] = useLexicalComposerContext()
  const selectionRef = useRef<RangeSelection | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [currentModel, setCurrentModel] = useState<string>("")
  const extBlocks = useExtBlocks()
  const allBlocks = useAllDocBlocks()
  const __allTransformers = useMemo(() => {
    return [...extBlocks.map((block) => block.transform), ...allTransformers]
  }, [extBlocks]) as Transformer[]

  const { reload: reloadBlocks } = useAllMblocks()
  const [generatedCode, setGeneratedCode] = useState<{
    ts_code: string
    code: string
  } | null>(null)

  const [isFinished, setIsFinished] = useState(true)
  const [customPrompt, setCustomPrompt] = useState<string>("")
  const [open, setOpen] = useState(true)
  const [actionOpen, setActionOpen] = useState(false)
  const [aiResult, setAiResult] = useState<string>("")
  const {
    getConfigByModel,
    findFirstAvailableModel,
    findAvailableModel,
    codingModel,
  } = useAiConfig()

  const isMakeItRealRef = useRef(false)
  const isMakeItReal = () => isMakeItRealRef.current

  const { addScript } = useScript()
  const { messages, setMessages, reload, isLoading, stop } = useChat({
    onFinish(message) {
      setAiResult(message.content)
      if (isMakeItReal()) {
        const codeBlocks = getCodeFromMarkdown(message.content)
        const indexJsxCode = codeBlocks.find(
          (code) => code.lang === "jsx" || code.lang === "typescript"
        )?.code
        if (indexJsxCode) {
          compileCode(indexJsxCode).then((res) => {
            if (!res.error) {
              setGeneratedCode({
                ts_code: indexJsxCode,
                code: res.code,
              })
            }
          })
        }
      }
      setActionOpen(true)
    },
    body: {
      ...getConfigByModel(currentModel),
      model: currentModel,
      useTools: false,
    },
  })

  const handleAction = useCallback(
    async (action: AIActionEnum) => {
      setActionOpen(false)

      const createParagraphNode = () => {
        const text = aiResult
        editor.focus()
        const paragraphNode = $createParagraphNode()
        $convertFromMarkdownString(text, __allTransformers, paragraphNode)
        return paragraphNode
      }
      switch (action) {
        case AIActionEnum.INSERT_BELOW:
          let scriptId = ""
          if (isMakeItRealRef.current && generatedCode) {
            scriptId = generateId()
            await addScript({
              id: scriptId,
              name: content,
              type: "m_block",
              description: content,
              version: "0.1.0",
              code: generatedCode.code,
              ts_code: generatedCode.ts_code,
              enabled: true,
              commands: [],
            })
            reloadBlocks()
          }
          editor.update(() => {
            const selection = selectionRef.current
            const paragraphNode = scriptId
              ? $createCustomBlockNode(getBlockUrl(scriptId))
              : createParagraphNode()
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
                if ($isParagraphNode(paragraphNode)) {
                  paragraphNode.select()
                }
              } else {
                const root = $getRoot()
                root.append(paragraphNode)
              }
            } else {
              const root = $getRoot()
              root.append(paragraphNode)
            }
            $transformExtCodeBlock(allBlocks)
          })
          isMakeItRealRef.current = false
          setIsFinished(true)
          break
        case AIActionEnum.REPLACE:
          if (isMakeItRealRef.current && generatedCode) {
            return
          }
          editor.update(() => {
            const selection = selectionRef.current
            const text = aiResult
            const paragraphNode = createParagraphNode()
            if (selection) {
              const [start, end] = selection.getStartEndPoints() || []
              const isOneLine = start?.key === end?.key
              if (isOneLine) {
                selection.insertText(text)
              } else {
                // FIXME: remove selected nodes and replace with new nodes
                selection.insertText(text)
              }
            } else {
              const root = $getRoot()
              root.append(paragraphNode)
            }
          })
          setIsFinished(true)
          break
        case AIActionEnum.TRY_AGAIN:
          reload()
          return
      }
      cancelAIAction()
    },
    [
      __allTransformers,
      aiResult,
      cancelAIAction,
      editor,
      extBlocks,
      reload,
      isMakeItRealRef.current,
    ]
  )

  const runAction = (
    prompt: string,
    model?: string,
    isCustomPrompt?: boolean
  ) => {
    console.log("model", model)
    if (!model) {
      toast({
        title: "No model available",
        description: "Please config a model",
      })
      return
    }
    if (model) {
      setIsFinished(false)
      setCurrentModel(model)
      setTimeout(() => {
        if (isCustomPrompt) {
          setMessages([
            {
              id: uuidv7(),
              content: `You serve as an assistant, tasked with transforming user inputs, and the current directive is *${prompt}*，user's input will
be between <content-begin> and <content-end>. you just output the transformed content without any other information.`,
              role: "system",
            },
            {
              id: uuidv7(),
              content: `<content-begin>\n${content}\n<content-end>`,
              role: "user",
            },
          ])
        } else {
          setMessages([
            {
              id: uuidv7(),
              content: prompt,
              role: "system",
            },
            {
              id: uuidv7(),
              content: content,
              role: "user",
            },
          ])
        }

        reload()
        setOpen(false)
      }, 100)
    }
  }

  const runCustomAction = (prompt: string) => {
    const model = findFirstAvailableModel()
    runAction(prompt, model, true)
  }

  useKeyPress("esc", () => {
    cancelAIAction(Boolean(isLoading || aiResult.length))
    isMakeItRealRef.current = false
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
      isMakeItRealRef.current = false
    },
    boxRef,
    ["touchstart", "mousedown"]
  )
  const regenerate = () => {
    reload()
  }

  const { editorWidth } = useUpdateLocation(editor, selectionRef, boxRef)

  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)

  const commandGroupRef = useRef<HTMLDivElement>(null)

  return (
    <div className=" fixed z-50" ref={boxRef}>
      {!isFinished && (
        <>
          <div
            className=" rounded-md border bg-white p-2 shadow-md dark:border-gray-700 dark:bg-slate-800"
            style={{
              width: editorWidth,
            }}
          >
            {!isMakeItRealRef.current && (
              <AIContentEditor markdown={messages[2]?.content} />
            )}
            {isMakeItRealRef.current &&
              (isLoading ? (
                <Loading />
              ) : (
                generatedCode && (
                  <BlockRenderer
                    code={generatedCode?.ts_code}
                    compiledCode={generatedCode?.code}
                  />
                )
              ))}
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
            <Command className="mt-1 w-[200px] rounded-md border shadow-md">
              <CommandInput placeholder="Search Action..." autoFocus />
              <ScrollArea>
                <CommandList>
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
                </CommandList>
              </ScrollArea>
            </Command>
          )}
        </>
      )}
      {open && (
        <Command className="w-[300px] rounded-lg border shadow-md">
          <CommandInput
            placeholder="Search prompt or enter custom ..."
            autoFocus
            value={customPrompt}
            onValueChange={(value) => {
              setCustomPrompt(value)
            }}
            onKeyUp={(e) => {
              if (e.key === "Enter") {
                // not found available prompt
                const shouldRunCustomAction = !prompts.find((prompt) =>
                  prompt.name.includes(customPrompt)
                )
                if (shouldRunCustomAction && customPrompt.length) {
                  runCustomAction(customPrompt)
                }
              }
            }}
          />
          <ScrollArea>
            <CommandList className="max-h-[20rem]">
              <CommandEmpty>No Prompt found.</CommandEmpty>
              <CommandGroup heading="Built-in Prompts" ref={commandGroupRef}>
                <CommandItem
                  className="flex items-center justify-between"
                  onSelect={() => {
                    isMakeItRealRef.current = true
                    runAction(builtInRemixPrompt, codingModel)
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Icons.WandIcon className="h-5 w-5 opacity-50" />
                    <span>Make it real</span>
                  </div>
                </CommandItem>
                {builtInPrompts.map((prompt) => {
                  const Icon = Icons[
                    prompt.icon as keyof typeof Icons
                  ] as LucideIcon
                  if (prompt.parameters) {
                    const { name, key, value, type, description, required } =
                      prompt.parameters[0]
                    return (
                      <DropdownMenu
                        key={prompt.name}
                        open={openDropdownId === prompt.name}
                        onOpenChange={(open) => {
                          setOpenDropdownId(open ? prompt.name : null)
                        }}
                      >
                        <DropdownMenuTrigger asChild>
                          <CommandItem
                            className="flex items-center justify-between"
                            onSelect={() => setOpenDropdownId(prompt.name)}
                          >
                            <div className="flex items-center gap-2">
                              <Icon className="h-5 w-5 opacity-50" />
                              <span>{prompt.name}</span>
                            </div>
                            <ChevronRightIcon className="h-5 w-5" />
                          </CommandItem>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          side="right"
                          container={commandGroupRef.current!}
                        >
                          <DropdownMenuLabel>{name}</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {value.map((item) => {
                            return (
                              <DropdownMenuItem
                                key={item}
                                onClick={(e) => {
                                  e.preventDefault()
                                  const renderedPrompt = prompt.content.replace(
                                    `{{${key}}}`,
                                    item
                                  )
                                  runAction(
                                    renderedPrompt,
                                    findAvailableModel(prompt.type)
                                  )
                                }}
                              >
                                {item}
                              </DropdownMenuItem>
                            )
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )
                  }
                  return (
                    <CommandItem
                      key={prompt.name}
                      onSelect={(e) => {
                        runAction(prompt.content, findFirstAvailableModel())
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 opacity-50" />
                        <span>{prompt.name}</span>
                      </div>
                    </CommandItem>
                  )
                })}
              </CommandGroup>
              <CommandGroup heading="Custom Prompts">
                {prompts.map((prompt) => (
                  <CommandItem
                    key={prompt.id}
                    onSelect={() => {
                      runAction(prompt.code, prompt.model)
                    }}
                  >
                    <span>{prompt.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </ScrollArea>
        </Command>
      )}
    </div>
  )
}
