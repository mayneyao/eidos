import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react"
import { useChat } from "ai/react"
import { Loader2, Paintbrush, PauseIcon, RefreshCcwIcon } from "lucide-react"
import { Link } from "react-router-dom"

import { getFunctionCallHandler } from "@/lib/ai/openai"
import { useAppStore } from "@/lib/store/app-store"
import { useAppRuntimeStore } from "@/lib/store/runtime-store"
import { useAIFunctions } from "@/hooks/use-ai-functions"
import { useCurrentNode } from "@/hooks/use-current-node"
import { useDocEditor } from "@/hooks/use-doc-editor"
import { useSqlite } from "@/hooks/use-sqlite"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useConfigStore } from "@/app/settings/store"

import { Loading } from "../loading"
import { AIChatMessage } from "./ai-chat-message"
import { AIModelSelect } from "./ai-chat-model-select"
import { AIInputEditor } from "./ai-input-editor"
import { sysPrompts, useSystemPrompt, useUserPrompts } from "./hooks"
import "./index.css"
import { ITreeNode } from "@/lib/store/ITreeNode"
import { useAiConfig } from "@/hooks/use-ai-config"

import { AIChatSettings } from "./settings/ai-chat-settings"
import { useAIChatSettingsStore } from "./settings/ai-chat-settings-store"
import { useLoadingStore, useReloadModel } from "./webllm/hooks"
import { WEB_LLM_MODELS } from "./webllm/models"
import { useSpeak } from "./webspeech/hooks"

const Whisper = lazy(() => import("./whisper"))

const promptKeys = Object.keys(sysPrompts).slice(0, 1)
const localModels = WEB_LLM_MODELS.map((item) => `${item.model_id}`)

export default function Chat() {
  const loadingRef = useRef<HTMLDivElement>(null)

  const { prompts } = useUserPrompts()

  const { autoSpeak } = useAIChatSettingsStore()
  const divRef = useRef<HTMLDivElement>(null)
  const [currentSysPrompt, setCurrentSysPrompt] =
    useState<keyof typeof sysPrompts>("base")
  const { isShareMode, currentPreviewFile } = useAppRuntimeStore()
  const currentNode = useCurrentNode()
  const { aiConfig } = useConfigStore()
  const { sqlite } = useSqlite()
  const { progress } = useLoadingStore()

  const { getDocMarkdown } = useDocEditor(sqlite)
  const { handleFunctionCall, handleRunCode } = useAIFunctions()
  const functionCallHandler = getFunctionCallHandler(handleFunctionCall)

  const [contextNodes, setContextNodes] = useState<ITreeNode[]>([])
  const { systemPrompt, setCurrentDocMarkdown } = useSystemPrompt(
    currentSysPrompt,
    contextNodes
  )

  const { reload: reloadModel } = useReloadModel()

  const { aiModel, setAIModel } = useAppStore()
  const { speak } = useSpeak()

  useEffect(() => {
    const isLocal = localModels.includes(aiModel)
    const localLLM = WEB_LLM_MODELS.find((item) => item.model_id === aiModel)
    if (isLocal && localLLM) {
      reloadModel(localLLM.model_id)
    }
  }, [reloadModel, aiModel])

  const { getConfigByModel } = useAiConfig()
  const { messages, setMessages, reload, append, isLoading, stop } = useChat({
    experimental_onFunctionCall: functionCallHandler as any,
    onFinish(message) {
      autoSpeak && speak(message.content, message.id)
    },
    body: {
      ...getConfigByModel(aiModel),
      GOOGLE_API_KEY: aiConfig.GOOGLE_API_KEY,
      systemPrompt,
      model: aiModel,
      currentPreviewFile,
    },
  })

  useEffect(() => {
    if (isLoading && loadingRef.current) {
      loadingRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [isLoading])
  useEffect(() => {
    if (currentNode?.type === "doc") {
      console.log("fetching doc markdown")
      getDocMarkdown(currentNode.id).then((res) => {
        setCurrentDocMarkdown(res)
      })
    } else {
      setCurrentDocMarkdown("")
    }
  }, [currentNode, getDocMarkdown, setCurrentDocMarkdown])

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
  }, [setMessages])

  return (
    <div
      className="relative flex h-full w-[24%] min-w-[400px] max-w-[700px] flex-col overflow-auto border-l border-l-slate-400 p-2"
      ref={divRef}
    >
      <div className="flex grow flex-col gap-2 pb-[100px]">
        <div className="flex items-center gap-2">
          <Select
            onValueChange={setCurrentSysPrompt as any}
            value={currentSysPrompt}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Prompt" />
            </SelectTrigger>
            <SelectContent>
              {promptKeys.map((key) => {
                return (
                  <SelectItem key={key} value={key}>
                    {key}
                  </SelectItem>
                )
              })}
              <hr />
              {prompts.map((prompt) => {
                return (
                  <SelectItem key={prompt.id} value={prompt.id}>
                    {prompt.name}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
          <AIModelSelect
            onValueChange={setAIModel as any}
            value={aiModel}
            localModels={aiConfig.localModels}
          />
          <AIChatSettings />
        </div>
        {!aiConfig.token && (
          <p className="p-2">
            you need to set your openai token in{" "}
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
      <div className="sticky bottom-0">
        <div className="flex  w-full items-center justify-end">
          {isLoading && (
            <Button onClick={stop} variant="ghost" size="sm">
              <PauseIcon className="h-5 w-5" />
            </Button>
          )}

          <Suspense fallback={<Loading />}>
            <Whisper setText={setSpeechText} />
          </Suspense>
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
        <div
          id="circle"
          className=" absolute right-0 z-10 ml-0 h-1 rounded-sm bg-green-300 opacity-50"
        ></div>
        <AIInputEditor
          disabled={progress && (progress?.progress || 0) < 1}
          setContextNodes={setContextNodes}
          append={append}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}
