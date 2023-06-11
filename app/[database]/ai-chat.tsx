'use client'

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getAllCodeBlocks, getSQLFromMarkdownCodeBlock } from "@/lib/markdown";
import { useSqlite } from "@/lib/sql";
import { useSqliteStore } from "@/lib/store";
import { useKeyPress } from "ahooks";
import { Bot, Loader2, Paintbrush, User } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Configuration, OpenAIApi } from "openai";
import { useCallback, useRef, useState } from "react";
import { v4 as uuidV4 } from "uuid";
import { useConfigStore } from "../settings/store";
import { AIMessage } from "./ai-chat-message-prisma";
import { useTableChange } from "./hook";
import { useDatabaseAppStore } from "./store";

const getOpenAI = (token: string) => {
  const configuration = new Configuration({
    apiKey: token ?? process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);
  return openai;
}

const askAI = async (token: string, messages: any[], context: {
  tableSchema?: string,
  allTables: string[],
  databaseName: string,
}) => {
  const openai = getOpenAI(token);
  const { tableSchema, allTables, databaseName } = context;


  const baseSysPrompt = `you're a sql generator. must abide by the following rules:
  1. your engine is sqlite, what you return is *pure sql* that can be executed in sqlite
  2. you return markdown, sql you return must be wrapped in \`\`\`sql\`\`\`. sql without no comments
  3. all table have a primary key named *_id* varchar(32)
  4. when create table, must include _id column, but without default value.
  5. when create all columns except _id are nullable  
  6. when insert,must include _id column, the value is a function named *UUID()*
  7. must abide rules above, otherwise you will be punished

`
  const contextPrompt = tableSchema ? `\ncontext below:
- database name: ${databaseName}
- current table schema:\n${tableSchema}
` : `context below:
- database name: ${databaseName}
- all tables: ${allTables.join(", ")}
- current table schema:\n${tableSchema}
`
  const systemPrompt = baseSysPrompt + contextPrompt
  // console.log(systemPrompt)
  const completion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo-0301",
    temperature: 0,
    messages: [
      ...messages,
      {
        role: "system",
        content: systemPrompt
      }
    ]
  });
  return completion.data.choices[0].message
}


const getAllSqlFromMessage = (content: string) => {
  const codeBlocks = getAllCodeBlocks(content)
  const sqls = (codeBlocks ?? []).map(codeBlock => getSQLFromMarkdownCodeBlock(codeBlock))
  return sqls
}

export const AIChat = () => {
  const { currentTableSchema, setCurrentQuery, } = useDatabaseAppStore();
  const { database, table } = useParams();
  const { handleSql, } = useSqlite(database);
  const { aiConfig } = useConfigStore();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<{
    role: "user" | "assistant",
    content: string
  }[]>([]);
  const { allTables } = useSqliteStore();
  const cleanMessages = useCallback(() => {
    setMessages([])
  }, [])

  const textInputRef = useRef<HTMLTextAreaElement>();



  useKeyPress("ctrl.forwardslash", () => {
    textInputRef.current?.focus();
  })

  useTableChange(cleanMessages)

  const handleSend = async () => {
    if (loading) return;
    if (!input.trim().length) return;
    setLoading(true);
    const _messages: any = [...messages, { role: "user", content: input }];
    setMessages(_messages)
    setInput("");
    const response = await askAI(aiConfig.token, _messages, {
      tableSchema: currentTableSchema,
      allTables,
      databaseName: database
    });
    setMessages([..._messages, { role: "assistant", content: response?.content! }])
    if (response?.content && aiConfig.autoRunScope) {
      const sqls = getAllSqlFromMessage(response?.content)
      for (const sql of sqls) {
        const scope = sql?.trim().toUpperCase().slice(0, 6)
        if (sql && scope) {
          aiConfig.autoRunScope.includes(scope) && await handleSendQuery(sql)
        }
      }
    }
    setLoading(false);
  }

  const handleEnter = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend()
    }
  }

  const handleSendQuery = useCallback(async (sql: string) => {
    if (sql.includes("UUID()")) {
      // bug, all uuid is same
      // sql = sql.replaceAll("UUID()", `'${uuidV4()}'`)
      // replace UUID() with uuidv4(), each uuid is unique
      while (sql.includes("UUID()")) {
        sql = sql.replace("UUID()", `'${uuidV4()}'`)
      }
    }
    // remove comments 
    sql = sql.replace(/--.*\n/g, '\n').replace(/\/\*.*\*\//g, '')
    const handled = await handleSql(sql)
    if (!handled) {
      console.log('set current query', sql)
      setCurrentQuery(sql);
    }
  }, [handleSql, setCurrentQuery])



  return <div className="flex h-screen flex-col overflow-auto p-2">
    <div className="flex grow flex-col gap-2 pb-[100px]">
      {!aiConfig.token && <p className="p-2">
        you need to set your openai token in <span><Link href='/settings/ai' className="text-cyan-500">settings</Link></span> first
      </p>}
      {messages.map((message, i) =>
        <div className="flex w-full items-start gap-2 rounded-lg bg-gray-200 p-2 dark:bg-gray-700" key={i}>
          {
            message.role === "assistant" ?
              <>
                <Bot className="h-4 w-4 shrink-0" />
                <AIMessage message={message.content} onRun={handleSendQuery} />
              </>
              : <>
                <User className="h-4 w-4 shrink-0" />
                <p className="grow">
                  {message.content}
                </p>
              </>
          }
        </div>)}
      <div className="flex w-full justify-center">
        {loading && <Loader2 className="h-5 w-5 animate-spin" />}
      </div>

    </div>
    <div className="sticky bottom-0">
      <div className="flex  w-full justify-end">
        <Button variant='ghost' onClick={cleanMessages}>
          <Paintbrush className="h-5 w-5" />
        </Button>
      </div>
      <Textarea
        ref={textInputRef as any}
        autoFocus
        placeholder="Type your message here."
        className=" bg-gray-100 dark:bg-gray-800"
        value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleEnter} />
    </div>
  </div>
}