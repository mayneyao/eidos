import type { SerializedEditorState, SerializedLexicalNode } from "lexical"
import { Email } from "postal-mime"

import { MsgType } from "@/lib/const"
import { DocTableName } from "@/lib/sqlite/const"

import { BaseTable, BaseTableImpl } from "./base"

declare var self: DedicatedWorkerGlobalScope

export interface IDoc {
  id: string
  content: string
  markdown: string
  is_day_page?: boolean
  created_at?: string
  updated_at?: string
}

/**
 * for now lexical's code node depends on the browser's dom, so we can't use lexical in worker.
 * wait for lexical improve code node to support worker
 * @param type
 * @param data
 * @returns
 */
const callMain = (
  type:
    | MsgType.GetDocMarkdown
    | MsgType.ConvertMarkdown2State
    | MsgType.ConvertHtml2State
    | MsgType.ConvertEmail2State,
  data: any
) => {
  const channel = new MessageChannel()
  self.postMessage(
    {
      type,
      data,
    },
    [channel.port2]
  )
  return new Promise((resolve) => {
    channel.port1.onmessage = (event) => {
      resolve(event.data)
    }
  })
}

export class DocTable extends BaseTableImpl implements BaseTable<IDoc> {
  name = DocTableName
  createTableSql = `
  CREATE TABLE IF NOT EXISTS ${this.name} (
    id TEXT PRIMARY KEY,
    content TEXT,
    is_day_page BOOLEAN DEFAULT 0,
    markdown TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );


  CREATE TRIGGER IF NOT EXISTS update_time_trigger__${this.name}
  AFTER UPDATE ON ${this.name}
  FOR EACH ROW
  BEGIN
    UPDATE ${this.name} SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
  END;

  CREATE VIRTUAL TABLE IF NOT EXISTS fts_docs USING fts5(id,markdown, content='${this.name}',);
    
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

  async rebuildIndex(refillNullMarkdown: boolean = false) {
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
      `SELECT * FROM ${this.name} WHERE is_day_page = 1 ORDER BY id DESC`
    )
    return res.map((item: any) => ({
      id: item.id,
      content: item.content,
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
    const res = await callMain(MsgType.GetDocMarkdown, doc?.content)
    return res as string
  }

  async getBaseInfo(id: string): Promise<Partial<IDoc>> {
    const res = await this.dataSpace.exec2(
      `SELECT id, created_at, updated_at FROM ${this.name} WHERE id = ?`,
      [id]
    )
    return res[0]
  }

  async search(query: string): Promise<{ id: string; result: string }[]> {
    const res = await this.dataSpace.exec2(
      `SELECT id, snippet(fts_docs, 1, '<b>', '</b>','...',8) as result FROM fts_docs(?);`,
      [query]
    )
    // it seems that the result is in reverse order, user care about the latest result.
    // TODO: we should use updated_at to sort
    return res.reverse()
  }

  async createOrUpdateWithMarkdown(id: string, mdStr: string) {
    const content = (await callMain(
      MsgType.ConvertMarkdown2State,
      mdStr
    )) as string
    return this._createOrUpdate(id, content, mdStr)
  }

  async createOrUpdate(data: {
    id: string
    text: string | Email
    type: "html" | "markdown" | "email"
    mode?: "replace" | "append"
  }) {
    const { id, text, type, mode = "replace" } = data
    switch (type) {
      case "html":
        const content = (await callMain(
          MsgType.ConvertHtml2State,
          text
        )) as string

        const markdown = (await callMain(
          MsgType.GetDocMarkdown,
          content
        )) as string
        return this._createOrUpdate(id, content, markdown, mode)

      case "markdown":
        const content2 = (await callMain(
          MsgType.ConvertMarkdown2State,
          text
        )) as string
        return this._createOrUpdate(id, content2, text as string, mode)
      case "email":
        const content3 = (await callMain(MsgType.ConvertEmail2State, {
          space: this.dataSpace.dbName,
          email: text,
        })) as string
        const markdown3 = (await callMain(
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
    ) as SerializedEditorState<SerializedLexicalNode>

    const _appendState = JSON.parse(
      newState
    ) as SerializedEditorState<SerializedLexicalNode>

    _oldState.root.children.push(..._appendState.root.children)
    return JSON.stringify(_oldState)
  }

  async _createOrUpdate(
    id: string,
    content: string,
    markdown: string,
    mode: "replace" | "append" = "replace"
  ) {
    let is_day_page = /^\d{4}-\d{2}-\d{2}$/.test(id)
    const res = await this.get(id)
    try {
      if (!res) {
        await this.add({
          id,
          content,
          is_day_page,
          markdown,
        })
      } else {
        switch (mode) {
          case "replace":
            await this.set(id, {
              id,
              is_day_page,
              content,
              markdown,
            })
            break
          case "append":
            await this.set(id, {
              id,
              is_day_page,
              content: DocTable.mergeState(res.content, content),
              markdown: res.markdown + "\n" + markdown,
            })
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
}
