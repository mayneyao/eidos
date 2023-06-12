"use client"

// for now it's under database page, maybe move to global later
import { useCallback, useRef, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useKeyPress, useSize } from "ahooks"
import { Bot, Loader2, Paintbrush, User } from "lucide-react"

import { useSqliteStore } from "@/lib/store"
import { useAI } from "@/hooks/use-ai"
import { useAutoRunCode } from "@/hooks/use-auto-run-code"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

import { useConfigStore } from "../settings/store"
import { AIMessage } from "./ai-chat-message-prisma"
import { useTableChange } from "./hook"
import { useDatabaseAppStore } from "./store"

export const AIChat = () => {
  const { currentTableSchema, setCurrentQuery } = useDatabaseAppStore()
  const { askAI } = useAI()
  const { database, table } = useParams()
  const { aiConfig } = useConfigStore()
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const { autoRun: runCode, handleRunCode } = useAutoRunCode()
  const divRef = useRef<HTMLDivElement>()
  const size = useSize(divRef)
  const [messages, setMessages] = useState<
    {
      role: "user" | "assistant"
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
    const newMessages = [
      ..._messages,
      { role: "assistant", content: response?.content! },
    ]
    const thisMsgIndex = newMessages.length - 1
    setMessages(newMessages)
    if (response?.content && aiConfig.autoRunScope) {
      setTimeout(() => {
        runCode(response.content, {
          msgIndex: thisMsgIndex,
          width: size?.width ?? 300,
        })
      }, 1000)
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
    <div
      className="flex h-screen flex-col overflow-auto p-2"
      ref={divRef as any}
    >
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
        {messages.map((message, i) => (
          <div
            className="flex w-full items-start gap-2 rounded-lg bg-gray-200 p-2 dark:bg-gray-700"
            key={i}
          >
            {message.role === "assistant" ? (
              <>
                <Bot className="h-4 w-4 shrink-0" />
                <AIMessage
                  message={message.content}
                  onRun={handleRunCode}
                  msgIndex={i}
                />
              </>
            ) : (
              <>
                <User className="h-4 w-4 shrink-0" />
                <p className="grow">{message.content}</p>
              </>
            )}
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
