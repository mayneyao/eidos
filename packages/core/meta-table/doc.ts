import type { Email } from "postal-mime"

import { MsgType } from "@/lib/const"
import { DocTableName } from "../sqlite/const"

import type { BaseTable } from "./base";
import { BaseTableImpl } from "./base"
import { FieldType } from "../fields/const";

/**
 * Utility function to escape FTS queries safely
 * @param query Raw user input query
 * @param allowAdvanced Whether to allow advanced FTS syntax
 * @returns Escaped query safe for FTS
 */
export function escapeFTSQuery(query: string, allowAdvanced: boolean = false): string {
  if (!query || typeof query !== 'string') {
    return '';
  }

  const trimmedQuery = query.trim();

  // Check if query looks like it contains intentional FTS syntax
  const looksAdvanced = /^["'].*["']$/.test(trimmedQuery) || // Quoted phrases
    /\b(AND|OR|NOT|NEAR)\b/i.test(trimmedQuery) || // Boolean operators
    /\*/.test(trimmedQuery) || // Wildcards
    /^\+/.test(trimmedQuery); // Prefix search

  // If advanced syntax is allowed and query looks intentional
  if (allowAdvanced && looksAdvanced) {
    // Only escape unmatched quotes and basic cleanup
    return trimmedQuery
      .replace(/"/g, (match, offset, string) => {
        // Count quotes before this position
        const beforeQuotes = (string.substring(0, offset).match(/"/g) || []).length;
        // If odd number of quotes before, this might be unmatched
        return beforeQuotes % 2 === 0 ? '"' : '';
      })
      .replace(/\s+/g, ' ')
      .trim();
  }

  // For regular user input, wrap in quotes for exact phrase matching
  // This allows searching for special characters like brackets safely
  // Escape any existing quotes in the content first
  const escaped = trimmedQuery.replace(/"/g, '""');

  // Wrap the entire query in quotes for exact phrase matching
  return `"${escaped}"`;
}



const RESERVED_PROPERTIES = [
  "id",
  "content",
  "markdown",
  "is_day_page",
  "created_at",
  "updated_at",
  "properties",
  "meta", // Now used for display configuration
]

/**
 * Parse YAML frontmatter from markdown content
 * @param markdown markdown content
 * @returns parsed custom properties object
 */
function parseFrontmatter(markdown: string): Record<string, any> {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/
  const match = markdown.match(frontmatterRegex)

  if (!match) {
    return {}
  }

  const frontmatterStr = match[1]
  const properties: Record<string, any> = {}

  // Simple YAML parsing (only supports key: value format)
  const lines = frontmatterStr.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const colonIndex = trimmed.indexOf(':')
    if (colonIndex === -1) continue

    const key = trimmed.substring(0, colonIndex).trim()
    let value = trimmed.substring(colonIndex + 1).trim()

    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    properties[key] = value
  }

  return properties
}

/**
 * Validate if custom property name is valid
 * @param propertyName property name
 * @returns whether it is valid
 */
function isValidPropertyName(propertyName: string): boolean {
  // Check if it is a reserved property
  if (RESERVED_PROPERTIES.includes(propertyName)) {
    return false
  }

  // Check if it starts with _
  if (propertyName.startsWith('_')) {
    return false
  }

  // Check if it contains special characters (only letters, numbers, underscores allowed)
  const validNameRegex = /^[a-zA-Z0-9_]+$/
  return validNameRegex.test(propertyName)
}

/**
 * Filter valid custom properties
 * @param properties properties object
 * @returns filtered valid properties object
 */
function filterValidProperties(properties: Record<string, any>): Record<string, any> {
  const validProperties: Record<string, any> = {}

  for (const [key, value] of Object.entries(properties)) {
    if (isValidPropertyName(key)) {
      validProperties[key] = value
    }
  }

  return validProperties
}

export interface IDoc {
  id: string
  content: string
  markdown: string
  is_day_page?: boolean
  created_at?: string
  updated_at?: string
  meta?: string // JSON string for display configuration
}

export interface DocMeta {
  displayProperties?: string[] // Array of property names to display
  [key: string]: any // Allow for future extensions
}


export class DocTable extends BaseTableImpl<IDoc> implements BaseTable<IDoc> {
  name = DocTableName
  createFTSSql = this.dataSpace.hasLoadExtension ? `
  CREATE VIRTUAL TABLE IF NOT EXISTS fts_docs USING fts5(id,markdown, content='${this.name}',tokenize = 'simple');
  `: `CREATE VIRTUAL TABLE IF NOT EXISTS fts_docs USING fts5(id,markdown, content='${this.name}');`

  /**
   * Get table column information
   * @returns array of column information
   */
  async getTableColumns(): Promise<string[]> {
    try {
      const res = await this.dataSpace.exec2(
        `PRAGMA table_info(${this.name})`
      )
      return res.map((col: any) => col.name)
    } catch (error) {
      console.error('Failed to get table columns:', error)
      return []
    }
  }

  /**
   * Check if column exists
   * @param columnName column name
   * @returns whether it exists
   */
  async columnExists(columnName: string): Promise<boolean> {
    const columns = await this.getTableColumns()
    return columns.includes(columnName)
  }

  /**
   * Dynamically add new column
   * @param columnName column name
   * @param columnType column type (defaults to TEXT)
   */
  async addColumn(columnName: string, columnType: string = 'TEXT'): Promise<void> {
    try {
      await this.dataSpace.exec2(
        `ALTER TABLE ${this.name} ADD COLUMN ${columnName} ${columnType}`
      )
      console.log(`Added column ${columnName} to table ${this.name}`)
    } catch (error) {
      console.error(`Failed to add column ${columnName}:`, error)
      throw error
    }
  }

  /**
   * Ensure custom property columns exist, create them if they don't
   * @param properties custom properties object
   */
  async ensureCustomPropertyColumns(properties: Record<string, any>): Promise<void> {
    const validProperties = filterValidProperties(properties)

    for (const propertyName of Object.keys(validProperties)) {
      const exists = await this.columnExists(propertyName)
      if (!exists) {
        // await this.addColumn(propertyName)
        await this.dataSpace.column.add({
          name: propertyName,
          type: FieldType.Text,
          table_name: this.name,
          table_column_name: propertyName,
          property: {},
        })
      }
    }
  }
  createTableSql = `
  CREATE TABLE IF NOT EXISTS ${this.name} (
    id TEXT PRIMARY KEY,
    content TEXT,
    is_day_page BOOLEAN DEFAULT 0,
    markdown TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    meta TEXT DEFAULT '{}' -- JSON string for display configuration
  );


  CREATE TRIGGER IF NOT EXISTS update_time_trigger__${this.name}
  AFTER UPDATE ON ${this.name}
  FOR EACH ROW
  BEGIN
    UPDATE ${this.name} SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;
    ${this.createFTSSql}    
  CREATE TEMP TRIGGER IF NOT EXISTS ${this.name}_ai AFTER INSERT ON ${this.name} BEGIN
    INSERT INTO fts_docs(rowid,id, markdown) VALUES (new.rowid, new.id, new.markdown);
  END;

  CREATE TEMP TRIGGER IF NOT EXISTS ${this.name}_ad AFTER DELETE ON ${this.name} BEGIN
    INSERT INTO fts_docs(fts_docs, rowid, id,markdown) VALUES('delete', old.rowid, old.id, old.markdown);
  END;
  
  CREATE TEMP TRIGGER IF NOT EXISTS ${this.name}_au AFTER UPDATE ON ${this.name} BEGIN
    INSERT INTO fts_docs(fts_docs, rowid, id, markdown) VALUES('delete', old.rowid, old.id, old.markdown);
    INSERT INTO fts_docs(rowid, id, markdown) VALUES (new.rowid, new.id, new.markdown);
  END;
`

  /**
   * for now lexical's code node depends on the browser's dom, so we can't use lexical in worker.
   * wait for lexical improve code node to support worker
   * @param type
   * @param data
   * @returns
   */
  callMain = (
    type:
      | MsgType.GetDocMarkdown
      | MsgType.ConvertMarkdown2State
      | MsgType.ConvertHtml2State
      | MsgType.ConvertEmail2State,
    data: any
  ) => {
    return this.dataSpace.callRenderer?.(type, data)
  }

  async rebuildIndex(opts: {
    refillNullMarkdown?: boolean;
    recreateFtsTable?: boolean;
  }) {
    const { refillNullMarkdown, recreateFtsTable } = opts;

    if (recreateFtsTable) {
      // Drop triggers first
      await this.dataSpace.db.exec(`
        DROP TRIGGER IF EXISTS ${this.name}_ai;
        DROP TRIGGER IF EXISTS ${this.name}_ad;
        DROP TRIGGER IF EXISTS ${this.name}_au;
      `);
      // Then drop the FTS table
      await this.dataSpace.exec2(`DROP TABLE IF EXISTS fts_docs;`);
      // Recreate the FTS table
      await this.dataSpace.exec2(this.createFTSSql);
      console.log(`Recreated fts_docs table and triggers for ${this.dataSpace.dbName}`);
    }

    await this.dataSpace.exec2(
      `INSERT INTO fts_docs(fts_docs) VALUES('rebuild');`
    )
    if (refillNullMarkdown) {
      const res = await this.dataSpace.exec2(
        `SELECT id, markdown FROM ${this.name}`
      )
      for (const item of res) {
        if (item.markdown == null) {
          const markdown = await this.getMarkdown(item.id)
          try {
            await this.dataSpace.exec2(
              `UPDATE ${this.name} SET markdown = ? WHERE id = ?`,
              [markdown, item.id]
            )
            console.log(`update ${item.id} markdown`)
          } catch (error) {
            console.warn(`update ${item.id} markdown error`, error)
          }
        }
      }
    }
    await this.dataSpace.exec2(
      `INSERT INTO fts_docs(fts_docs) VALUES('rebuild');`
    )
    console.log(`rebuild ${this.dataSpace.dbName} index`)
  }
  async listAllDayPages() {
    const res = await this.dataSpace.exec2(
      `SELECT id FROM ${this.name} WHERE is_day_page = 1 AND markdown != '' ORDER BY id DESC`
    )
    return res.map((item: any) => ({
      id: item.id,
    }))
  }

  async listDayPage(page: number = 0) {
    const pageSize = 7
    const res = await this.dataSpace.exec2(
      `SELECT id FROM ${this.name} WHERE is_day_page = 1 ORDER BY id DESC LIMIT ?,?`,
      [page * pageSize, pageSize]
    )
    return res.map((item: any) => ({
      id: item.id,
    }))
  }

  async del(id: string) {
    this.dataSpace.exec(`DELETE FROM ${this.name} WHERE id = ?`, [id])
    return true
  }

  async getMarkdown(id: string): Promise<string> {
    const doc = await this.get(id)
    return doc?.markdown || ""
    // const res = await callMain(MsgType.GetDocMarkdown, doc?.content)
    // return res as string
  }

  async getBaseInfo(id: string): Promise<Partial<IDoc>> {
    const res = await this.dataSpace.exec2(
      `SELECT id, created_at, updated_at FROM ${this.name} WHERE id = ?`,
      [id]
    )
    return res[0]
  }

  /**
   * Search documents using full-text search with progressive query processing
   * 
   * @param query The search query string
   * @param options Optional search configuration (kept for backward compatibility)
   * @returns Array of search results with document ID and highlighted snippets
   * 
   * @example
   * // Basic search
   * const results = await docTable.search('hello world');
   * 
   * // Advanced FTS syntax (automatically detected and handled)
   * const results = await docTable.search('"exact phrase" AND keyword*');
   */
  async search(query: string, options?: { allowAdvanced?: boolean }): Promise<{ id: string; result: string }[]> {
    if (!query || typeof query !== 'string') {
      return [];
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }

    // First try: Use the original query directly (supports advanced FTS syntax)
    try {
      const res = await this.dataSpace.exec2(
        `SELECT id, snippet(fts_docs, 1, '<b>', '</b>','...',127) as result FROM fts_docs WHERE fts_docs MATCH ?;`,
        [trimmedQuery]
      );

      // If we found results with original query, return them
      if (res.length > 0) {
        return res.reverse();
      }
    } catch (error) {
      console.log('Original query failed, trying escaped version:', error instanceof Error ? error.message : String(error));
    }

    // Second try: Use safe escaping (exact phrase match)
    try {
      const escapedQuery = escapeFTSQuery(trimmedQuery, false);
      if (escapedQuery && escapedQuery !== trimmedQuery) {
        const res = await this.dataSpace.exec2(
          `SELECT id, snippet(fts_docs, 1, '<b>', '</b>','...',127) as result FROM fts_docs WHERE fts_docs MATCH ?;`,
          [escapedQuery]
        );

        if (res.length > 0) {
          return res.reverse();
        }
      }
    } catch (error) {
      console.log('Escaped query also failed:', error instanceof Error ? error.message : String(error));
    }

    // Third try: If query contains special chars, try a more permissive search by tokenizing
    if (/[\[\]\(\)\-\+\*\&\|\!\@\#\$\%\^\~]/.test(trimmedQuery)) {
      try {
        // Remove special characters and search for individual words
        const cleanQuery = trimmedQuery
          .replace(/[\[\]\(\)\-\+\*\&\|\!\@\#\$\%\^\~]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (cleanQuery) {
          console.log('Trying permissive search with:', cleanQuery);
          const fallbackRes = await this.dataSpace.exec2(
            `SELECT id, snippet(fts_docs, 1, '<b>', '</b>','...',127) as result FROM fts_docs WHERE fts_docs MATCH ?;`,
            [cleanQuery]
          );
          return fallbackRes.reverse();
        }
      } catch (fallbackError) {
        console.error('Fallback search also failed:', fallbackError);
      }
    }

    // If all searches fail, return empty results instead of throwing
    return [];
  }

  async createOrUpdateWithMarkdown(id: string, mdStr: string) {
    const content = (await this.callMain(
      MsgType.ConvertMarkdown2State,
      mdStr
    )) as string
    return this._createOrUpdate(id, content, mdStr)
  }

  async createOrUpdate(data: {
    id: string
    text: string | Email
    type: "html" | "markdown" | "email"
    mode?: "replace" | "append" | "prepend"
  }) {
    const { id, text, type, mode = "replace" } = data
    switch (type) {
      case "html":
        const content = (await this.callMain(
          MsgType.ConvertHtml2State,
          text
        )) as string

        const markdown = (await this.callMain(
          MsgType.GetDocMarkdown,
          content
        )) as string
        return this._createOrUpdate(id, content, markdown, mode)

      case "markdown":
        const content2 = (await this.callMain(
          MsgType.ConvertMarkdown2State,
          text
        )) as string
        return this._createOrUpdate(id, content2, text as string, mode)
      case "email":
        const content3 = (await this.callMain(MsgType.ConvertEmail2State, {
          space: this.dataSpace.dbName,
          email: text,
        })) as string
        const markdown3 = (await this.callMain(
          MsgType.GetDocMarkdown,
          content3
        )) as string
        return this._createOrUpdate(id, content3, markdown3, mode)
      default:
        throw new Error(`unknown type ${type}`)
    }
  }

  static mergeState = (oldState: string, newState: string) => {
    const _oldState = JSON.parse(
      oldState
    )

    const _appendState = JSON.parse(
      newState
    )

    _oldState.root.children.push(..._appendState.root.children)
    return JSON.stringify(_oldState)
  }

  async _createOrUpdate(
    id: string,
    content: string,
    markdown: string,
    mode: "replace" | "append" | "prepend" = "replace"
  ) {
    let is_day_page = /^\d{4}-\d{2}-\d{2}$/.test(id)
    const res = await this.get(id)

    // Parse frontmatter custom properties from markdown
    const customProperties = parseFrontmatter(markdown)

    try {
      if (!res) {
        // Create new document
        await this.add({
          id,
          content,
          is_day_page,
          markdown,
        })

        // If there are custom properties, set them
        if (Object.keys(customProperties).length > 0) {
          await this.setProperties(id, customProperties)
        }
      } else {
        switch (mode) {
          case "replace":
            await this.set(id, {
              id,
              is_day_page,
              content,
              markdown,
            })

            // Update custom properties
            if (Object.keys(customProperties).length > 0) {
              await this.setProperties(id, customProperties)
            } else {
              // If there are no custom properties, clear existing custom properties
              const existingProperties = await this.getProperties(id)
              if (Object.keys(existingProperties).length > 0) {
                // Set existing properties to null to clear them
                const clearProperties: Record<string, any> = {}
                Object.keys(existingProperties).forEach(key => {
                  clearProperties[key] = null
                })
                await this.setProperties(id, clearProperties)
              }
            }
            break

          case "prepend":
            await this.set(id, {
              id,
              is_day_page,
              content: DocTable.mergeState(content, res.content),
              markdown: markdown + "\n" + res.markdown,
            })
            // Do not handle custom properties in prepend mode
            break

          case "append":
            await this.set(id, {
              id,
              is_day_page,
              content: DocTable.mergeState(res.content, content),
              markdown: res.markdown + "\n" + markdown,
            })
            // Do not handle custom properties in append mode
            break

          default:
            throw new Error(`unknown mode ${mode}`)
        }
      }
      return {
        id,
        success: true,
      }
    } catch (error) {
      console.error(error)
      return {
        id,
        success: false,
        msg: `${JSON.stringify(error)}`,
      }
    }
  }

  // getProperties
  async getProperties(id: string) {
    try {
      // Get table column information
      const columns = await this.getTableColumns()

      // Filter out reserved properties to get custom property columns
      const customPropertyColumns = columns.filter(col => !RESERVED_PROPERTIES.includes(col))

      // If there are no custom property columns, return empty object
      if (customPropertyColumns.length === 0) {
        return {}
      }

      // Build precise SELECT statement, only selecting custom property columns
      const selectColumns = customPropertyColumns.join(', ')
      const sql = `SELECT ${selectColumns} FROM ${this.name} WHERE id = ?`

      const res = await this.dataSpace.exec2(sql, [id])

      if (!res[0]) {
        return {}
      }

      // Return custom properties
      return res[0]
    } catch (error) {
      console.error('Failed to get properties:', error)
      return {}
    }
  }

  /**
   * Get all properties of a document (including system properties)
   * @param id document ID
   * @returns complete properties object
   */
  async getAllProperties(id: string) {
    const res = await this.dataSpace.exec2(
      `SELECT * FROM ${this.name} WHERE id = ?`,
      [id]
    )
    return res[0] || {}
  }

  /**
   * Get document's meta configuration
   * @param id document ID
   * @returns meta configuration object
   */
  async getMeta(id: string): Promise<DocMeta> {
    try {
      const res = await this.dataSpace.exec2(
        `SELECT meta FROM ${this.name} WHERE id = ?`,
        [id]
      )

      if (!res[0] || !res[0].meta) {
        return { displayProperties: [] }
      }

      return JSON.parse(res[0].meta) as DocMeta
    } catch (error) {
      console.error('Failed to parse meta JSON:', error)
      return { displayProperties: [] }
    }
  }

  /**
   * Set document's meta configuration
   * @param id document ID
   * @param meta meta configuration object
   * @returns operation result
   */
  async setMeta(id: string, meta: DocMeta): Promise<{ success: boolean; message?: string }> {
    try {
      const metaJson = JSON.stringify(meta)
      await this.dataSpace.exec2(
        `UPDATE ${this.name} SET meta = ? WHERE id = ?`,
        [metaJson, id]
      )
      return { success: true }
    } catch (error) {
      console.error('Failed to set meta:', error)
      return { success: false, message: `Failed to set meta: ${error}` }
    }
  }

  /**
   * Add property to display list
   * @param id document ID
   * @param propertyName property name to display
   * @returns operation result
   */
  async addDisplayProperty(id: string, propertyName: string): Promise<{ success: boolean; message?: string }> {
    try {
      const meta = await this.getMeta(id)
      const displayProperties = meta.displayProperties || []

      if (displayProperties.includes(propertyName)) {
        return { success: false, message: 'Property already in display list' }
      }

      const columns = await this.getTableColumns()
      if (!columns.includes(propertyName)) {
        return { success: false, message: 'Property does not exist ' }
      }

      displayProperties.push(propertyName)
      meta.displayProperties = displayProperties

      return await this.setMeta(id, meta)
    } catch (error) {
      console.error('Failed to add display property:', error)
      return { success: false, message: `Failed to add display property: ${error}` }
    }
  }

  /**
   * Remove property from display list
   * @param id document ID
   * @param propertyName property name to remove
   * @returns operation result
   */
  async removeDisplayProperty(id: string, propertyName: string): Promise<{ success: boolean; message?: string }> {
    try {
      const meta = await this.getMeta(id)
      const displayProperties = meta.displayProperties || []

      const index = displayProperties.indexOf(propertyName)
      if (index === -1) {
        return { success: false, message: 'Property not in display list' }
      }

      displayProperties.splice(index, 1)
      meta.displayProperties = displayProperties

      return await this.setMeta(id, meta)
    } catch (error) {
      console.error('Failed to remove display property:', error)
      return { success: false, message: `Failed to remove display property: ${error}` }
    }
  }

  /**
   * Set list of properties to display
   * @param id document ID
   * @param propertyNames array of property names to display
   * @returns operation result
   */
  async setDisplayProperties(id: string, propertyNames: string[]): Promise<{ success: boolean; message?: string }> {
    try {
      // Validate that all properties exist
      const columns = await this.getTableColumns()
      const invalidProperties = propertyNames.filter(prop =>
        !columns.includes(prop)
      )

      if (invalidProperties.length > 0) {
        return {
          success: false,
          message: `Invalid properties: ${invalidProperties.join(', ')}`
        }
      }

      const meta = await this.getMeta(id)
      meta.displayProperties = propertyNames

      return await this.setMeta(id, meta)
    } catch (error) {
      console.error('Failed to set display properties:', error)
      return { success: false, message: `Failed to set display properties: ${error}` }
    }
  }

  /**
   * Get properties to display and their values
   * @param id document ID
   * @returns properties object to display
   */
  async getDisplayProperties(id: string): Promise<Record<string, any>> {
    try {
      const meta = await this.getMeta(id)
      const displayProperties = meta.displayProperties || []

      if (displayProperties.length === 0) {
        return {}
      }

      // Build precise SELECT statement, only selecting properties to display
      const selectColumns = displayProperties.join(', ')
      const sql = `SELECT ${selectColumns} FROM ${this.name} WHERE id = ?`

      const res = await this.dataSpace.exec2(sql, [id])

      if (!res[0]) {
        return {}
      }

      return res[0]
    } catch (error) {
      console.error('Failed to get display properties:', error)
      return {}
    }
  }

  /**
   * Batch get meta configurations for multiple documents
   * @param ids array of document IDs
   * @returns meta configuration mapping object
   */
  async getMetas(ids: string[]): Promise<Record<string, DocMeta>> {
    try {
      if (ids.length === 0) {
        return {}
      }

      const placeholders = ids.map(() => '?').join(',')
      const sql = `SELECT id, meta FROM ${this.name} WHERE id IN (${placeholders})`

      const res = await this.dataSpace.exec2(sql, ids)
      const metas: Record<string, DocMeta> = {}

      // Initialize all requested IDs
      ids.forEach(id => {
        metas[id] = { displayProperties: [] }
      })

      // Fill in actual existing meta data
      res.forEach((row: any) => {
        try {
          if (row.meta) {
            metas[row.id] = JSON.parse(row.meta) as DocMeta
          }
        } catch (error) {
          console.error(`Failed to parse meta for ${row.id}:`, error)
          metas[row.id] = { displayProperties: [] }
        }
      })

      return metas
    } catch (error) {
      console.error('Failed to get metas:', error)
      // Return default values for all IDs
      const defaultMetas: Record<string, DocMeta> = {}
      ids.forEach(id => {
        defaultMetas[id] = { displayProperties: [] }
      })
      return defaultMetas
    }
  }

  /**
   * Check if property should be displayed
   * @param id document ID
   * @param propertyName property name
   * @returns whether it should be displayed
   */
  async shouldDisplayProperty(id: string, propertyName: string): Promise<boolean> {
    try {
      const meta = await this.getMeta(id)
      const displayProperties = meta.displayProperties || []
      return displayProperties.includes(propertyName)
    } catch (error) {
      console.error('Failed to check display property:', error)
      return false
    }
  }


  async setProperties(id: string, properties: Record<string, any>) {
    const validProperties = filterValidProperties(properties)

    // If there are no valid properties, return directly
    if (Object.keys(validProperties).length === 0) {
      return { success: false, message: 'No valid properties to set' }
    }

    try {
      // Ensure custom property columns exist
      await this.ensureCustomPropertyColumns(validProperties)

      // Build dynamic UPDATE statement
      const setClauses = Object.keys(validProperties).map(prop => `${prop} = ?`).join(', ')
      const values = Object.values(validProperties)
      values.push(id) // Add id as WHERE condition value

      const sql = `UPDATE ${this.name} SET ${setClauses} WHERE id = ?`

      await this.dataSpace.exec2(sql, values)

      return { success: true, updatedProperties: Object.keys(validProperties) }
    } catch (error) {
      console.error('Failed to set properties:', error)
      return { success: false, message: `Failed to set properties: ${error}` }
    }
  }
  async getPropertyMeta(id: string) {
    const res = await this.dataSpace.exec2(
      `SELECT * FROM ${this.name} WHERE id = ?`,
      [id]
    )
    return res[0]
  }
}
