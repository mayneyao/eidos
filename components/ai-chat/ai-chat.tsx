"use client"

// for now it's under database page, maybe move to global later
import { useCallback, useRef, useState } from "react"
import Link from "next/link"
import { useKeyPress } from "ahooks"
import { Loader2, Paintbrush } from "lucide-react"

import { handleOpenAIFunctionCall } from "@/lib/ai/openai"
import { useAI } from "@/hooks/use-ai"
import { useAutoRunCode } from "@/hooks/use-auto-run-code"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useSqliteStore } from "@/hooks/use-sqlite"
import { useTableStore } from "@/hooks/use-table"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/use-toast"
import { useDatabaseAppStore } from "@/app/[database]/store"
import { useConfigStore } from "@/app/settings/store"

import { AIChatMessage } from "./ai-chat-message"

export const AIChat = () => {
  const { currentTableSchema } = useDatabaseAppStore()
  const { uiColumns } = useTableStore()
  const { askAI } = useAI()
  const { database } = useCurrentPathInfo()
  const { aiConfig } = useConfigStore()
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const { handleFunctionCall, handleRunCode } = useAutoRunCode()

  const divRef = useRef<HTMLDivElement>()
  const { aiMessages: messages, setAiMessages: setMessages } =
    useDatabaseAppStore()
  const { allNodes: allTables, allUiColumns } = useSqliteStore()

  const cleanMessages = useCallback(() => {
    setMessages([])
  }, [setMessages])

  const textInputRef = useRef<HTMLTextAreaElement>()

  useKeyPress("ctrl.forwardslash", () => {
    textInputRef.current?.focus()
  })

  const runFromIndex = async (index: number) => {
    const _messages = messages.slice(0, index + 1)
    const response = await askAI(_messages, {
      tableSchema: currentTableSchema,
      allTables,
      uiColumns,
      allUiColumns,
      databaseName: database,
    })
  }

  // useTableChange(cleanMessages)

  const sendMessages = async (_messages: any) => {
    setLoading(true)
    try {
      const response = await askAI(_messages, {
        tableSchema: currentTableSchema,
        allTables,
        uiColumns,
        databaseName: database,
        allUiColumns,
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
              allUiColumns,
            })
            if (newResponse?.message?.content) {
              const _newMessages = [
                ...newMessages,
                { role: "assistant", content: newResponse?.message?.content },
              ]
              console.log({ _newMessages })
              setMessages(_newMessages as any)
            }
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
    } catch (error: any) {
      toast({
        title: "Error",
        description: "oops, something went wrong. please try again later.",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSend = async () => {
    if (loading) return
    if (!input.trim().length) return
    const _messages: any = [...messages, { role: "user", content: input }]
    setMessages(_messages)
    setInput("")
    await sendMessages(_messages)
  }

  const handleEnter = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div
      className="flex h-full w-[24%] min-w-[400px] max-w-[700px] flex-col overflow-auto border-l border-l-slate-400 p-2"
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
