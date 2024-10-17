import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { IEmbedding } from "@/worker/web-worker/meta-table/embedding"
import { useChat } from "ai/react"
import { Loader2, Paintbrush, PauseIcon, RefreshCcwIcon } from "lucide-react"
import { Link } from "react-router-dom"

import { ITreeNode } from "@/lib/store/ITreeNode"
import { useAppStore } from "@/lib/store/app-store"
import { useAiConfig } from "@/hooks/use-ai-config"
import { useAIFunctions } from "@/hooks/use-ai-functions"
import { Button } from "@/components/ui/button"
import { useAIConfigStore } from "@/apps/web-app/settings/ai/store"
import { useExperimentConfigStore } from "@/apps/web-app/settings/experiment/store"

import { Label } from "../ui/label"
import { ScrollArea } from "../ui/scroll-area"
import { Switch } from "../ui/switch"
import { AIChatMessage } from "./ai-chat-message"
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
    maxToolRoundtrips: 3,
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

  const cleanMessages = useCallback(() => {
    setMessages([])
    setContextNodes([])
    setContextEmbeddings([])
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

  return (
    <div
      className="relative flex h-full w-full shrink-0 flex-col gap-2 overflow-auto p-2 pt-1"
      ref={divRef}
    >
      <ScrollArea className="grow" ref={chatContainerRef}>
        <div className="flex grow flex-col gap-2 p-3 pb-[100px]">
          {!hasAvailableModels && (
            <p className="p-2">
              you need to set up LLMs in{" "}
              <span>
                <Link to="/settings/ai" className="text-cyan-500">
                  settings
                </Link>
              </span>{" "}
              first
            </p>
          )}
          {messages.map((message, i) => {
            const m = message
            if (
              (m.role === "user" || m.role == "assistant") &&
              m.content &&
              !(m as any).hidden
            ) {
              return (
                <AIChatMessage
                  key={i}
                  msgIndex={i}
                  message={message}
                  messages={messages}
                  handleRunCode={handleManualRun}
                />
              )
            }
          })}
          <div>{progress?.text}</div>
          <div className="flex w-full justify-center">
            {isLoading && (
              <div ref={loadingRef}>
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
      <div className="relative shrink-0">
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
                className="max-w-[100px]"
                localModels={aiConfig.localModels}
              />
            </div>
            <div className="flex items-center gap-1">
              {/* <AIChatSettings /> */}
              {isLoading && (
                <Button onClick={stop} variant="ghost" size="sm">
                  <PauseIcon className="h-5 w-5" />
                </Button>
              )}

              {/* <Suspense fallback={<Loading />}>
              <Whisper setText={setSpeechText} />
            </Suspense> */}
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
              {/* <Button variant="ghost" size="sm">
              <SendIcon className="h-5 w-5 opacity-60"></SendIcon>
            </Button> */}
            </div>
          </div>
        </div>
        <div
          id="circle"
          className=" absolute right-0 top-0 z-10 ml-0 h-1 rounded-sm bg-green-300 opacity-50"
        ></div>
        <AIInputEditor
          enableRAG={withSpaceData}
          disabled={disableInput}
          setContextNodes={setContextNodes}
          setContextEmbeddings={setContextEmbeddings}
          append={append}
          appendHiddenMessage={appendHiddenMessage}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}
