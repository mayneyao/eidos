import { ChatRequest, FunctionCallHandler, nanoid } from "ai"
import OpenAI from "openai"

import { IField } from "@/lib/store/interface"

import { functionParamsSchemaMap } from "./functions"

// after 0613, openai support function call. we don't need prompt below
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
  const configuration = {
    apiKey: token ?? process.env.OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
  }
  const openai = new OpenAI(configuration)
  return openai
}

export const getPrompt = (
  baseSysPrompt: string,
  context: {
    uiColumns?: IField[]
    databaseName: string
    tableName?: string
    currentDocMarkdown?: string
  },
  useBlankPrompt = false
) => {
  // Only when user have a clear intention to call functions
  let base = `You are Eidos AI, a helpful AI assistant. here is your rules:
1. Follow the user's instructions carefully. 
2. Respond using markdown.
3. you can call functions the system provides when user want to query database
4. use will refer some nodes in the document, it seems like this: <span data-node-id="af45e5d8dbe34da3bed288f99b120b8e">import data</span>
  in this example, node title is 'import data', node id is 'af45e5d8dbe34da3bed288f99b120b8e'. 
  when you response, you just use node title, for example, you can response like this: '\`import data\` successfully'. don't need to use node id.
5. data from query which can be trusted, you can display it directly, don't need to check it. 
6. if user want to query some data, you need to generate SQL, then call tools.function 'sqlQuery' to query data. you sql engine is sqlite, make sure your sql is correct.
7. answer must be simple, don't use redundant words like "ok", "got it", "please wait" etc.
8. when user want to generate visualization, you use mermaid to generate it. return the mermaid code in code block. with language type 'mermaid'
9. answer with user's input language. 使用用户的输入语言回答问题
10. if the node is a table, most time, user want to query data from it. you can generate a simple select sql for user. the table name is the tb_<node-id>, just like this: 'tb_af45e5d8dbe34da3bed288f99b120b8e'
`
  if (useBlankPrompt) {
    return base
  }
  const { currentDocMarkdown, databaseName, uiColumns, tableName } = context
  if (currentDocMarkdown) {
    return `- don't call functions. 
- answer with user's input language.
- answer questions based on document below:
---- doc start ----
${context.currentDocMarkdown}
---- doc end ----
`
  }

  // - database name: ${databaseName}
  const contextPrompt = `context below:
- current table name : ${tableName}
- columns: ${JSON.stringify(uiColumns?.map((c) => c.name))}
-----------
- currentDocMarkdown:
${context.currentDocMarkdown}
`
  const systemPrompt = base + contextPrompt + baseSysPrompt
  return systemPrompt
}

type IGetFunctionCallHandler = (handleFunctionCall: any) => FunctionCallHandler
export const getFunctionCallHandler: IGetFunctionCallHandler =
  (handleFunctionCall: any) => async (chatMessages, functionCall) => {
    const { name, arguments: argumentsStr } = functionCall
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
    const funCallResp = await handleFunctionCall(name, argumentsObj)

    const functionResponse: ChatRequest = {
      messages: [
        ...chatMessages,
        {
          id: nanoid(),
          name,
          role: "function" as const,
          content: JSON.stringify(funCallResp),
        },
      ],
    }
    return functionResponse
  }
