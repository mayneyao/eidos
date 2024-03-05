import { useCallback, useEffect, useRef, useState } from "react"
import { useChat } from "ai/react"
import { Loader2, Paintbrush, PauseIcon } from "lucide-react"
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
import { Textarea } from "@/components/ui/textarea"
import { useConfigStore } from "@/app/settings/store"

import "./index.css"
import { AIChatMessage } from "./ai-chat-message"
import { AIModelSelect } from "./ai-chat-model-select"
import { sysPrompts, useSystemPrompt } from "./hooks"
import { AIChatSettings } from "./settings/ai-chat-settings"
import { useLoadingStore } from "./webllm/hooks"
import { useSpeak } from "./webspeech/hooks"
import { Whisper } from "./whisper"

const promptKeys = Object.keys(sysPrompts)

export default function Chat() {
  const loadingRef = useRef<HTMLDivElement>(null)

  const divRef = useRef<HTMLDivElement>(null)
  const textInputRef = useRef<HTMLTextAreaElement>()
  const [currentSysPrompt, setCurrentSysPrompt] =
    useState<keyof typeof sysPrompts>("base")
  const { isShareMode, currentPreviewFile } = useAppRuntimeStore()
  const currentNode = useCurrentNode()
  const { aiConfig } = useConfigStore()
  const { sqlite } = useSqlite()
  const { progress, setProgress } = useLoadingStore()
  const { getDocMarkdown } = useDocEditor(sqlite)
  const { handleFunctionCall, handleRunCode } = useAIFunctions()
  const functionCallHandler = getFunctionCallHandler(handleFunctionCall)
  const { systemPrompt, setCurrentDocMarkdown } =
    useSystemPrompt(currentSysPrompt)

  useEffect(() => {
    if (progress?.progress === 1) {
      setProgress(undefined)
    }
  }, [progress, setProgress])

  const { aiModel, setAIModel } = useAppStore()
  const { speak } = useSpeak()

  const {
    messages,
    setMessages,
    reload,
    input,
    handleInputChange,
    handleSubmit,
    append,
    isLoading,
    stop,
  } = useChat({
    experimental_onFunctionCall: functionCallHandler as any,
    onFinish(message) {
      speak(message.content, message.id)
    },
    body: {
      token: aiConfig.token,
      baseUrl: aiConfig.baseUrl,
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

  const handleEnter = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      if (!input) return
      if (isLoading) return
      handleSubmit(e as any)
    }
  }
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
      className="relative flex h-screen w-[24%] min-w-[400px] max-w-[700px] flex-col overflow-auto border-l border-l-slate-400 p-2"
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
            </SelectContent>
          </Select>
          <AIModelSelect onValueChange={setAIModel as any} value={aiModel} />
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
          <Whisper setText={setSpeechText} />
          <Button variant="ghost" onClick={cleanMessages} size="sm">
            <Paintbrush className="h-5 w-5" />
          </Button>
        </div>
        <div
          id="circle"
          className=" absolute right-0 ml-0 h-1 rounded-sm bg-green-300 opacity-50"
        ></div>
        <Textarea
          ref={textInputRef as any}
          autoFocus
          disabled={progress && (progress?.progress || 0) < 1}
          placeholder="Type your message here."
          className=" bg-gray-100 dark:bg-gray-800"
          value={input}
          onChange={handleInputChange}
          onKeyDown={handleEnter}
        />
      </div>
    </div>
  )
}
