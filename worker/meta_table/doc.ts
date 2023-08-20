import { DocTableName } from "@/lib/sqlite/const"
import { _convertMarkdown2State, _getDocMarkdown } from "@/hooks/use-doc-editor"

import { BaseTable, BaseTableImpl } from "./base"

interface IDoc {
  id: string
  content: string
  isDayPage?: boolean
}

export class DocTable extends BaseTableImpl implements BaseTable<IDoc> {
  name = DocTableName
  createTableSql = `
  CREATE TABLE IF NOT EXISTS ${this.name} (
    id TEXT PRIMARY KEY,
    content TEXT,
    isDayPage BOOLEAN DEFAULT 0
  );
`

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
      `SELECT * FROM ${this.name} WHERE isDayPage = 1 ORDER BY id DESC LIMIT ?,?`,
      [page * pageSize, pageSize]
    )
    return res.map((item) => ({
      id: item.id,
      content: item.content,
    }))
  }

  async add(data: IDoc) {
    await this.dataSpace.exec2(`INSERT INTO ${this.name} VALUES(?,?,?)`, [
      data.id,
      data.content,
      data.isDayPage ? 1 : 0,
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
    }
  }

  async set(id: string, data: IDoc) {
    await this.dataSpace.exec2(
      `UPDATE ${this.name} SET content = ? WHERE id = ?`,
      [data.content, id]
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

  async createOrUpdateWithMarkdown(id: string, mdStr: string) {
    // if id is year-month-day, then isDayPage = true
    let isDayPage = /^\d{4}-\d{2}-\d{2}$/.test(id)
    const res = await this.get(id)
    const content = await _convertMarkdown2State(mdStr)
    try {
      if (!res) {
        await this.add({ id, content, isDayPage })
      } else {
        await this.set(id, { id, content, isDayPage })
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
