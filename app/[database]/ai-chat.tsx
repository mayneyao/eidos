"use client"

// for now it's under database page, maybe move to global later
import { useCallback, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useKeyPress, useSize } from "ahooks"
import { Bot, Loader2, Paintbrush, User } from "lucide-react"

import { handleOpenAIFunctionCall } from "@/lib/ai/openai"
import { useAI } from "@/hooks/use-ai"
import { useAutoRunCode } from "@/hooks/use-auto-run-code"
import { useSqliteStore } from "@/hooks/use-sqlite"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

import { useConfigStore } from "../settings/store"
import { AIMessage } from "./ai-chat-message-prisma"
import { useTableChange } from "./hook"
import { useDatabaseAppStore } from "./store"

export const AIChat = () => {
  const { currentTableSchema } = useDatabaseAppStore()
  const { askAI } = useAI()
  const { database, table } = useParams()
  const { aiConfig } = useConfigStore()
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const { handleFunctionCall, handleRunCode } = useAutoRunCode()
  const divRef = useRef<HTMLDivElement>()
  const size = useSize(divRef)
  const [messages, setMessages] = useState<
    {
      role: "user" | "assistant" | "function"
      content: string
    }[]
  >([])
  const { allTables } = useSqliteStore()
  const cleanMessages = useCallback(() => {
    setMessages([])
  }, [])

  const textInputRef = useRef<HTMLTextAreaElement>()

  useKeyPress("ctrl.forwardslash", () => {
    textInputRef.current?.focus()
  })

  useTableChange(cleanMessages)

  const handleSend = async () => {
    if (loading) return
    if (!input.trim().length) return
    setLoading(true)
    const _messages: any = [...messages, { role: "user", content: input }]
    setMessages(_messages)
    setInput("")
    const response = await askAI(_messages, {
      tableSchema: currentTableSchema,
      allTables,
      databaseName: database,
    })

    if (response?.finish_reason == "function_call") {
      if (aiConfig.autoRunScope) {
        const res = await handleOpenAIFunctionCall(
          response.message!,
          handleFunctionCall
        )
        if (res) {
          const { name, resp } = res
          const newMessages = [
            ..._messages,
            response.message,
            {
              role: "function",
              name,
              content: JSON.stringify(resp),
            },
          ]
          const newResponse = await askAI(newMessages, {
            tableSchema: currentTableSchema,
            allTables,
            databaseName: database,
          })
          const _newMessages = [
            ...newMessages,
            { role: "assistant", content: newResponse?.message?.content },
          ]
          console.log({ _newMessages })
          setMessages(_newMessages as any)
        }
      }
    } else if (response?.message) {
      const newMessages = [
        ..._messages,
        { role: "assistant", content: response?.message?.content },
      ]
      const thisMsgIndex = newMessages.length - 1
      setMessages(newMessages)
    }

    setLoading(false)
  }

  const handleEnter = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex h-full flex-col overflow-auto p-2" ref={divRef as any}>
      <div className="flex grow flex-col gap-2 pb-[100px]">
        {!aiConfig.token && (
          <p className="p-2">
            you need to set your openai token in{" "}
            <span>
              <Link href="/settings/ai" className="text-cyan-500">
                settings
              </Link>
            </span>{" "}
            first
          </p>
        )}
        {messages
          .filter((m) => (m.role === "user" || m.role == "assistant") && m.content)
          .map((message, i) => (
            <div
              className="flex w-full items-start gap-2 rounded-lg bg-gray-200 p-2 dark:bg-gray-700"
              key={i}
            >
              {message.role === "assistant" && (
                <>
                  <Bot className="h-4 w-4 shrink-0" />
                  <AIMessage
                    message={message.content}
                    onRun={handleRunCode}
                    msgIndex={i}
                  />
                </>
              )}
              {message.role === "user" && (
                <>
                  <User className="h-4 w-4 shrink-0" />
                  <p className="grow">{message.content}</p>
                </>
              )}
              {/* {message.role === "function" && (
              <>
                <User className="h-4 w-4 shrink-0" />
                <p className="grow">run function </p>
              </>
            )} */}
            </div>
          ))}
        <div className="flex w-full justify-center">
          {loading && <Loader2 className="h-5 w-5 animate-spin" />}
        </div>
      </div>
      <div className="sticky bottom-0">
        <div className="flex  w-full justify-end">
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
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleEnter}
        />
      </div>
    </div>
  )
}
