import { z } from "zod"
import { zodToJsonSchema } from "zod-to-json-schema"

import sqlQuery from "./sql-query"

const allFunctions = [sqlQuery]
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
