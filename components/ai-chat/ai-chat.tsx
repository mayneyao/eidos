"use client"

// for now it's under database page, maybe move to global later
import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Paintbrush } from "lucide-react"
import { Link } from "react-router-dom"

import { handleOpenAIFunctionCall } from "@/lib/ai/openai"
import { cn } from "@/lib/utils"
import { useAI } from "@/hooks/use-ai"
import { useAutoRunCode } from "@/hooks/use-auto-run-code"
import { useCurrentNode } from "@/hooks/use-current-node"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { useDocEditor } from "@/hooks/use-doc-editor"
import { useSqlite, useSqliteStore } from "@/hooks/use-sqlite"
import { useTableStore } from "@/hooks/use-table"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/use-toast"
import { useSpaceAppStore } from "@/app/[database]/store"
import { useConfigStore } from "@/app/settings/store"

import { AIChatMessage } from "./ai-chat-message"

const sysPrompts = {
  base: `you must abide by the following rules:
- user just know name of table and name of column, don't know tableName and tableColumnName
- tableName and tableColumnName are actually exist in sqlite database. you will use them to query database.
- tableColumnName will be mapped, such as 'title : cl_a4ef', title is name of column, cl_a4ef is tableColumnName, you will use cl_a4ef to query database. otherwise you will be punished.
- data from query which can be trusted, you can display it directly, don't need to check it.
`,
  actionCreator: `now you are a action creator, you can create action.
- user just know name of table and name of column, don't know tableName and tableColumnName
- tableName and tableColumnName are actually exist in sqlite database. you will use them to query database.
- tableColumnName will be mapped, such as 'title : cl_a4ef', title is name of column, cl_a4ef is tableColumnName, you will use cl_a4ef to query database. otherwise you will be punished.
- data from query which can be trusted, you can display it directly, don't need to check it.

1. an action is a function, it can be called by user.
2. function has name, params and nodes
2.1 name is name of function, it can be called by user.
2.2 params is parameters of function, it can be used in nodes.
2.3 nodes is a list of node, it can be used to do something. node has name and params,every node is a function-call
3. build-in function-call below:
- addRow: add a row to table, has two params: tableName and data. data is a object, it's key is tableColumnName, it's value is data from user.

example:
q: 我想创建一个 todo 的 action, 它有一个 content 参数，我想把它保存到 todos 表的 title 字段中
a: {
  name: todo,
  params: [
    {
      name: content,
      type: string,
    }
  ],
  nodes: [
    {
      name: addRow,
      params: [
        {
          name: tableName,
          value: tb_f1ab6a737f5a4c059aeb106f8ea5a79d
        },
        {
          name: data
          value: {
            title: '{{content}}'
          }
        }
      ]
    }
  ]
}
`,
}

export const AIChat = () => {
  const [currentSysPrompt, setCurrentSysPrompt] = useState<
    "base" | "actionCreator"
  >("base")
  const { uiColumns } = useTableStore()
  const sysPrompt = sysPrompts[currentSysPrompt]
  const { askAI } = useAI(sysPrompt)
  const { space: database } = useCurrentPathInfo()
  const currentNode = useCurrentNode()
  const { aiConfig } = useConfigStore()
  const { sqlite } = useSqlite(database)

  const { getDocMarkdown } = useDocEditor(sqlite)
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const { handleFunctionCall, handleRunCode } = useAutoRunCode()
  const [currentDocMarkdown, setCurrentDocMarkdown] = useState("")

  const divRef = useRef<HTMLDivElement>()
  const {
    currentTableSchema,
    aiMessages: messages,
    setAiMessages: setMessages,
  } = useSpaceAppStore()
  const { allNodes: allTables, allUiColumns } = useSqliteStore()

  useEffect(() => {
    if (currentNode?.type === "doc") {
      console.log("fetching doc markdown")
      getDocMarkdown(currentNode.id).then((res) => {
        setCurrentDocMarkdown(res)
      })
    } else {
      setCurrentDocMarkdown("")
    }
  }, [currentNode?.id, currentNode?.type, getDocMarkdown])

  const cleanMessages = useCallback(() => {
    setMessages([])
    setLoading(false)
  }, [setMessages])

  const textInputRef = useRef<HTMLTextAreaElement>()

  const sendMessages = async (_messages: any) => {
    setLoading(true)
    try {
      const response = await askAI(_messages, {
        tableSchema: currentTableSchema,
        allTables,
        uiColumns,
        databaseName: database,
        allUiColumns,
        currentDocMarkdown,
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
              currentDocMarkdown,
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
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="link"
            onClick={() => setCurrentSysPrompt("base")}
            className={cn(currentSysPrompt === "base" && "text-cyan-500")}
          >
            base
          </Button>
          <Button
            size="sm"
            variant="link"
            onClick={() => setCurrentSysPrompt("actionCreator")}
            className={cn(
              currentSysPrompt === "actionCreator" && "text-cyan-500"
            )}
          >
            action creator
          </Button>
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
