import { Textarea } from "@/components/ui/textarea";
import { Configuration, OpenAIApi } from "openai";
import { useCallback, useState } from "react";
import { useDatabaseAppStore } from "./store";
import { Button } from "@/components/ui/button";
import { User, Bot, Play, Paintbrush } from "lucide-react";
import { useConfigStore } from "../settings/store";
import Link from "next/link";
import { useSqlite } from "@/lib/sql";
import { useParams } from "next/navigation";
import { v4 as uuidV4 } from "uuid";
import { useSqliteStore } from "@/lib/store";
import { useTableChange } from "./hook";
import { AIMessage } from "./ai-chat-message-prisma";

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
  2. you return markdown, sql you return must be wrapped in \`\`\`sql\`\`\`
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


export const AIChat = () => {
  const { currentTableSchema, setCurrentQuery, } = useDatabaseAppStore();
  const { database, table } = useParams();
  const { handleSql, } = useSqlite(database);
  const { aiConfig } = useConfigStore();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{
    role: "user" | "assistant",
    content: string
  }[]>([]);
  const { allTables } = useSqliteStore();
  const cleanMessages = useCallback(() => {
    setMessages([])
  }, [])

  useTableChange(cleanMessages)

  const handleSend = async () => {
    const _messages: any = [...messages, { role: "user", content: input }];
    setMessages(_messages)
    setInput("");
    const response = await askAI(aiConfig.token, _messages, {
      tableSchema: currentTableSchema,
      allTables,
      databaseName: database
    });
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
        // bug, all uuid is same
        // sql = sql.replaceAll("UUID()", `'${uuidV4()}'`)
        // replace UUID() with uuidv4(), each uuid is unique
        while (sql.includes("UUID()")) {
          sql = sql.replace("UUID()", `'${uuidV4()}'`)
        }
      }
      console.log('set current query', sql)
      setCurrentQuery(sql);
    }
  }



  return <div className="flex h-screen flex-col overflow-auto p-2">
    <div className="flex grow flex-col gap-2 pb-[100px]">
      {!aiConfig.token && <div className="p-2">
        you need to set your openai token in <Link href='/settings/ai' className="text-cyan-500">settings</Link> first
      </div>}
      {messages.map((message, i) =>
        <div className="flex w-full items-start gap-2 rounded-lg bg-gray-200 p-2 dark:bg-gray-700" key={i}>
          {
            message.role === "assistant" ?
              <>
                <Bot className="h-4 w-4 shrink-0" />
                <AIMessage message={message.content} onRun={handleSendQuery} />
                {/* <Button className="shrink-0" variant="ghost" onClick={() => { handleSendQuery(message.content) }}>
                  <Play className="h-4 w-4" />
                </Button> */}
              </>
              : <>
                <User className="h-4 w-4 shrink-0" />
                <p className="grow">
                  {message.content}
                </p>
              </>
          }
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