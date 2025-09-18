import { createAllTriggersForFields } from "../sqlite/sql-meta-table-trigger";
import { KVTableName } from "../sqlite/const"
import type { BaseTable } from "./base";
import { BaseTableImpl } from "./base"

export type KV = {
    key: string
    value: string
    created_at: string
    updated_at: string
    metadata: Record<string, any>
}

export type KVGetType = "text" | "integer" | "real" | "json"

export class KVTable extends BaseTableImpl<KV> implements BaseTable<KV> {
    name = KVTableName
    createTableSql = `
  CREATE TABLE IF NOT EXISTS ${KVTableName} (
    key TEXT PRIMARY KEY,
    value TEXT,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TRIGGER IF NOT EXISTS update_time_trigger__${KVTableName}
  AFTER UPDATE ON ${KVTableName}
  FOR EACH ROW
  BEGIN
    UPDATE ${KVTableName} SET updated_at = CURRENT_TIMESTAMP WHERE key = NEW.key;
  END;

  ${createAllTriggersForFields(KVTableName, [
        'key', 'value', 'metadata'
    ])}
  `

    JSONFields: string[] = ["metadata"]
    /**
     * Get a single value from the KV store (Cloudflare Workers KV compatible)
     * @param key The key of the KV pair
     * @param typeOrOptions Optional type or options object
     * @returns Promise resolving to the value or null if not found
     */
    async get(
        key: string,
        typeOrOptions?: KVGetType
    ): Promise<any | null> {
        let sql: string
        let params: any[] = [key]
        switch (typeOrOptions) {
            case 'text':
            case 'json':
                sql = `SELECT value FROM ${KVTableName} WHERE key = ?;`
                break
            case 'integer':
                sql = `SELECT CAST(value AS INTEGER) as value FROM ${KVTableName} WHERE key = ?;`
                break
            case 'real':
                sql = `SELECT CAST(value AS REAL) as value FROM ${KVTableName} WHERE key = ?;`
                break
            default:
                sql = `SELECT value FROM ${KVTableName} WHERE key = ?;`
        }

        const result = await this.dataSpace.exec2(sql, params)

        if (result.length === 0) {
            return null
        }

        const value = result[0].value

        // Handle JSON parsing separately since it needs special handling
        if (
            typeOrOptions === 'json') {
            try {
                return JSON.parse(value)
            } catch (error) {
                throw new Error(`Failed to parse JSON for key "${key}": ${error}`)
            }
        }

        return value
    }

    /**
     * Put a value into the KV store
     * @param key The key of the KV pair
     * @param value The value of the KV pair
     * @param options The options for the KV pair
     */
    async put(key: string, value: any, options?: {
        metadata: Record<string, any>
    }) {
        console.log('put', key, value, options)
        if (typeof value === 'object' && value != null) {
            value = JSON.stringify(value)
        }
        let sql = `INSERT OR REPLACE INTO ${KVTableName} (key, value) VALUES (?, ?);`
        if (options && typeof options.metadata === 'object' && options.metadata != null) {
            sql = `INSERT OR REPLACE INTO ${KVTableName} (key, value, metadata) VALUES (?, ?, ?);`
            await this.dataSpace.exec2(sql, [key, value, JSON.stringify(options.metadata)])
        } else {
            await this.dataSpace.exec2(sql, [key, value])
        }
    }

    /**
     * Delete a value from the KV store
     * @param key 
     * @returns A Promise that resolves if the delete is successful.
     */
    async delete(key: string) {
        const sql = `DELETE FROM ${KVTableName} WHERE key = ?;`
        await this.dataSpace.exec2(sql, [key])
    }

}