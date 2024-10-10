import { ChatCompletionTool } from "@mlc-ai/web-llm"
import { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"

import createDoc from "./create-doc"
import createQuickAction from "./quick-action"
import { startRecorder, stopRecorder } from "./recorder"
import saveFile2EFS from "./save-file"
import sqlQuery from "./sql-query"

export const allFunctions = [
  sqlQuery,
  createDoc,
  // createQuickAction,
  startRecorder,
  stopRecorder,
  saveFile2EFS,
]

export const functions = allFunctions.map((f) => {
  // console.log(zodToJsonSchema(f.schema))
  return {
    name: f.name,
    description: f.description,
    parameters: zodToJsonSchema(f.schema, "schema").definitions!.schema,
  }
})

export const tools = functions.map((f) => {
  return {
    type: "function",
    function: f,
  }
}) as ChatCompletionTool[]

type FunctionParamsSchemaMap = {
  [funName: string]: z.ZodSchema<any>
}

export const functionParamsSchemaMap: FunctionParamsSchemaMap =
  allFunctions.reduce((acc, f) => {
    acc[f.name] = f.schema
    return acc
  }, {} as FunctionParamsSchemaMap)
