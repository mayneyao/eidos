// for now it's under database page, maybe move to global later

import { useCallback, useEffect, useRef, useState } from "react"
import { useChat } from "ai/react"
import { Loader2, Paintbrush, PauseIcon } from "lucide-react"
import { Link } from "react-router-dom"

import { getFunctionCallHandler } from "@/lib/ai/openai"
import { useAppStore } from "@/lib/store/app-store"
import { useAutoRunCode } from "@/hooks/use-auto-run-code"
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

import { AIChatMessage } from "./ai-chat-message"
import { sysPrompts, useSystemPrompt } from "./hooks"

const promptKeys = Object.keys(sysPrompts)

const models = [
  "gpt-3.5-turbo",
  "gpt-3.5-turbo-16k",
  "gpt-3.5-turbo-0613",
  "gpt-3.5-turbo-16k-0613",
  "gpt-4",
  "gpt-4-0613",
  "gpt-4-32k",
  "gpt-4-32k-0613",
]

export default function Chat() {
  const divRef = useRef<HTMLDivElement>()
  const textInputRef = useRef<HTMLTextAreaElement>()
  const [currentSysPrompt, setCurrentSysPrompt] =
    useState<keyof typeof sysPrompts>("base")

  const currentNode = useCurrentNode()
  const { aiConfig } = useConfigStore()
  const { sqlite } = useSqlite()
  const { getDocMarkdown } = useDocEditor(sqlite)

  const { handleFunctionCall, handleRunCode } = useAutoRunCode()
  const functionCallHandler = getFunctionCallHandler(handleFunctionCall)
  const { systemPrompt, setCurrentDocMarkdown } =
    useSystemPrompt(currentSysPrompt)

  const { aiModel, setAIModel } = useAppStore()
  const {
    messages,
    setMessages,
    reload,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    stop,
  } = useChat({
    experimental_onFunctionCall: functionCallHandler,
    body: {
      token: aiConfig.token,
      baseUrl: aiConfig.baseUrl,
      systemPrompt,
      model: aiModel,
    },
  })
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
      handleSubmit(e as any)
    }
  }

  const cleanMessages = useCallback(() => {
    setMessages([])
  }, [setMessages])

  return (
    <div
      className="flex h-full w-[24%] min-w-[400px] max-w-[700px] flex-col overflow-auto border-l border-l-slate-400 p-2"
      ref={divRef as any}
    >
      <div className="flex grow flex-col gap-2 pb-[100px]">
        <div className="flex gap-2">
          <Select
            onValueChange={setCurrentSysPrompt as any}
            value={currentSysPrompt}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Prompt" />
            </SelectTrigger>
            <SelectContent>
              {promptKeys.map((key) => {
                return <SelectItem value={key}>{key}</SelectItem>
              })}
            </SelectContent>
          </Select>
          <Select onValueChange={setAIModel as any} value={aiModel}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              {models.map((key) => {
                return <SelectItem value={key}>{key}</SelectItem>
              })}
            </SelectContent>
          </Select>
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
          if ((m.role === "user" || m.role == "assistant") && m.content) {
            return (
              <AIChatMessage
                key={i}
                msgIndex={i}
                message={message}
                handleRunCode={handleRunCode}
              />
            )
          }
        })}

        <div className="flex w-full justify-center">
          {isLoading && (
            <div>
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}
        </div>
      </div>
      <div className="sticky bottom-0">
        <div className="flex  w-full justify-end">
          {isLoading && (
            <Button onClick={stop} variant="ghost" size="sm">
              <PauseIcon className="h-5 w-5" />
            </Button>
          )}
          <Button variant="ghost" onClick={cleanMessages}>
            <Paintbrush className="h-5 w-5" />
          </Button>
        </div>
        <Textarea
          ref={textInputRef as any}
          autoFocus
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
