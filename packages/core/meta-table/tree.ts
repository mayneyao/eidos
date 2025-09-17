import { TreeTableName } from "../sqlite/const"
import type { ITreeNode } from "../types/ITreeNode"
import { extractIdFromShortId, getRawTableNameById, uuidv7 } from "@/lib/utils"
import { createTriggersForFields } from "../sqlite/sql-meta-table-trigger"

import type { BaseTable } from "./base";
import { BaseTableImpl } from "./base"

export class TreeTable extends BaseTableImpl implements BaseTable<ITreeNode> {
  name = TreeTableName
  createTableSql = `
  CREATE TABLE IF NOT EXISTS ${TreeTableName} (
    id TEXT PRIMARY KEY,
    name TEXT,
    type TEXT,
    parent_id TEXT NULL,
    is_pinned BOOLEAN DEFAULT 0,
    is_full_width BOOLEAN DEFAULT 0,
    is_locked BOOLEAN DEFAULT 0,
    icon TEXT NULL,
    cover TEXT NULL,
    is_deleted BOOLEAN DEFAULT 0,
    hide_properties BOOLEAN DEFAULT 0,
    position REAL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  
  ${createTriggersForFields(TreeTableName, [
    'id', 'name', 'type', 'parent_id', 'is_pinned',
    'is_full_width', 'is_locked', 'icon', 'cover',
    'is_deleted', 'hide_properties', 'position',
    'created_at', 'updated_at'
  ])}
  `

  getNextRowId = async () => {
    const res = await this.dataSpace.exec2(
      `SELECT max(rowid) as maxId from ${TreeTableName};`
    )
    return res[0].maxId + 1
  }

  async add(data: ITreeNode): Promise<ITreeNode> {
    const nextPosition = await this.getNextRowId()
    this.dataSpace.exec(
      `INSERT INTO ${TreeTableName} (id,name,type,parent_id,position,hide_properties) VALUES (? , ? , ? , ?,?,?);`,
      [data.id, data.name, data.type, data.parent_id, nextPosition, data.hide_properties ?? 0]
    )
    return Promise.resolve({
      ...data,
      position: nextPosition,
    })
  }

  async get(id: string): Promise<ITreeNode | null> {
    const res = await this.dataSpace.exec2(
      `SELECT * FROM ${TreeTableName} where id = ?;`,
      [id]
    )
    if (res.length === 0) {
      return null
    }
    return res[0] as ITreeNode
  }

  async updateName(id: string, name: string): Promise<boolean> {
    try {
      await this.dataSpace.exec2(
        `UPDATE ${TreeTableName} SET name = ? WHERE id = ?;`,
        [name, id]
      )
      return Promise.resolve(true)
    } catch (error) {
      return Promise.resolve(false)
    }
  }

  async pin(id: string, is_pinned: boolean): Promise<boolean> {
    await this.dataSpace.exec2(
      `UPDATE ${TreeTableName} SET is_pinned = ? WHERE id = ?;`,
      [is_pinned, id]
    )
    return Promise.resolve(true)
  }

  async del(id: string, db = this.dataSpace.db): Promise<boolean> {
    this.dataSpace.syncExec2(
      `DELETE FROM ${TreeTableName} WHERE id = ?`,
      [id],
      db
    )
    return true
  }

  // @deprecated Proxy can't pass to main thread
  makeProxyRow(row: any): ITreeNode {
    const dataSpace = this.dataSpace
    return new Proxy(row, {
      get(target, p, receiver) {
        if (p === "children") {
          return []
        }
        return Reflect.get(target, p, receiver)
      },
      set(target, p: string, value, receiver) {
        dataSpace.exec(`UPDATE ${TreeTableName} SET ${p} = ? WHERE id = ?;`, [
          value,
          target.id,
        ])
        return Reflect.set(target, p, value, receiver)
      },
    })
  }

  async query(qs: {
    query?: string
    withSubNode?: boolean
  }): Promise<ITreeNode[]> {
    const { query, withSubNode } = qs
    let sql = `SELECT * FROM ${TreeTableName} `
    if (query) {
      sql += ` WHERE name like ?`
    }
    if (query && !withSubNode) {
      sql += ` AND parent_id is null`
    }

    sql += ` ORDER BY position DESC;`
    const bind = query ? [`%${query}%`] : undefined
    const res = await this.dataSpace.exec2(sql, bind)
    return res.map((row: any) => row)
  }

  async moveIntoTable(
    id: string,
    tableId: string,
    parentId?: string
  ): Promise<boolean> {
    try {
      await this.dataSpace.db.transaction(async (db) => {
        // update parent_id
        this.dataSpace.syncExec2(
          `UPDATE ${TreeTableName} SET parent_id = ? WHERE id = ?;`,
          [tableId, id],
          db
        )
        const tableName = getRawTableNameById(tableId)
        const title = (await this.get(id))?.name
        if (parentId) {
          const parentTableName = getRawTableNameById(parentId)
          this.dataSpace.syncExec2(
            `DELETE FROM ${parentTableName} WHERE _id = ?;`,
            [extractIdFromShortId(id)],
            db
          )
        }
        this.dataSpace.syncExec2(
          `INSERT INTO ${tableName} (_id,title) VALUES (?,?);`,
          [extractIdFromShortId(id), title],
          db
        )
      })
      return Promise.resolve(true)
    } catch (error) {
      return Promise.resolve(false)
    }
  }


  async duplicateNode(id: string): Promise<ITreeNode | null> {
    const node = await this.get(id)
    if (!node) return null
    const newId = uuidv7().split("-").join("")
    await this.add({
      ...node,
      id: newId,
      name: node.name + " Copy",
    })
    return this.getNode(newId)
  }
  /**
   * id: uuid without '-'
   * miniId: last 8 char of id. most of time, it's enough to identify a node
   * @param idOrMiniId
   */
  async getNode(idOrMiniId: string): Promise<ITreeNode | null> {
    const res = await this.dataSpace.exec2(
      `SELECT * FROM ${TreeTableName} WHERE id = ? OR substr(id, -8) = ?;`,
      [idOrMiniId, idOrMiniId]
    )
    return res.length > 0 ? res[0] : null
  }

  public async checkLoop(id: string, parentId: string) {
    if (id === parentId) {
      throw new Error("Can't move into a child node")
    } else {
      const adjacencyList = await this.getAdjacencyList()
      const visited = new Set<string>()
      const hasLoop = this.dfs(adjacencyList, visited, id, parentId)
      if (hasLoop) {
        throw new Error("Can't move into a child node")
      }
      // ... continue with changing the parent
    }
  }

  private async getAdjacencyList(): Promise<Map<string, string[]>> {
    const res = await this.dataSpace.exec2(
      `SELECT id, parent_id FROM ${TreeTableName}`
    )
    const adjacencyList = new Map<string, string[]>()
    for (const row of res) {
      if (!adjacencyList.has(row.parent_id)) {
        adjacencyList.set(row.parent_id, [])
      }
      adjacencyList.get(row.parent_id)!.push(row.id)
    }
    return adjacencyList
  }

  private dfs(
    adjacencyList: Map<string, string[]>,
    visited: Set<string>,
    node: string,
    target: string
  ): boolean {
    if (node === target) {
      return true
    }
    visited.add(node)
    const neighbors = adjacencyList.get(node) || []
    for (const neighbor of neighbors) {
      if (
        !visited.has(neighbor) &&
        this.dfs(adjacencyList, visited, neighbor, target)
      ) {
        return true
      }
    }
    return false
  }

  public async getPosition(props: {
    parentId?: string
    targetId: string
    targetDirection: "up" | "down"
  }): Promise<number> {
    const { parentId, targetId, targetDirection } = props
    const parentChildren = await this.list(
      { parent_id: parentId || null },
      {
        orderBy: "position",
        order: "DESC",
      }
    )
    const targetIndex = parentChildren.findIndex((node) => node.id === targetId)
    const prevIndex = targetDirection === "up" ? targetIndex - 1 : targetIndex
    const nextIndex = targetDirection === "up" ? targetIndex : targetIndex + 1
    const prevNode = parentChildren[prevIndex]
    const nextNode = parentChildren[nextIndex]

    const newPosition = () => {
      if (prevIndex === -1) {
        return nextNode?.position! + 0.5
      }
      if (!nextNode) {
        return prevNode?.position! / 2
      }
      return ((prevNode?.position! || 0) + nextNode?.position!) / 2
    }
    return newPosition()
  }

  // High-level node operations
  public async listNodes(query?: string, withSubNode?: boolean): Promise<ITreeNode[]> {
    return this.query({ query, withSubNode })
  }

  public async updateNodePosition(id: string, position: number): Promise<boolean> {
    return this.set(id, {
      position,
    })
  }

  public async pinNode(id: string, isPinned: boolean): Promise<boolean> {
    return this.pin(id, isPinned)
  }

  public async toggleNodeFullWidth(id: string, isFullWidth: boolean): Promise<boolean> {
    return this.set(id, {
      is_full_width: isFullWidth,
    })
  }

  public async toggleNodeLock(id: string, isLocked: boolean): Promise<boolean> {
    return this.set(id, {
      is_locked: isLocked,
    })
  }

  public async updateNodeName(id: string, name: string): Promise<void> {
    const node = await this.get(id)
    if (node?.name === name) {
      return
    }
    return this.dataSpace.db.transaction(async () => {
      // FIXME: should use db transaction to execute multiple sql
      await this.updateName(id, name)
      // if this node is subDoc, we need to update row.title
      if (node?.parent_id) {
        const parent = await this.get(node.parent_id)
        if (parent && parent.type === "table") {
          const tableRawName = getRawTableNameById(parent.id)
          await this.dataSpace.syncExec2(
            `UPDATE ${tableRawName} SET title = ? WHERE _id = ?`,
            [name, extractIdFromShortId(id)]
          )
        }
      }
    })
  }

  public async addNode(data: ITreeNode): Promise<ITreeNode> {
    return this.add(data)
  }

  public async getOrCreateNode(data: ITreeNode): Promise<ITreeNode> {
    const node = await this.get(data.id)
    const _data = { ...data }
    const parent = data.parent_id && (await this.getNode(data.parent_id))
    if (parent && parent.type === "table") {
      const tableRawName = getRawTableNameById(parent.id)
      // fix parent_id
      _data.parent_id = parent.id
      await this.dataSpace.syncExec2(
        `INSERT OR IGNORE INTO ${tableRawName} (_id,title) VALUES (?,?);`,
        [extractIdFromShortId(data.id), data.name]
      )
    }
    if (node) {
      return node
    }
    return this.add(_data)
  }


  public async nodeChangeParent(
    id: string,
    parentId?: string,
    opts?: {
      targetId: string
      targetDirection: "up" | "down"
    }
  ): Promise<Partial<ITreeNode>> {
    if (parentId) {
      await this.checkLoop(id, parentId)
    }
    let data: Partial<ITreeNode> = {
      parent_id: parentId,
    }
    if (opts) {
      const newPosition = await this.getPosition({
        parentId,
        targetId: opts.targetId,
        targetDirection: opts.targetDirection,
      })
      data = {
        ...data,
        position: newPosition,
      }
    }
    await this.set(id, data)
    return data
  }

  public async restoreNode(id: string): Promise<boolean> {
    return this.set(id, {
      is_deleted: false,
    })
  }

  public async deleteNode(id: string): Promise<boolean> {
    return this.set(id, {
      is_deleted: true,
    })
  }

  public async createExtNode(ext_node_type: string, parent_id?: string): Promise<string> {
    const { uuidv7 } = await import("@/lib/utils")
    const extNodeId = uuidv7().split("-").join("")
    await this.dataSpace.db.transaction(async (db) => {
      await this.add({
        id: extNodeId,
        name: '',
        type: `ext__${ext_node_type}`,
        parent_id,
      })
      await this.dataSpace.extNode.addExtNode({
        id: extNodeId,
        type: ext_node_type,
      })
    })
    return extNodeId
  }

  public async permanentlyDeleteExtNode(nodeId: string): Promise<void> {
    await this.dataSpace.db.transaction(async (db) => {
      await this.dataSpace.extNode.del(nodeId)
      await this.del(nodeId)
    })
  }
}
