import { JsonSchema7ObjectType } from "zod-to-json-schema/src/parsers/object"

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

export interface IScript {
  id: string
  name: string
  description: string
  version: string
  code: string
  commands: ICommand[]
  enabled?: boolean
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
        version TEXT,
        code TEXT,
        commands TEXT,
        tables TEXT,
        envs TEXT,
        env_map TEXT,
        fields_map TEXT,
        enabled BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`

  JSONFields: string[] = ["commands", "tables", "envs", "env_map", "fields_map"]

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

  async updateenv_map(id: string, env_map: { [key: string]: string }) {
    this.dataSpace.exec2(`UPDATE ${this.name} SET env_map = ? WHERE id = ?`, [
      JSON.stringify(env_map),
      id,
    ])
    return Promise.resolve(true)
  }
}
