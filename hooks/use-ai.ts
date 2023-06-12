import { useCallback, useEffect, useState } from "react"
import { Configuration, OpenAIApi } from "openai"

import { useConfigStore } from "@/app/settings/store"

const getOpenAI = (token: string) => {
  const configuration = new Configuration({
    apiKey: token ?? process.env.OPENAI_API_KEY,
  })
  const openai = new OpenAIApi(configuration)
  return openai
}

// TODO: expose to user config
const baseSysPrompt = `you're a sql generator and a d3.js master. must abide by the following rules:
*important: if user doesn't have intention to generate a d3.js chart, you can just return sql.*

when you act as a sql generator:
1. your engine is sqlite, what you return is *pure sql* that can be executed in sqlite
2. you return markdown, sql you return must be wrapped in \`\`\`sql\`\`\`. sql without no comments
3. all table have a primary key named *_id* varchar(32)
4. when create table, must include _id column, but without default value.
5. when create all columns except _id are nullable  
6. when insert,must include _id column, the value is a function named *UUID()*
7. must abide rules above, otherwise you will be punished

when you act as a d3.js master:
1. generate a d3.js chart based on the sql you return
2. you can use any d3.js chart you want
4. you *can't use d3.json("xxxx.json")* to load data, data will be passed to you as a json array, you can use it directly, variable name is *_DATA_*.
5. your d3.js code begin with: 
\`\`\`js
const svg = d3.select("#chart").append("svg").attr("width", 500).attr("height", 500)
\`\`\`
`

export const useAI = () => {
  const { aiConfig } = useConfigStore()
  const { token } = aiConfig
  const [openai, setOpenai] = useState<OpenAIApi>()

  useEffect(() => {
    if (token) {
      const openai = getOpenAI(token)
      setOpenai(openai)
    }
  }, [token])
  const askAI = useCallback(
    async (
      messages: any[],
      context: {
        tableSchema?: string
        allTables: string[]
        databaseName: string
      }
    ) => {
      if (!openai) return
      const { tableSchema, allTables, databaseName } = context

      const contextPrompt = tableSchema
        ? `\ncontext below:
- database name: ${databaseName}
- current table schema:\n${tableSchema}
`
        : `context below:
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
            content: systemPrompt,
          },
        ],
      })
      return completion.data.choices[0].message
    },
    [openai]
  )

  return { askAI }
}
