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
import { $getRoot } from "lexical"
import React, { useEffect, useImperativeHandle, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { useAIConfigStore } from "@/apps/web-app/settings/ai/store"
import { MentionNode } from "@/components/doc/blocks/mention/node"
import NewMentionsPlugin, {
  MentionPluginProps,
} from "@/components/doc/blocks/mention/plugin"
import { allTransformers } from "@/components/doc/plugins/const"
import { PaperclipIcon } from "@/components/remix-chat/components/icons"
import { PreviewAttachment } from "@/components/remix-chat/components/preview-attachment"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { useEmbedding } from "@/hooks/use-embedding"
import { useHnsw } from "@/hooks/use-hnsw"
import { useSqlite } from "@/hooks/use-sqlite"
import { BGEM3 } from "@/lib/ai/llm_vendors/bge"
import { ITreeNode } from "@/lib/store/ITreeNode"
import { pdfToMarkdown } from "@/lib/web/pdf"

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

              // 如果是 PDF 文件，转换为图片
              if (attachment.contentType === "application/pdf") {
                try {
                  // 首先转换为 Markdown
                  const markdownContent = await pdfToMarkdown(blob)
                  console.log("markdownContent", markdownContent)
                } catch (error) {
                  console.error("Error processing PDF:", error)
                  // 如果转换失败，保持原样返回
                  return attachment
                }
              }

              // 其他文件类型保持原来的处理方式
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

  const { sqlite } = useSqlite()

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadQueue, setUploadQueue] = useState<Array<string>>([])

  const uploadFile = async (file: File) => {
    try {
      if (!sqlite) {
        throw new Error("sqlite not found")
      }
      const response = await sqlite?.file.upload(
        await file.arrayBuffer(),
        file.name,
        file.type,
        ["_chat"]
      )
      const { mime, name, publicUrl } = response
      return {
        url: publicUrl,
        name: name,
        contentType: mime,
      }
    } catch (error) {
      toast({
        title: "Failed to upload file, please try again!",
      })
      throw error
    }
  }

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(event.target.files || [])
    setUploadQueue(files.map((file) => file.name))

    try {
      const uploadPromises = files.map((file) => uploadFile(file))
      const uploadedAttachments = await Promise.all(uploadPromises)
      const successfulAttachments = uploadedAttachments.filter(
        (a) => a !== undefined
      )

      setAttachments([...attachments, ...successfulAttachments])
    } catch (error) {
      console.error("Error uploading files!", error)
    } finally {
      setUploadQueue([])
    }
  }

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className="relative">
        {(attachments.length > 0 || uploadQueue.length > 0) && (
          <div className="flex flex-row gap-2 overflow-x-scroll items-end mb-2">
            {attachments.map((attachment) => (
              <PreviewAttachment key={attachment.url} attachment={attachment} />
            ))}
            {uploadQueue.map((filename) => (
              <PreviewAttachment
                key={filename}
                attachment={{
                  url: "",
                  name: filename,
                  contentType: "",
                }}
                isUploading={true}
              />
            ))}
          </div>
        )}

        <input
          type="file"
          className="fixed -top-4 -left-4 size-0.5 opacity-0 pointer-events-none"
          ref={fileInputRef}
          multiple
          onChange={handleFileChange}
          tabIndex={-1}
        />

        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className=" h-auto min-h-[100px] rounded-sm border-none bg-gray-100 p-2 outline-none dark:bg-gray-800"
              onKeyDownCapture={handleEnterPress}
            />
          }
          placeholder={
            <div className=" pointer-events-none absolute left-3 top-2 text-xs opacity-60">
              {t("aiChat.inputEditor.typeYourMessageHere")}
              <br />
              {t("aiChat.inputEditor.pressSlashToSwitchPrompt")}
              {t("aiChat.inputEditor.pressAtToMentionResource")}
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />

        <Button
          className="rounded-full p-1.5 h-fit absolute bottom-2 right-11 m-0.5 dark:border-zinc-700"
          onClick={(event) => {
            event.preventDefault()
            fileInputRef.current?.click()
          }}
          variant="outline"
          disabled={isLoading}
        >
          <PaperclipIcon size={14} />
        </Button>

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
