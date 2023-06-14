import { ChatCompletionResponseMessage, Configuration, OpenAIApi } from "openai"

import { functionParamsSchemaMap, functions } from "./functions"

// TODO: expose to user config
const _baseSysPrompt = `you're a sql generator and a d3.js master. must abide by the following rules:
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
const svg = d3.select(_CANVAS_ID_).append("svg").attr("width", _CHART_WIDTH_).attr("height", _CHART_HEIGHT_)
\`\`\`
`

const baseSysPrompt = ``
// this version is after 0613, openai support function call
// const baseSysPrompt = `you're a database master, help use query database and generate d3.js chart if user want. must abide by the following rules:

// database:
// 1. your engine is sqlite
// 2. all table have a primary key named *_id* varchar(32)
// 3. when create table, must include _id column, but without default value.
// 4. when create all columns except _id are nullable  
// 5. when insert,must include _id column, the value is a function named *UUID()*
// 6. your will call user's function to execute sql, user will return sql result to you. just return result to user with neutral language
// 7. must abide rules above, otherwise you will be punished

// d3.js:
// 1. generate a d3.js chart based on the sql you return
// 2. you can use any d3.js chart you want
// 4. you *can't use d3.json("xxxx.json")* to load data, data will be passed to you as a json array, you can use it directly, variable name is *_DATA_*.
// 5. your d3.js code begin with: 
// \`\`\`js
// const svg = d3.select(_CANVAS_ID_).append("svg").attr("width", _CHART_WIDTH_).attr("height", _CHART_HEIGHT_)
// \`\`\`
// `

export const getOpenAI = (token: string) => {
  const configuration = new Configuration({
    apiKey: token ?? process.env.OPENAI_API_KEY,
  })
  const openai = new OpenAIApi(configuration)
  return openai
}

export const askAI =
  (openai?: OpenAIApi) =>
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
    console.log(functions)
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo-0613",
      temperature: 0,
      messages: [
        ...messages,
        {
          role: "system",
          content: systemPrompt,
        },
      ],
      functions,
      function_call: "auto",
    })
    return completion.data.choices[0]
  }

export const handleOpenAIFunctionCall = async (
  response: ChatCompletionResponseMessage,
  handleFunctionCall: (name: string, argumentsStr: string) => Promise<any>
) => {
  if (response.function_call) {
    const { name, arguments: argumentsStr } = response.function_call
    if (!name) return
    let argumentsObj
    try {
      argumentsObj = argumentsStr ? JSON.parse(argumentsStr) : {}
    } catch (error) {
      throw new Error(`invalid arguments: ${argumentsStr}`)
    }
    const functionParamsSchema = functionParamsSchemaMap[name]
    const { success } = functionParamsSchema.safeParse(argumentsObj)
    if (!success) {
      throw new Error(`invalid arguments: ${argumentsStr}`)
    }
    console.log(
      `function_call: ${name}, arguments: ${JSON.stringify(argumentsObj)}`
    )
    return {
      resp: await handleFunctionCall(name, argumentsObj),
      name: name,
    }
  }
}
