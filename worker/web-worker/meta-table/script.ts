import { JsonSchema7ObjectType } from "zod-to-json-schema"

import { ScriptTableName } from "@/lib/sqlite/const"

import { BaseTable, BaseTableImpl } from "./base"

export type ScriptStatus = "all" | "enabled" | "disabled"

export interface ICommand {
  name: string
  description: string
  inputJSONSchema?: JsonSchema7ObjectType
  outputJSONSchema?: JsonSchema7ObjectType
  asTableAction?: boolean
}

export interface IPromptConfig {
  model?: string
  actions?: string[]
}


// aka extension
export interface IScript {
  id: string
  name: string
  // block is static code stored in local file system
  // m_block is mini or macro block, just a piece of code snippet stored in database
  type: "script" | "udf" | "prompt" | "block" | "app" | "m_block" | "doc_plugin"
  description: string
  version: string
  code: string
  ts_code?: string
  enabled?: boolean
  // for prompt
  model?: string
  prompt_config?: IPromptConfig
  // for script
  commands: ICommand[]
  tables?: {
    name: string
    fields: {
      name: string
      type: string
    }[]
  }[]
  envs?: {
    name: string
    type: string
    readonly?: boolean
  }[]
  env_map?: {
    [key: string]: string
  }
  fields_map?: {
    [tableName: string]: {
      id: string
      name: string
      fieldsMap: {
        [fieldName: string]: string
      }
    }
  }
  // FIXME: there are too many fields in this table, we need to refactor it
  bindings?: Record<string, {
    type: 'table'
    value: string
  }>
}

export class ScriptTable
  extends BaseTableImpl<IScript>
  implements BaseTable<IScript>
{
  name = ScriptTableName
  createTableSql = `
    CREATE TABLE IF NOT EXISTS ${this.name} (
        id TEXT PRIMARY KEY,
        name TEXT,
        description TEXT,
        type TEXT DEFAULT 'script',
        version TEXT,
        code TEXT,
        ts_code TEXT,
        model TEXT,
        prompt_config TEXT,
        commands TEXT,
        tables TEXT,
        envs TEXT,
        env_map TEXT,
        fields_map TEXT,
        enabled BOOLEAN DEFAULT 0,
        bindings TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`

  JSONFields: string[] = [
    "commands",
    "tables",
    "envs",
    "env_map",
    "fields_map",
    "prompt_config",
    "bindings",
  ]

  del(id: string): Promise<boolean> {
    this.dataSpace.exec2(`DELETE FROM ${this.name} WHERE id = ?`, [id])
    return Promise.resolve(true)
  }

  async enable(id: string): Promise<boolean> {
    this.dataSpace.exec2(`UPDATE ${this.name} SET enabled = 1 WHERE id = ?`, [
      id,
    ])
    return Promise.resolve(true)
  }

  async disable(id: string): Promise<boolean> {
    this.dataSpace.exec2(`UPDATE ${this.name} SET enabled = 0 WHERE id = ?`, [
      id,
    ])
    return Promise.resolve(true)
  }

  async updateEnvMap(id: string, env_map: { [key: string]: string }) {
    this.dataSpace.exec2(`UPDATE ${this.name} SET env_map = ? WHERE id = ?`, [
      JSON.stringify(env_map),
      id,
    ])
    return Promise.resolve(true)
  }
}
