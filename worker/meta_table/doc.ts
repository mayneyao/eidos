import { DocTableName } from "@/lib/sqlite/const"
import { _convertMarkdown2State, _getDocMarkdown } from "@/hooks/use-doc-editor"

import { BaseTable, BaseTableImpl } from "./base"

interface IDoc {
  id: string
  content: string
  markdown: string
  isDayPage?: boolean
}

export class DocTable extends BaseTableImpl implements BaseTable<IDoc> {
  name = DocTableName
  createTableSql = `
  CREATE TABLE IF NOT EXISTS ${this.name} (
    id TEXT PRIMARY KEY,
    content TEXT,
    isDayPage BOOLEAN DEFAULT 0,
    markdown TEXT
  );

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
      `SELECT * FROM ${this.name} WHERE isDayPage = 1 ORDER BY id DESC`
    )
    return res.map((item) => ({
      id: item.id,
      content: item.content,
    }))
  }

  async listDayPage(page: number = 0) {
    const pageSize = 7
    const res = await this.dataSpace.exec2(
      `SELECT id FROM ${this.name} WHERE isDayPage = 1 ORDER BY id DESC LIMIT ?,?`,
      [page * pageSize, pageSize]
    )
    return res.map((item) => ({
      id: item.id,
    }))
  }

  async add(data: IDoc) {
    await this.dataSpace.exec2(`INSERT INTO ${this.name} VALUES(?,?,?,?)`, [
      data.id,
      data.content,
      data.isDayPage ? 1 : 0,
      data.markdown,
    ])
    return data
  }

  async get(id: string) {
    const res = await this.dataSpace.exec2(
      `SELECT * FROM ${this.name} WHERE id = ? LIMIT 1`,
      [id]
    )
    if (res.length === 0) {
      return null
    }
    return {
      id,
      title: res[0].title,
      content: res[0].content,
      markdown: res[0].markdown,
    }
  }

  async set(id: string, data: IDoc) {
    await this.dataSpace.exec2(
      `UPDATE ${this.name} SET content = ? , markdown = ? WHERE id = ?`,
      [data.content, data.markdown, id]
    )
    return true
  }

  async del(id: string) {
    this.dataSpace.exec(`DELETE FROM ${this.name} WHERE id = ?`, [id])
    return true
  }

  async getMarkdown(id: string) {
    return await _getDocMarkdown(this.dataSpace, id)
  }

  async search(query: string): Promise<{ id: string; result: string }[]> {
    const res = await this.dataSpace.exec2(
      `SELECT id, snippet(fts_docs, 1, '<b>', '</b>','...',8) as result FROM fts_docs(?);`,
      [query]
    )
    return res
  }

  async createOrUpdateWithMarkdown(id: string, mdStr: string) {
    // if id is year-month-day, then isDayPage = true
    let isDayPage = /^\d{4}-\d{2}-\d{2}$/.test(id)
    const res = await this.get(id)
    const content = await _convertMarkdown2State(mdStr)
    try {
      if (!res) {
        await this.add({ id, content, isDayPage, markdown: mdStr })
      } else {
        await this.set(id, { id, content, isDayPage, markdown: mdStr })
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
