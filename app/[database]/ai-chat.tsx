import { Textarea } from "@/components/ui/textarea";
import { Configuration, OpenAIApi } from "openai";
import { useState } from "react";
import { useDatabaseAppStore } from "./store";
import { Button } from "@/components/ui/button";
import { User, Bot, Play, Paintbrush } from "lucide-react";
import { useConfigStore } from "../settings/store";
import Link from "next/link";
import { useSqlite } from "@/lib/sql";
import { useParams } from "next/navigation";
import { v4 as uuidV4 } from "uuid";

const getOpenAI = (token: string) => {
  const configuration = new Configuration({
    apiKey: token ?? process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);
  return openai;
}

const askAI = async (token: string, messages: any[], tableSchema?: string) => {
  const openai = getOpenAI(token);
  const promptWithTableSchema = `\nhere is the table schema:\n${tableSchema}`
  const baseSysPrompt = `you're a sql generator, *only return sql, *do not explain* default settings below:
- all table have a primary key named *_id* varchar(32)
- if you create a table, you must include _id column
- if you create a table, all columns except _id are nullable
- if you query a table, you just return sql, *do not explain*
- if you insert a row, you must include _id column, the value is a function named *UUID()*
`
  const systemPrompt = tableSchema ? baseSysPrompt + promptWithTableSchema : baseSysPrompt
  const completion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
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


export const AIChat = () => {
  const { currentTableSchema, setCurrentQuery, } = useDatabaseAppStore();
  const database = useParams().database;
  const { createTableWithSql, updateTableData, handleSql } = useSqlite(database);
  const { aiConfig } = useConfigStore();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{
    role: "user" | "assistant",
    content: string
  }[]>([]);

  const handleSend = async () => {
    const _messages: any = [...messages, { role: "user", content: input }];
    setMessages(_messages)
    setInput("");
    const response = await askAI(aiConfig.token, _messages, currentTableSchema);
    setMessages([..._messages, { role: "assistant", content: response?.content! }])
  }

  const handleEnter = async (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend()
    }
  }

  const handleSendQuery = async (sql: string) => {
    const handled = await handleSql(sql)
    if (!handled) {
      if (sql.includes("UUID()")) {
        sql = sql.replace("UUID()", `'${uuidV4()}'`)
      }
      console.log('set current query', sql)
      setCurrentQuery(sql);
    }
  }

  const cleanMessages = () => {
    setMessages([])
  }

  return <div className="flex h-screen flex-col overflow-auto p-2">
    <div className="flex grow flex-col gap-2 pb-[100px]">
      {!aiConfig.token && <div className="p-2">
        you need to set your openai token in <Link href='/settings/ai' className="text-cyan-500">
          <a >settings</a>
        </Link> first
      </div>}
      {messages.map((message, i) => <div key={i}>
        <div className="flex w-full items-start gap-2 rounded-lg bg-gray-200 p-2 dark:bg-gray-700">
          {
            message.role === "assistant" ?
              <>
                <Bot className="h-4 w-4 shrink-0" />
                <p className="grow">
                  {message.content}
                </p>
                <Button className="shrink-0" variant="ghost" onClick={() => { handleSendQuery(message.content) }}>
                  <Play className="h-4 w-4" />
                </Button>
              </>
              : <>
                <User className="h-4 w-4 shrink-0" />
                <p className="grow">
                  {message.content}
                </p>
              </>
          }
        </div>
      </div>)}

    </div>
    <div className="sticky bottom-0">
      <div className="flex  w-full justify-end">
        <Button variant='ghost' onClick={cleanMessages}>
          <Paintbrush className="h-5 w-5" />
        </Button>
      </div>
      <Textarea
        autoFocus
        placeholder="Type your message here."
        className=" bg-gray-100 dark:bg-gray-800"
        value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleEnter} />
    </div>
  </div>
}