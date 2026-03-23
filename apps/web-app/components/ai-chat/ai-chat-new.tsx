import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useChat } from "@/packages/ai"
import type { IEmbedding } from "@/packages/core/meta-table/embedding"
import { Paintbrush, PauseIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { useWindowSize } from "usehooks-ts"

import { EIDOS_CHAT_PROJECT_ID, ALLOWED_DOCUMENT_EXTENSIONS } from "@/lib/const"
import { cn, uuidv7 } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/use-toast"
import { useAiConfig } from "@/apps/web-app/hooks/use-ai-config"
import { useAIFunctions } from "@/apps/web-app/hooks/use-ai-functions"
import { useCurrentExtension } from "@/apps/web-app/hooks/use-current-node"
import { useCurrentPathInfo } from "@/apps/web-app/hooks/use-current-pathinfo"
import { useExperimentConfigStore } from "@/components/settings/stores"
import { useAppStore } from "@/apps/web-app/store/app-store"
import { useDragStore } from "@/apps/web-app/store/drag-store"

import type { UIBlock } from "../remix-chat/components/block"
import type { FileTreeNode } from "../file-tree"
import {
  PreviewMessage,
  ThinkingMessage,
} from "../remix-chat/components/message"
import { useScrollToBottom } from "../remix-chat/components/use-scroll-to-bottom"
import { Label } from "../ui/label"
import { Switch } from "../ui/switch"
import { AIChatAttachments } from "./ai-chat-attachments"
import { AIModelSelect } from "./ai-chat-model-select"
import { AIContextNodes } from "./ai-context-nodes"
import { AIInputEditor, type AIInputEditorRef } from "./ai-input-editor"
import { AIToolsConfig, useFilteredTools, useMaxSteps } from "./ai-tools-config"
import { useAIChatData } from "./hooks/use-ai-chat-data"
import { useAttachments } from "./hooks/use-attachments"
import { useContextNodes } from "./hooks/use-context-nodes"
import { useSystemPrompt } from "./hooks/use-system-prompt"
import { useAIChatStore } from "./store"

export default function Chat() {
  const { t } = useTranslation()

  const loadingRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const aiInputEditorRef = useRef<AIInputEditorRef>(null)
  const currentExtension = useCurrentExtension()

  // Custom prompts are no longer supported
  const { experiment } = useExperimentConfigStore()

  const [withSpaceData, setWithSpaceData] = useState(experiment.enableRAG)

  const { isDragging } = useDragStore()

  const divRef = useRef<HTMLDivElement>(null)
  const { currentSysPrompt, setCurrentSysPrompt } = useAIChatStore()

  const { contextNodes, addNode, removeNode, clearNodes } = useContextNodes()

  const { handleToolsCall, handleRunCode } = useAIFunctions()

  const [contextEmbeddings, setContextEmbeddings] = useState<IEmbedding[]>([])
  const systemPrompt = useSystemPrompt(
    contextNodes
    // contextEmbeddings
  )

  const { chatId, chatMessages, clearChatMessages } = useAIChatData()

  const { aiModel, setAIModel } = useAppStore()
  const { space } = useCurrentPathInfo()

  const filteredTools = useFilteredTools()
  const maxSteps = useMaxSteps()

  const disableInput = useMemo(
    () => !aiModel?.length || !systemPrompt?.length,
    [aiModel, systemPrompt]
  )

  const { getConfigByModel, textModelConfig } = useAiConfig()

  const config = useMemo(() => {
    try {
      return getConfigByModel(aiModel)
    } catch (error) {
      return {}
    }
  }, [aiModel, getConfigByModel])

  const { messages, setMessages, reload, append, isLoading, stop } = useChat({
    initialMessages: chatMessages,
    onToolCall: async (thisCall) => {
      const { toolCall } = thisCall
      console.log("thisCall", thisCall)
      console.log("toolCall", toolCall)
      const res = await handleToolsCall(toolCall.toolName, toolCall.args)
      console.log("toolCall", toolCall, res)
      return res
    },
    experimental_prepareRequestBody: (body) => ({
      message: body.messages.at(-1),
      ...config,
      systemPrompt,
      model: aiModel,
      tools: filteredTools,
      id: chatId,
      projectId: EIDOS_CHAT_PROJECT_ID,
      space,
      textModel: textModelConfig,
    }),
    // onFinish(message) {},
    onError(error) {
      console.log("error:", error)
      toast({
        title: error.message || t("common.error.tryAgainLater"),
        description: t("common.error.modelLimitation"),
      })
    },
    maxSteps,
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: uuidv7,
  })

  const handleReload = async () => {
    await reload()
  }

  useEffect(() => {
    setMessages(chatMessages)
  }, [chatMessages, setMessages])

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }

  useEffect(() => {
    if (isLoading && loadingRef.current) {
      loadingRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [isLoading])

  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>()

  const cleanMessages = useCallback(async () => {
    clearChatMessages(chatId)
    setMessages([])
    clearNodes()
    setContextEmbeddings([])
    setAttachments([])
  }, [setMessages, chatId, clearNodes])

  const appendHiddenMessage = useCallback(
    (message: any) => {
      setMessages([
        ...messages,
        {
          ...message,
          hidden: true,
        },
      ])
    },
    [setMessages, messages]
  )

  const { width: windowWidth = 1920, height: windowHeight = 1080 } =
    useWindowSize()

  const [block, setBlock] = useState<UIBlock>({
    documentId: "init",
    content: "",
    title: "",
    status: "idle",
    isVisible: false,
    boundingBox: {
      top: windowHeight / 4,
      left: windowWidth / 4,
      width: 250,
      height: 50,
    },
  })

  const {
    attachments,
    setAttachments,
    uploadQueue,
    fileInputRef,
    handleFileChange,
  } = useAttachments()
  const extension = useCurrentExtension()

  const handleRemoveContextNode = (nodeId: string) => {
    removeNode(nodeId, aiInputEditorRef)
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Check if dragged data is from file tree
      const dragDataStr = e.dataTransfer.getData("application/eidos-node")
      if (!dragDataStr) return

      try {
        const parsedData = JSON.parse(dragDataStr) as
          | FileTreeNode
          | { nodes?: FileTreeNode[]; primaryPath?: string }
          | FileTreeNode[]

        const draggedNodes: FileTreeNode[] = Array.isArray(parsedData)
          ? parsedData
          : "nodes" in parsedData && parsedData.nodes
            ? parsedData.nodes
            : [parsedData as FileTreeNode]

        draggedNodes.forEach((dragNode) => {
          const finalNodeId = dragNode.metadata?.nodeId || dragNode.path
          const isPathNode =
            finalNodeId?.startsWith("~") || finalNodeId?.startsWith("@/")

          if (isPathNode) {
            const fileName = dragNode.name?.toLowerCase() || ""
            const extension = fileName
              ? fileName.substring(fileName.lastIndexOf("."))
              : ""
            if (!ALLOWED_DOCUMENT_EXTENSIONS.includes(extension)) {
              return
            }
          }

          const treeNode = {
            id: finalNodeId,
            name: dragNode.name || dragNode.path,
            type: (dragNode.metadata?.nodeType as any) || dragNode.kind,
            icon: dragNode.metadata?.icon,
          }

          addNode(treeNode)
        })
      } catch (error) {
        console.error("Failed to parse drag data:", error)
      }
    },
    [addNode]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      ref={divRef}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-[1px] border-2 border-dashed border-primary/50 rounded-lg flex items-center justify-center transition-all duration-200">
          <div className="text-center text-primary font-medium animate-pulse">
            <div className="text-lg mb-2 flex items-center gap-2">
              <span className="text-2xl">📎</span>
              Drop to add to context
            </div>
            <div className="text-sm opacity-75">
              Add this item as context for AI chat
            </div>
          </div>
        </div>
      )}
      <div
        ref={messagesContainerRef}
        className="flex min-w-0 flex-1 flex-col gap-6 overflow-auto px-2 pt-4"
      >
        {messages.map((message, index) => (
          <PreviewMessage
            key={message.id}
            chatId={chatId || ""}
            projectId={extension?.id || EIDOS_CHAT_PROJECT_ID}
            message={message}
            block={block}
            setBlock={setBlock}
            isLoading={isLoading && messages.length - 1 === index}
            vote={undefined}
            onRegenerate={handleReload}
            isLastMessage={index === messages.length - 1}
          />
        ))}

        {isLoading &&
          messages.length > 0 &&
          messages[messages.length - 1].role === "user" && <ThinkingMessage />}

        <div
          ref={messagesEndRef}
          className="h-32 w-6 shrink-0"
          aria-hidden="true"
        />
      </div>

      <input
        type="file"
        className="pointer-events-none fixed -left-4 -top-4 size-0.5 opacity-0"
        ref={fileInputRef}
        multiple
        onChange={handleFileChange}
        tabIndex={-1}
      />

      <div className="sticky bottom-0 bg-background p-4">
        <AIChatAttachments
          attachments={attachments}
          uploadQueue={uploadQueue}
        />

        <div className="flex items-center justify-between">
          {experiment.enableRAG && (
            <div className="flex min-w-[200px] gap-2">
              <Switch
                id="ai-chat-use-space-data"
                checked={withSpaceData}
                onCheckedChange={setWithSpaceData}
              ></Switch>
              <Label
                htmlFor="ai-chat-use-space-data"
                className="text-sm opacity-80"
              >
                {t("aiChat.inputEditor.talkToSpaceData")}
              </Label>
            </div>
          )}
        </div>
        <div
          id="circle"
          className="absolute right-0 top-0 z-10 ml-0 h-1 rounded-xs bg-green-300 opacity-50"
        ></div>

        <AIContextNodes
          contextNodes={contextNodes}
          onRemoveNode={handleRemoveContextNode}
        />
        <div
          className={cn(
            "flex flex-col mt-2 border-2 ",
            currentExtension ? "border-primary" : "border-secondary"
          )}
        >
          <AIInputEditor
            ref={aiInputEditorRef}
            enableRAG={withSpaceData}
            disabled={disableInput}
            setContextEmbeddings={setContextEmbeddings}
            append={append}
            appendHiddenMessage={appendHiddenMessage}
            isLoading={isLoading}
            attachments={attachments}
            setAttachments={setAttachments}
            uploadQueue={uploadQueue}
          />
          <div className="flex items-center gap-1  bg-card rounded-b-sm justify-between">
            <div className="flex items-center gap-1">
              <AIModelSelect
                onValueChange={setAIModel}
                value={aiModel}
                size="xs"
                className="max-w-[200px]  text-xs"
                noBorder
              />
            </div>
            <div className="flex items-center gap-1">
              {isLoading && (
                <Button onClick={stop} variant="ghost" size="sm">
                  <PauseIcon className="h-5 w-5" />
                </Button>
              )}
              <AIToolsConfig isLoading={isLoading} />
              {/* <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
              >
                <PaperclipIcon className="h-5 w-5" />
              </Button> */}
              <Button variant="ghost" onClick={cleanMessages} size="sm">
                <Paintbrush className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Add debug component in development */}
      {/* {process.env.NODE_ENV === "development" && <ContextNodesDebug />} */}
    </div>
  )
}
