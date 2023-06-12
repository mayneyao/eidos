"use client"

import { useKeyPress } from "ahooks"
import * as d3 from "d3"
import { Bot, Loader2, Paintbrush, User } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useCallback, useRef, useState } from "react"
import { v4 as uuidV4 } from "uuid"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useAI } from "@/hooks/use-ai"
import { useSqlite } from "@/hooks/use-sqlite"
import { getAllCodeBlocks, getSQLFromMarkdownCodeBlock } from "@/lib/markdown"
import { useSqliteStore } from "@/lib/store"

import { useConfigStore } from "../settings/store"
import { AIMessage } from "./ai-chat-message-prisma"
import { useTableChange } from "./hook"
import { useDatabaseAppStore } from "./store"

const getAllSqlFromMessage = (content: string) => {
  const codeBlocks = getAllCodeBlocks(content)
  const sqls = (codeBlocks ?? []).map((codeBlock) =>
    getSQLFromMarkdownCodeBlock(codeBlock)
  )
  return sqls
}

export const AIChat = () => {
  const { currentTableSchema, setCurrentQuery } = useDatabaseAppStore()
  const { askAI } = useAI()
  const { database, table } = useParams()
  const { handleSql, sqlite } = useSqlite(database)
  const { aiConfig } = useConfigStore()
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
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
    setMessages(newMessages)
    if (response?.content && aiConfig.autoRunScope) {
      const sqls = getAllSqlFromMessage(response?.content)
      for (const sql of sqls) {
        const scope = sql?.trim().toUpperCase().slice(0, 6)
        if (sql && scope) {
          aiConfig.autoRunScope.includes(scope) && (await handleSendQuery(sql))
        }
      }
    }
    setLoading(false)
  }

  const handleEnter = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      handleSend()
    }
  }
  const handleSendQuery = useCallback(
    async (sql: string) => {
      if (sql.includes("UUID()")) {
        // bug, all uuid is same
        // sql = sql.replaceAll("UUID()", `'${uuidV4()}'`)
        // replace UUID() with uuidv4(), each uuid is unique
        while (sql.includes("UUID()")) {
          sql = sql.replace("UUID()", `'${uuidV4()}'`)
        }
      }
      // remove comments
      sql = sql.replace(/--.*\n/g, "\n").replace(/\/\*.*\*\//g, "")
      const handled = await handleSql(sql)
      if (!handled) {
        // if (isAggregated(sql) && sqlite) {
        //   // execute aggregated sql, put result in message
        //   const result = await sqlite.sql`${sql}`
        // }
        console.log("set current query", sql)
        setCurrentQuery(sql)
      }
    },
    [handleSql, setCurrentQuery]
  )
  const handleRunCode = (code: string, lang: string) => {
    switch (lang) {
      case "sql":
        handleSendQuery(code)
        break
      case "js":
        // eslint-disable-next-line no-eval
        try {
          const svg = d3.select("#chart").select("svg")
          if (!svg.empty()) {
            svg.remove()
          }
        } catch (error) {}
        eval(code)
        break
      default:
        break
    }
  }

  return (
    <div className="flex h-screen flex-col overflow-auto p-2">
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
                <AIMessage message={message.content} onRun={handleRunCode} />
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
