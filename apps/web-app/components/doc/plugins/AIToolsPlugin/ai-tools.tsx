import type { Transformer } from "@lexical/markdown";
import { $convertFromMarkdownString } from "@lexical/markdown";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { useClickAway, useKeyPress } from "ahooks";
import { useChat } from "@ai-sdk/react";
import type {
  LexicalNode,
  RangeSelection
} from "lexical";
import {
  $createParagraphNode,
  $getRoot,
  $isTextNode
} from "lexical";
import { PauseIcon, RefreshCcwIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAiConfig } from "@/apps/web-app/hooks/use-ai-config";
import type { ChartConfig } from "@/components/chart";
import { Chart } from "@/components/chart";
import { Thinking } from "@/components/thinking";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { uuidv7 } from "@/lib/utils";

import { $createChartNode } from "../../blocks/chart/node";
import { $isMermaidNode } from "../../blocks/mermaid/node";
import { useAllDocBlocks } from "../../hooks/use-all-doc-blocks";
import { useExtBlocks } from "../../hooks/use-ext-blocks";
import { allTransformers } from "../const";
import { AIActionEnum, AIActionList } from "./ai-action-list";
import { AIContentEditor } from "./ai-msg-editor";
import { useGenerateChartConfig } from "./hooks/use-generate-chart";
import { useUpdateLocation } from "./hooks/use-update-location";
import { PromptList } from "./prompt-list";
import { useEditorInstance } from "../../hooks/editor-instance-context";

// Helper function to extract text content from message parts
function getMessageContent(message: any): string {
  if (!message) return "";
  if (message.content) return message.content;
  if (message.parts) {
    return message.parts
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text)
      .join("");
  }
  return "";
}

export function AITools({
  cancelAIAction,
  content,
}: {
  cancelAIAction: (flag?: boolean) => void
  content: string
}) {
  const [editor] = useLexicalComposerContext()
  const selectionRef = useRef<RangeSelection | null>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [currentModel, setCurrentModel] = useState<string>("")
  const extBlocks = useExtBlocks()
  const allBlocks = useAllDocBlocks()
  const __allTransformers = useMemo(() => {
    return [...extBlocks.map((block) => block.transform), ...allTransformers]
  }, [extBlocks]) as Transformer[]

  const [isFinished, setIsFinished] = useState(true)
  const [promptListOpen, setPromptListOpen] = useState(true)
  const [actionOpen, setActionOpen] = useState(false)
  const [aiResult, setAiResult] = useState<string>("")
  const [chartConfig, setChartConfig] = useState<ChartConfig | null>(null)
  const { getConfigByModel, textModel, codingModel } = useAiConfig()
  const { t } = useTranslation()
  const { generateConfig, isLoading: isChartLoading } = useGenerateChartConfig()
  const { queryWithinContainer, container } = useEditorInstance()

  const aiContentBoxRef = useRef<HTMLDivElement>(null)
  const isGenerateChartRef = useRef(false)

  const setPlaceholderHeight = useCallback(
    (height: number) => {
      const placeholder = queryWithinContainer(
        "#ai-content-placeholder"
      ) as HTMLElement | null
      placeholder?.setAttribute("style", `height: ${height}px;`)
    },
    [queryWithinContainer]
  )

  const resetPlaceholderHeight = useCallback(() => {
    const placeholder = queryWithinContainer(
      "#ai-content-placeholder"
    ) as HTMLElement | null
    placeholder?.setAttribute("style", `height: 0px;`)
  }, [queryWithinContainer])

  useEffect(() => {
    if (!aiContentBoxRef.current) {
      return
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        setPlaceholderHeight(height)
      }
    })

    resizeObserver.observe(aiContentBoxRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [aiContentBoxRef.current])

  const generateChartConfig = async () => {
    if (!codingModel) {
      toast({
        title: "No coding model available",
        description: "Please config a coding model",
      })
      return
    }
    setIsFinished(false)
    setPromptListOpen(false)
    isGenerateChartRef.current = true
    const config = await generateConfig(content, codingModel)
    setChartConfig(config)
    setActionOpen(true)
  }

  const resetState = () => {
    isGenerateChartRef.current = false
    setIsFinished(true)
    // reset placeholder height
    resetPlaceholderHeight()
  }

  const config = useMemo(() => {
    try {
      return getConfigByModel(currentModel)
    } catch (error) {
      return {}
    }
  }, [currentModel, getConfigByModel])

  const { messages, setMessages, regenerate, status, stop } = useChat({
    onError(error) {
      console.log("error:", error)
      toast({
        title: error.message || t("common.error.tryAgainLater"),
        description: t("common.error.modelLimitation"),
      })
    },
    onFinish(message) {
      setAiResult(getMessageContent(message))
      setActionOpen(true)
    },
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  const handleAction = useCallback(
    async (action: AIActionEnum) => {
      setActionOpen(false)

      const createParagraphNode = () => {
        const text = aiResult
        editor.focus()
        const paragraphNode = $createParagraphNode()
        $convertFromMarkdownString(text, __allTransformers, paragraphNode)
        return paragraphNode.getChildren()
      }
      const createChartNode = () => {
        const chartNode = $createChartNode(JSON.stringify(chartConfig))
        return chartNode
      }

      const getGeneratedNodes = () => {
        if (isGenerateChartRef.current) {
          return [createChartNode()]
        }
        return createParagraphNode()
      }

      const appendNodesAfterSelection = (generatedNodes: LexicalNode[]) => {
        const selection = selectionRef.current
        if (selection) {
          const newSelection = selection.clone()
          let node
          try {
            const selectNodes = newSelection.getNodes()
            node = selectNodes[selectNodes.length - 1]
          } catch (error) {}
          if (node) {
            try {
              const insertionPointNode = $isTextNode(node)
                ? node.getParent()
                : node

              if (insertionPointNode) {
                let insertAfterNode = insertionPointNode

                for (const newNode of generatedNodes) {
                  insertAfterNode.insertAfter(newNode)
                  insertAfterNode = newNode
                }
                insertAfterNode.selectEnd()
              } else {
                const root = $getRoot()
                root.append(...generatedNodes)
                generatedNodes[generatedNodes.length - 1].selectEnd()
              }
            } catch (error) {
              const root = $getRoot()
              root.append(...generatedNodes)
              generatedNodes[generatedNodes.length - 1].selectEnd()
            }
          } else {
            const root = $getRoot()
            root.append(...generatedNodes)
            generatedNodes[generatedNodes.length - 1].selectEnd()
          }
        }
      }

      switch (action) {
        case AIActionEnum.INSERT_BELOW:
          editor.update(() => {
            const generatedNodes = getGeneratedNodes()
            appendNodesAfterSelection(generatedNodes)
          })
          resetState()
          break
        case AIActionEnum.REPLACE:
          editor.update(() => {
            const selection = selectionRef.current
            const text = aiResult
            const generatedNodes = getGeneratedNodes()
            if (selection) {
              const [start, end] = selection.getStartEndPoints() || []
              const isOneLine = start?.key === end?.key
              const isGeneratedNodesOnlyATextNode =
                generatedNodes.length === 1 && $isTextNode(generatedNodes[0])
              // single line and only one text node
              if (isOneLine && isGeneratedNodesOnlyATextNode) {
                selection.insertText(text)
                const textNode = generatedNodes[0]
                if ($isTextNode(textNode)) {
                  selection.setTextNodeRange(textNode, 0, textNode, text.length)
                }
              } else {
                const generatedNode = generatedNodes[0]
                if (
                  $isMermaidNode(generatedNode) ||
                  isGenerateChartRef.current
                ) {
                  appendNodesAfterSelection(generatedNodes)
                  selection.removeText()
                } else {
                  selection.insertText(text)
                  const lastNode =
                    selection.getNodes()[selection.getNodes().length - 1]
                  if ($isTextNode(lastNode)) {
                    selection.setTextNodeRange(
                      lastNode,
                      0,
                      lastNode,
                      text.length
                    )
                  }
                }
              }
            } else {
              const root = $getRoot()
              root.append(...generatedNodes)
              generatedNodes[generatedNodes.length - 1].selectEnd()
            }
          })
          resetState()
          break
        case AIActionEnum.TRY_AGAIN:
          regenerate()
          return
      }
      cancelAIAction()
    },
    [
      __allTransformers,
      aiResult,
      cancelAIAction,
      editor,
      regenerate,
      isGenerateChartRef.current,
    ]
  )

  const handlePromptSelect = (
    prompt: string,
    model: string = textModel,
    isCustomPrompt?: boolean
  ) => {
    if (!model) {
      toast({
        title: "No model available",
        description: "Please config a model",
      })
      return
    }

    setIsFinished(false)
    setCurrentModel(model)
    setTimeout(() => {
      if (isCustomPrompt) {
        setMessages([
          {
            id: uuidv7(),
            role: "system",
            parts: [{ type: "text" as const, text: `You serve as an assistant, tasked with transforming user inputs, and the current directive is *${prompt}*，user's input will
be between <content-begin> and <content-end>. you just output the transformed content without any other information.` }],
          },
          {
            id: uuidv7(),
            role: "user",
            parts: [{ type: "text" as const, text: `<content-begin>\n${content}\n<content-end>` }],
          },
        ])
      } else {
        setMessages([
          {
            id: uuidv7(),
            role: "system",
            parts: [{ type: "text" as const, text: prompt }],
          },
          {
            id: uuidv7(),
            role: "user",
            parts: [{ type: "text" as const, text: content }],
          },
        ])
      }
      regenerate()
      setPromptListOpen(false)
    }, 100)
  }

  useKeyPress("esc", () => {
    cancelAIAction(Boolean(isLoading || aiResult.length))
    isGenerateChartRef.current = false
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
      isGenerateChartRef.current = false
    },
    boxRef,
    ["touchstart", "mousedown"]
  )
  const handleRegenerate = () => {
    regenerate()
  }

  const { editorWidth } = useUpdateLocation(editor, selectionRef, boxRef)

  // Extract content from the third message (index 2) using parts
  const assistantMessageContent = useMemo(() => {
    return getMessageContent(messages[2])
  }, [messages])

  return (
    <div className="fixed z-50" ref={boxRef} id="ai-tools-box">
      {!isFinished && (
        <>
          <div
            id="ai-content-box"
            ref={aiContentBoxRef}
            className="rounded-md border bg-white p-2 shadow-md dark:border-gray-700 dark:bg-slate-800"
            style={{
              width: editorWidth,
            }}
          >
            {isGenerateChartRef.current && (
              <div>
                {isChartLoading ? (
                  <Thinking />
                ) : chartConfig ? (
                  <Chart {...chartConfig} />
                ) : (
                  <span>No chart config</span>
                )}
              </div>
            )}
            {!isGenerateChartRef.current && (
              <AIContentEditor markdown={assistantMessageContent} />
            )}
            <div className="flex  w-full items-center justify-end opacity-50">
              {isLoading && (
                <Button onClick={stop} variant="ghost" size="sm">
                  <PauseIcon className="h-5 w-5" />
                </Button>
              )}
              <Button
                variant="ghost"
                onClick={handleRegenerate}
                size="sm"
                disabled={isLoading}
              >
                <RefreshCcwIcon className="h-5 w-5" />
              </Button>
            </div>
          </div>
          {actionOpen && <AIActionList onSelect={handleAction} />}
        </>
      )}
      {promptListOpen && (
        <PromptList
          onPromptSelect={handlePromptSelect}
          onGenerateChart={generateChartConfig}
        />
      )}
    </div>
  )
}
