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
import { Message } from "ai/react"
import { $getRoot } from "lexical"

import { BGEM3 } from "@/lib/ai/llm_vendors/bge"
import { embeddingTexts } from "@/lib/embedding/worker"
import { ITreeNode } from "@/lib/store/ITreeNode"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { useEmbedding } from "@/hooks/use-embedding"
import { useHnsw } from "@/hooks/use-hnsw"
import { useToast } from "@/components/ui/use-toast"
import { MentionNode } from "@/components/doc/nodes/MentionNode/MentionNode"
import NewMentionsPlugin, {
  MentionPluginProps,
} from "@/components/doc/plugins/MentionsPlugin"
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
  append: (message: Message) => void
  appendHiddenMessage: (messages: Message) => void
  isLoading?: boolean
  setContextNodes?: (nodes: ITreeNode[]) => void
  setContextEmbeddings?: (embeddings: IEmbedding[]) => void
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
}: InputEditorProps) => {
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
        setTimeout(() => {
          append({
            id: crypto.randomUUID(),
            role: "user",
            content: markdown,
          })
        }, 100)
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
      <div className=" relative">
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className=" h-auto min-h-[100px] rounded-sm border-none bg-gray-100 p-2 outline-none dark:bg-gray-800"
              onKeyDownCapture={handleEnterPress}
            />
          }
          placeholder={
            <div className=" pointer-events-none absolute left-3 top-2 text-xs opacity-60">
              Type your message here.
              <br />
              Press / to switch prompt. @ to mention resource.
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
      </div>
      <NewMentionsPlugin
        onOptionSelectCallback={handleNodeInsert}
        placement="top-start"
      />
      <SwitchPromptPlugin />
      <HistoryPlugin />
      <AutoFocusPlugin />
      <AIInputEditorDataPlugin ref={dataPluginRef} />
      <AutoEditable editable={Boolean(initialConfig.editable)} />
    </LexicalComposer>
  )
}
