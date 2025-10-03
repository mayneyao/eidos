import type { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"

import createDoc from "./create-doc"
import createTable from "./create-table"
import { startRecorder, stopRecorder } from "./recorder"
import saveFile2EFS from "./save-file"
import sqlQuery from "./sql-query"

export const allFunctions = [
  sqlQuery,
  createDoc,
  startRecorder,
  stopRecorder,
  saveFile2EFS,
  createTable,
]

export const functions = allFunctions.map((f) => {
  // console.log(zodToJsonSchema(f.schema))
  return {
    name: f.name,
    description: f.description,
    parameters: zodToJsonSchema(f.schema, "schema").definitions!.schema,
  }
})


type FunctionParamsSchemaMap = {
  [funName: string]: z.ZodSchema<any>
}

export const functionParamsSchemaMap: FunctionParamsSchemaMap =
  allFunctions.reduce((acc, f) => {
    acc[f.name] = f.schema
    return acc
  }, {} as FunctionParamsSchemaMap)
