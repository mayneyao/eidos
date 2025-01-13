import React, { useEffect, useImperativeHandle, useRef } from "react"
import { IEmbedding } from "@/worker/web-worker/meta-table/embedding"
import { LinkNode } from "@lexical/link"
import { ListItemNode, ListNode } from "@lexical/list"
import { MarkNode } from "@lexical/mark"
import { $convertToMarkdownString } from "@lexical/markdown"
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin"
import {
  InitialConfigType,
  LexicalComposer,
} from "@lexical/react/LexicalComposer"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import LexicalErrorBoundary from "@lexical/react/LexicalErrorBoundary"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { HeadingNode, QuoteNode } from "@lexical/rich-text"
import { Attachment, ChatRequestOptions, CreateMessage } from "ai"
import { Message } from "ai/react"
import { $getRoot, $getSelection, $isRangeSelection, createCommand } from "lexical"
import { useTranslation } from "react-i18next"

import { BGEM3 } from "@/lib/ai/llm_vendors/bge"
import { ITreeNode } from "@/lib/store/ITreeNode"
import { useEmbedding } from "@/hooks/use-embedding"
import { useHnsw } from "@/hooks/use-hnsw"
import { useToast } from "@/components/ui/use-toast"
import { MentionNode } from "@/components/doc/blocks/mention/node"
import NewMentionsPlugin, {
  MentionPluginProps,
} from "@/components/doc/blocks/mention/plugin"
import { allTransformers } from "@/components/doc/plugins/const"
import { useAIConfigStore } from "@/apps/web-app/settings/ai/store"

import { AutoEditable } from "./plugins/auto-editable"
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
  setContextNodes?: (nodes: ITreeNode[]) => void
  setContextEmbeddings?: (embeddings: IEmbedding[]) => void
  attachments?: Attachment[]
  setAttachments?: (attachments: Attachment[]) => void
  uploadQueue?: string[]
}

export const nodeInfoMap = new Map<string, ITreeNode>()

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
  }))
  return null
})

const appendedEmbeddingMap = new Map<string, IEmbedding>()

function PlainTextPastePlugin() {
  const [editor] = useLexicalComposerContext()

  useEffect(() => {
    return editor.registerCommand(
      createCommand('PASTE_COMMAND'),
      (event: ClipboardEvent) => {
        event.preventDefault()
        
        const selection = $getSelection()
        if (!$isRangeSelection(selection)) return false

        const text = event.clipboardData?.getData('text/plain')
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

export const AIInputEditor = ({
  disabled,
  append,
  enableRAG,
  appendHiddenMessage,
  isLoading,
  setContextNodes,
  setContextEmbeddings,
  attachments = [],
  setAttachments = () => {},
  uploadQueue = [],
}: InputEditorProps) => {
  const { t } = useTranslation()
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
  }>(null)

  useEffect(() => {
    return () => {
      nodeInfoMap.clear()
    }
  }, [])

  const { toast } = useToast()
  const { aiConfig } = useAIConfigStore()
  // const { isEmbeddingModeLoaded } = useAppRuntimeStore()
  // const [tryToLoadEmbeddingModel, setTryToLoadEmbeddingModel] =
  //   React.useState(false)
  // useEffect(() => {
  //   isEmbeddingModeLoaded &&
  //     tryToLoadEmbeddingModel &&
  //     toast({
  //       title: "Embedding Mode is loaded.",
  //     })
  // }, [isEmbeddingModeLoaded, toast, tryToLoadEmbeddingModel])

  const handleEnterPress = async (e: React.KeyboardEvent<HTMLDivElement>) => {
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
        if (enableRAG && hasEmbeddingModel) {
          // if (!isEmbeddingModeLoaded) {
          //   toast({
          //     title: "Embedding Mode is not loaded yet. this may take a while.",
          //   })
          //   if (!aiConfig.autoLoadEmbeddingModel) {
          //     embeddingTexts(["hi"])
          //   }
          //   setTryToLoadEmbeddingModel(true)
          //   return
          // }
          const res = await queryEmbedding({
            query: markdown,
            model: "bge-m3",
            provider: new BGEM3(embeddingTexts),
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

        // 转换附件 URL 为 data URI
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
    }
  }

  const handleNodeInsert: MentionPluginProps["onOptionSelectCallback"] = (
    option
  ) => {
    const node = option.rawData
    nodeInfoMap.set(node.id, node)
    setContextNodes?.([...nodeInfoMap.values()])
  }

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="relative">
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="h-auto min-h-[100px] rounded-sm border-none bg-gray-100 p-2 outline-none dark:bg-gray-800"
              onKeyDownCapture={handleEnterPress}
            />
          }
          placeholder={
            <div className="pointer-events-none absolute left-3 top-2 text-xs opacity-60">
              {t("aiChat.inputEditor.typeYourMessageHere")}
              <br />
              {t("aiChat.inputEditor.pressSlashToSwitchPrompt")}
              {t("aiChat.inputEditor.pressAtToMentionResource")}
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <PlainTextPastePlugin />
        <NewMentionsPlugin
          onOptionSelectCallback={handleNodeInsert}
          placement="top-start"
        />
        <SwitchPromptPlugin />
        <HistoryPlugin />
        <AutoFocusPlugin />
        <AIInputEditorDataPlugin ref={dataPluginRef} />
        <AutoEditable editable={Boolean(initialConfig.editable)} />
      </div>
    </LexicalComposer>
  )
}
