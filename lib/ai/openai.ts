import { ITreeNode } from "@/worker/meta_table/tree"
import { ChatRequest, FunctionCallHandler, nanoid } from "ai"
import OpenAI from "openai"

import { IUIColumn } from "@/hooks/use-table"

import { functionParamsSchemaMap, functions } from "./functions"

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
    tableSchema?: string
    uiColumns?: IUIColumn[]
    allTables: ITreeNode[]
    allUiColumns: IUIColumn[]
    databaseName: string
    currentDocMarkdown?: string
  },
  useBlankPrompt = false
) => {
  let base = `You are Eidos AI, a helpful AI assistant. here is your rules:
1. Follow the user's instructions carefully. 
2. Respond using markdown.
3. Only when user have a clear intention to call functions, you can call functions the system provides.
`
  if (useBlankPrompt) {
    return base
  }
  const {
    currentDocMarkdown,
    tableSchema,
    allTables,
    databaseName,
    uiColumns,
    allUiColumns,
  } = context
  if (currentDocMarkdown) {
    return `- don't call functions. 
- answer with user's input language.
- answer questions based on document below:
---- doc start ----
${context.currentDocMarkdown}
---- doc end ----
`
  }

  let allTableInfo = "here is all tables info:\n"

  allTables.forEach((table) => {
    if (table.type !== "table") return
    allTableInfo += `- name: ${table.name}\n -tableName: tb_${table.id}\n -all columns: \n`
    allUiColumns.forEach((column) => {
      if (column.table_name === `tb_${table.id}`) {
        allTableInfo += `   - ${column.name} : ${column.table_column_name}\n`
      }
    })
    allTableInfo += "\n---------\n"
  })

  const contextPrompt = tableSchema
    ? `
\ncontext below:
----------------
- database name: ${databaseName}
- current table schema:\n${tableSchema}
\n${allTableInfo}
`
    : `context below:
- database name: ${databaseName}
\n${allTableInfo}

- currentDocMarkdown:
${context.currentDocMarkdown}
`
  // - all tables: ${JSON.stringify(allTables)}
  // - all ui columns: ${JSON.stringify(allUiColumns)}
  const systemPrompt = base + contextPrompt + baseSysPrompt
  return systemPrompt
}

// export const askAI =
//   (baseSysPrompt: string, openai?: OpenAI) =>
//   async (
//     messages: any[],
//     context: {
//       tableSchema?: string
//       uiColumns?: IUIColumn[]
//       allTables: ITreeNode[]
//       allUiColumns: IUIColumn[]
//       databaseName: string
//       currentDocMarkdown?: string
//     }
//   ) => {
//     if (!openai) return
//     const systemPrompt = getPrompt(baseSysPrompt, context)
//     console.log("systemPrompt", systemPrompt)
//     const completion = await openai.chat.completions.create({
//       model: "gpt-3.5-turbo-0613",
//       temperature: 0,
//       messages: [
//         ...messages,
//         {
//           role: "system",
//           content: systemPrompt,
//         },
//       ],
//       functions,
//       function_call: "auto",
//     })
//     return completion.choices[0]
//   }

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
