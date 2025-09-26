import React, { useEffect, useImperativeHandle, useRef } from "react"
import { BGEM3 } from "@/packages/ai/llm_vendors/bge"
import type { IEmbedding } from "@/packages/core/meta-table/embedding"
import { LinkNode } from "@lexical/link"
import { ListItemNode, ListNode } from "@lexical/list"
import { MarkNode } from "@lexical/mark"
import { $convertToMarkdownString } from "@lexical/markdown"
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin"
import type {
  InitialConfigType} from "@lexical/react/LexicalComposer";
import {
  LexicalComposer,
} from "@lexical/react/LexicalComposer"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"
import type { Attachment, ChatRequestOptions, CreateMessage } from "ai"
import type { Message } from "ai/react"
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $nodesOfType,
  createCommand,
} from "lexical"
import { useTranslation } from "react-i18next"

import type { ITreeNode } from "@/packages/core/types/ITreeNode"
import { useToast } from "@/components/ui/use-toast"
import { MentionNode } from "@/components/doc/blocks/mention/node"
import type {
  MentionPluginProps,
} from "@/components/doc/blocks/mention/plugin";
import NewMentionsPlugin from "@/components/doc/blocks/mention/plugin"
import { allTransformers } from "@/components/doc/plugins/const"
import { useEmbedding } from "@/apps/web-app/hooks/use-embedding"
import { useHnsw } from "@/apps/web-app/hooks/use-hnsw"
import { useAIConfigStore } from "@/components/settings/stores"

import { useContextNodes } from "../hooks/use-context-nodes"
import { AutoEditable } from "./plugins/auto-editable"
import { DragDropPlugin } from "./plugins/drag-drop"
import { SwitchPromptPlugin } from "./plugins/switch-prompt"

const theme = {
  // Theme styling goes here
}

interface InputEditorProps {
  disabled?: boolean
  enableRAG?: boolean
  append: (
    message: Message | CreateMessage,
    chatRequestOptions?: ChatRequestOptions
  ) => Promise<string | null | undefined>
  appendHiddenMessage: (messages: Message) => void
  isLoading?: boolean
  setContextEmbeddings?: (embeddings: IEmbedding[]) => void
  attachments?: Attachment[]
  setAttachments?: (attachments: Attachment[]) => void
  uploadQueue?: string[]
}

export interface AIInputEditorRef {
  getData: () => string
  clear: () => void
  deleteMentionNode: (nodeId: string) => void
}

const AIInputEditorDataPlugin = React.forwardRef((props, ref) => {
  const [editor] = useLexicalComposerContext()

  useImperativeHandle(ref, () => ({
    getData: () => {
      return editor.getEditorState().read(() => {
        const markdown = $convertToMarkdownString(allTransformers)
        console.log("useImperativeHandle", markdown)
        return markdown
      })
    },
    clear: () => {
      editor.update(() => {
        const root = $getRoot()
        root.clear()
      })
    },
    deleteMentionNode: (nodeId: string) => {
      editor.update(() => {
        const mentionNodes = $nodesOfType(MentionNode)
        for (const mentionNode of mentionNodes) {
          if (mentionNode.__id === nodeId) {
            mentionNode.remove()
            break
          }
        }
      })
    },
  }))
  return null
})

const appendedEmbeddingMap = new Map<string, IEmbedding>()

function PlainTextPastePlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      createCommand("PASTE_COMMAND"),
      (event: ClipboardEvent) => {
        event.preventDefault()

        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return false

        const text = event.clipboardData?.getData("text/plain")
        if (text) {
          selection.insertText(text)
        }

        return true
      },
      1 // Priority 1
    )
  }, [editor])

  return null
}

export const AIInputEditor = React.forwardRef<
  AIInputEditorRef,
  InputEditorProps
>(
  (
    {
      disabled,
      append,
      enableRAG,
      appendHiddenMessage,
      isLoading,
      setContextEmbeddings,
      attachments = [],
      setAttachments = () => {},
    },
    ref
  ) => {
    const { t } = useTranslation()
    const { addNode, removeNode, clearNodes } = useContextNodes()

    const initialConfig: InitialConfigType = {
      namespace: "AI-Chat-Input-Editor",
      theme,
      onError: console.error,
      editable: !disabled,
      nodes: [
        MarkNode,
        HeadingNode,
        QuoteNode,
        LinkNode,
        ListNode,
        ListItemNode,
        MentionNode,
      ],
    }

    const { hasEmbeddingModel, embeddingTexts } = useEmbedding()

    const { queryEmbedding } = useHnsw()
    const dataPluginRef = useRef<{
      getData: () => string
      clear: () => void
      deleteMentionNode: (nodeId: string) => void
    }>(null)

    React.useImperativeHandle(ref, () => ({
      getData: () => dataPluginRef.current?.getData() || "",
      clear: () => dataPluginRef.current?.clear(),
      deleteMentionNode: (nodeId: string) =>
        dataPluginRef.current?.deleteMentionNode(nodeId),
    }))

    const { toast } = useToast()
    const { aiConfig } = useAIConfigStore()

    const handleKeyDown = async (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter") {
        const contextMenu = document.querySelector("#typeahead-menu")
        if (contextMenu?.hasChildNodes()) {
          return
        }
        if (e.shiftKey) return
        e.preventDefault()
        e.stopPropagation()
        if (isLoading) {
          return
        }
        const markdown = dataPluginRef.current?.getData()
        if (markdown) {
          if (enableRAG && hasEmbeddingModel()) {
            const res = await queryEmbedding({
              query: markdown,
              model: "bge-m3",
              provider: new BGEM3(embeddingTexts as any),
            })
            res?.forEach((embedding) => {
              appendedEmbeddingMap.set(embedding.id, embedding)
            })
            setContextEmbeddings?.(res ?? [])
            appendHiddenMessage({
              id: crypto.randomUUID(),
              role: "user",
              content: "[ignore this message]",
              references: Array.from(
                new Set(res?.map((embedding) => embedding.source))
              ),
            } as any)
          }

          const processedAttachments = await Promise.all(
            attachments.map(async (attachment) => {
              try {
                const response = await fetch(attachment.url)
                const blob = await response.blob()

                if (attachment.contentType === "application/pdf") {
                  throw new Error("PDF is not supported")
                }
                const dataUri = await new Promise<string>((resolve) => {
                  const reader = new FileReader()
                  reader.onloadend = () => resolve(reader.result as string)
                  reader.readAsDataURL(blob)
                })

                return {
                  ...attachment,
                  url: dataUri,
                }
              } catch (error) {
                console.error("Error processing attachment:", error)
                return attachment
              }
            })
          )

          setTimeout(() => {
            append(
              {
                id: crypto.randomUUID(),
                role: "user",
                content: markdown,
              },
              {
                experimental_attachments: processedAttachments,
              }
            )
          }, 100)

          setAttachments([])
        }
        dataPluginRef.current?.clear()
      } else if (e.key === "Backspace") {
        // Check if content is empty and clear context nodes
        const currentContent = dataPluginRef.current?.getData()?.trim()
        if (!currentContent || currentContent === "") {
          clearNodes()
        }
      }
    }

    const handleNodeInsert: MentionPluginProps["onOptionSelectCallback"] = (
      option
    ) => {
      const node = option.rawData as ITreeNode
      // Use the centralized context node management
      addNode(node)
    }

    const handleNodeDelete = (nodeId: string) => {
      // Use the centralized context node management
      removeNode(nodeId)
    }

    return (
      <LexicalComposer initialConfig={initialConfig}>
        <div data-testid="ai-input-editor">
          <div
            className="relative max-h-[200px] overflow-y-auto bg-card outline-none  transition-colors duration-200"
            data-drop-zone="ai-editor"
          >
            <RichTextPlugin
              contentEditable={
                <ContentEditable
                  className="h-auto min-h-[100px] rounded-t-sm border-none bg-card p-2 outline-none "
                  onKeyDownCapture={handleKeyDown}
                />
              }
              placeholder={
                <div className="pointer-events-none absolute left-3 top-2 text-xs text-muted-foreground opacity-50">
                  {t("aiChat.inputEditor.typeYourMessageHere")}
                  <br />
                  {t("aiChat.inputEditor.pressAtToMentionResource")}
                </div>
              }
              ErrorBoundary={LexicalErrorBoundary}
            />
            <PlainTextPastePlugin />
            <NewMentionsPlugin
              onOptionSelectCallback={handleNodeInsert}
              placement="top-start"
              onDeleteCallback={handleNodeDelete}
            />
            <HistoryPlugin />
            <AutoFocusPlugin />
            <AIInputEditorDataPlugin ref={dataPluginRef} />
            <AutoEditable editable={Boolean(initialConfig.editable)} />
          </div>
        </div>
      </LexicalComposer>
    )
  }
)
