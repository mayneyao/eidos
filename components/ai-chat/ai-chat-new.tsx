import { IEmbedding } from "@/worker/web-worker/meta-table/embedding"
import { useChat } from "ai/react"
import { Paintbrush, PaperclipIcon, PauseIcon, RefreshCcwIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { useAIConfigStore } from "@/apps/web-app/settings/ai/store"
import { useExperimentConfigStore } from "@/apps/web-app/settings/experiment/store"
import { Button } from "@/components/ui/button"
import { useAiConfig } from "@/hooks/use-ai-config"
import { useAIFunctions } from "@/hooks/use-ai-functions"
import { ITreeNode } from "@/lib/store/ITreeNode"
import { useAppStore } from "@/lib/store/app-store"

import { useWindowSize } from "usehooks-ts"
import { Label } from "../ui/label"
import { Switch } from "../ui/switch"
import { AIModelSelect } from "./ai-chat-model-select"
import { AIChatPromptSelect } from "./ai-chat-prompt-select"
import { AIInputEditor } from "./ai-input-editor"
import {
  sysPrompts,
  useAIChatStore,
  useSystemPrompt,
  useUserPrompts,
} from "./hooks"
import "./index.css"

import { UIBlock } from "../remix-chat/components/block"
import {
  PreviewMessage,
  ThinkingMessage,
} from "../remix-chat/components/message"
import { useScrollToBottom } from "../remix-chat/components/use-scroll-to-bottom"
import { AIChatAttachments } from './ai-chat-attachments'
import { useAttachments } from './hooks/use-attachments'
import { useAIChatSettingsStore } from "./settings/ai-chat-settings-store"
import { useLoadingStore, useReloadModel } from "./webllm/hooks"
import { WEB_LLM_MODELS } from "./webllm/models"
import { useSpeak } from "./webspeech/hooks"

const promptKeys = Object.keys(sysPrompts).slice(0, 1)
const localModels = WEB_LLM_MODELS.map((item) => `${item.model_id}`)

export default function Chat() {
  const loadingRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  const { prompts } = useUserPrompts()
  const { experiment } = useExperimentConfigStore()

  const [withSpaceData, setWithSpaceData] = useState(experiment.enableRAG)

  const { autoSpeak } = useAIChatSettingsStore()
  const divRef = useRef<HTMLDivElement>(null)
  const { currentSysPrompt, setCurrentSysPrompt } = useAIChatStore()
  const { aiConfig } = useAIConfigStore()
  const { progress } = useLoadingStore()

  const { handleToolsCall, handleRunCode } = useAIFunctions()

  const [contextNodes, setContextNodes] = useState<ITreeNode[]>([])
  const [contextEmbeddings, setContextEmbeddings] = useState<IEmbedding[]>([])
  const { systemPrompt } = useSystemPrompt(
    currentSysPrompt,
    contextNodes,
    contextEmbeddings
  )

  const { reload: reloadModel } = useReloadModel()
  const { aiModel, setAIModel } = useAppStore()
  const { speak } = useSpeak()

  const disableInput = useMemo(
    () =>
      (progress && progress?.progress < 1) ||
      !aiModel?.length ||
      !systemPrompt?.length,
    [progress, aiModel, systemPrompt]
  )

  useEffect(() => {
    const prompt = prompts.find((item) => item.id === currentSysPrompt)
    if (prompt) {
      const model = prompt.model ?? prompt.prompt_config?.model
      model && setAIModel(model)
    }
  }, [currentSysPrompt, prompts, setAIModel, systemPrompt])

  useEffect(() => {
    const isLocal = localModels.includes(aiModel)
    const localLLM = WEB_LLM_MODELS.find((item) => item.model_id === aiModel)
    if (isLocal && localLLM) {
      reloadModel(localLLM.model_id)
    }
  }, [reloadModel, aiModel])

  const { getConfigByModel, hasAvailableModels } = useAiConfig()
  const { messages, setMessages, reload, append, isLoading, stop } = useChat({
    onToolCall: async ({ toolCall }) => {
      const res = await handleToolsCall(toolCall.toolName, toolCall.args)
      console.log("toolCall", toolCall, res)
      return res
    },
    onFinish(message) {
      autoSpeak && speak(message.content, message.id)
      scrollToBottom()
    },
    body: {
      ...getConfigByModel(aiModel),
      systemPrompt,
      model: aiModel, // model@provider
      useTools: false,
    },
  })

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

  const handleManualRun = async (data: any) => {
    const res = await handleRunCode(data)
    append({
      id: crypto.randomUUID(),
      role: "user",
      content: JSON.stringify(res),
      hidden: true,
    } as any)
  }

  const setSpeechText = (text: string) => {
    append({
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    } as any)
  }

  const [messagesContainerRef, messagesEndRef] =
    useScrollToBottom<HTMLDivElement>()

  const cleanMessages = useCallback(() => {
    setMessages([])
    setContextNodes([])
    setContextEmbeddings([])
    setAttachments([])
  }, [setMessages])

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
    handleFileChange
  } = useAttachments()

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      ref={divRef}
    >
      <div
        ref={messagesContainerRef}
        className="flex flex-1 flex-col min-w-0 gap-6 overflow-auto px-2 pt-4"
      >
        {/* {messages.length === 0 && <Overview />} */}

        {messages.map((message, index) => (
          <PreviewMessage
            key={message.id}
            chatId={"demo"}
            projectId={"demo"}
            message={message}
            block={block}
            setBlock={setBlock}
            isLoading={isLoading && messages.length - 1 === index}
            vote={undefined}
            onRegenerate={reload}
            isLastMessage={index === messages.length - 1}
          />
        ))}

        {isLoading &&
          messages.length > 0 &&
          messages[messages.length - 1].role === "user" && <ThinkingMessage />}

        <div
          ref={messagesEndRef}
          className="flex-shrink-0 h-32 w-6"
          aria-hidden="true"
        />
      </div>

      <input
        type="file"
        className="fixed -top-4 -left-4 size-0.5 opacity-0 pointer-events-none"
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
            <div className="flex min-w-[200px]  gap-2">
              <Switch
                id="ai-chat-use-space-data"
                checked={withSpaceData}
                onCheckedChange={setWithSpaceData}
              ></Switch>
              <Label
                htmlFor="ai-chat-use-space-data"
                className=" text-sm opacity-80"
              >
                talk to space data
              </Label>
            </div>
          )}
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <AIChatPromptSelect
                value={currentSysPrompt}
                onValueChange={setCurrentSysPrompt}
                promptKeys={promptKeys}
                prompts={prompts}
              />
              <AIModelSelect
                onValueChange={setAIModel as any}
                value={aiModel}
                size="xs"
                className="max-w-[150px]"
                localModels={aiConfig.localModels}
              />
            </div>
            <div className="flex items-center gap-1">
              {isLoading && (
                <Button onClick={stop} variant="ghost" size="sm">
                  <PauseIcon className="h-5 w-5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
              >
                <PaperclipIcon className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                onClick={() => reload()}
                size="sm"
                disabled={isLoading}
              >
                <RefreshCcwIcon className="h-5 w-5" />
              </Button>
              <Button variant="ghost" onClick={cleanMessages} size="sm">
                <Paintbrush className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
        <div
          id="circle"
          className="absolute right-0 top-0 z-10 ml-0 h-1 rounded-sm bg-green-300 opacity-50"
        ></div>
        <AIInputEditor
          enableRAG={withSpaceData}
          disabled={disableInput}
          setContextNodes={setContextNodes}
          setContextEmbeddings={setContextEmbeddings}
          append={append}
          appendHiddenMessage={appendHiddenMessage}
          isLoading={isLoading}
          attachments={attachments}
          setAttachments={setAttachments}
          uploadQueue={uploadQueue}
        />
      </div>
    </div>
  )
}
