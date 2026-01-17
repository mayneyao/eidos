import { extractIdFromShortId, getRawTableNameById } from "@/lib/utils"

import { TreeNodeType, type ITreeNode } from "../../types/ITreeNode"
import type { BaseTreeTable } from "./base"
import {
  buildAdjacencyList,
  calculateNewPosition,
  checkForLoop,
} from "./helper"

// Mixin to add high-level node operations
type Constructor<T = {}> = new (...args: any[]) => T & BaseTreeTable

export function WithNodeOperations<T extends Constructor>(Base: T) {
  return class NodeOperationsTreeTableMixin extends Base {
    /**
     * Get all descendants of a node (recursive) that are also deleted
     * Returns them in the correct order for deletion (leaves first)
     */
    async getAllDescendantsForDeletion(id: string): Promise<ITreeNode[]> {
      return this.getAllDescendants(id, true)
    }

    /**
     * Get all descendants of a node (recursive)
     * @param id node id
     * @param onlyDeleted if true, only return nodes where is_deleted = 1
     * @returns descendants in the correct order for deletion (leaves first)
     */
    async getAllDescendants(
      id: string,
      onlyDeleted = false
    ): Promise<ITreeNode[]> {
      const whereClause = onlyDeleted ? "WHERE is_deleted = 1" : ""
      const descendantsSql = `
          WITH RECURSIVE descendants AS (
            SELECT *, 0 as depth FROM ${this.name} WHERE parent_id = ? ${onlyDeleted ? "AND is_deleted = 1" : ""}
            UNION ALL
            SELECT t.*, d.depth + 1 FROM ${this.name} t
            INNER JOIN descendants d ON t.parent_id = d.id
            ${whereClause}
          )
          SELECT * FROM descendants ORDER BY depth DESC, id
        `
      const res = await this.dataSpace.exec2(descendantsSql, [id])
      return res as ITreeNode[]
    }

    // High-level node operations
    public async listNodes(
      query?: string,
      withSubNode?: boolean
    ): Promise<any[]> {
      return this.query({ query, withSubNode })
    }

    public async pinNode(id: string, isPinned: boolean): Promise<boolean> {
      return this.pin(id, isPinned)
    }

    public async toggleNodeFullWidth(
      id: string,
      isFullWidth: boolean
    ): Promise<boolean> {
      return this.set(id, {
        is_full_width: isFullWidth,
      })
    }

    public async toggleNodeLock(
      id: string,
      isLocked: boolean
    ): Promise<boolean> {
      return this.set(id, {
        is_locked: isLocked,
      })
    }

    public async permanentlyDeleteNode(id: string): Promise<void> {
      const node = await this.get(id)
      if (!node) return

      // Find all descendants (recursive) and delete them first
      // They are ordered by depth DESC, so leaves first
      const descendants = await this.getAllDescendants(node.id, false)
      for (const descendant of descendants) {
        await this.permanentlyDeleteNodeByType(descendant)
      }

      // Delete the node itself
      await this.permanentlyDeleteNodeByType(node)
    }

    /**
     * TODO: we should make this operation atomic
     * @param node
     */
    async permanentlyDeleteNodeByType(node: ITreeNode): Promise<void> {
      switch (node.type) {
        case "table":
          // Table deletion already handles tree node deletion
          await this.dataSpace._table(node.id).del(node.id)
          break
        case "doc":
          // Delete document content and tree node
          await this.dataSpace.doc.del(node.id)
          await this.del(node.id)
          break
        case TreeNodeType.Dataview:
          // DataView deletion already handles tree node deletion
          await this.dataSpace.dataView.delete(node.id)
          break
        default:
          if (node.type.startsWith("ext__")) {
            // ExtNode deletion already handles tree node deletion
            await (this as any).permanentlyDeleteExtNode(node.id)
          } else {
            // For other types (like folders), just delete from tree
            await this.del(node.id)
          }
          break
      }
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

    public async addNode(data: any): Promise<any> {
      return this.add(data)
    }

    public async getOrCreateNode(data: any): Promise<any> {
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
    ): Promise<Partial<any>> {
      if (parentId) {
        await this.checkLoop(id, parentId)
      }
      let data: Partial<any> = {
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

    public async checkLoop(id: string, parentId: string) {
      if (id === parentId) {
        throw new Error("Can't move into a child node")
      } else {
        const adjacencyList = await this.getAdjacencyList()
        const hasLoop = checkForLoop(id, parentId, adjacencyList)
        if (hasLoop) {
          throw new Error("Can't move into a child node")
        }
        // ... continue with changing the parent
      }
    }

    public async getAdjacencyList(): Promise<Map<string, string[]>> {
      const res = await this.dataSpace.exec2(
        `SELECT id, parent_id FROM ${this.name}`
      )
      return buildAdjacencyList(res)
    }

    // Position-related methods
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
      return calculateNewPosition(parentChildren, targetId, targetDirection)
    }

    public async updateNodePosition(
      id: string,
      position: number
    ): Promise<boolean> {
      return this.set(id, {
        position,
      })
    }

    /**
     * Build full ID-based path for a node (rooted at ~/.eidos/__NODES__)
     * Returns null if node not found or deleted.
     */
    public async getNodeIdPath(nodeId: string): Promise<string | null> {
      const sql = `
                WITH RECURSIVE ancestor_path AS (
                    SELECT id, parent_id, 1 as level
                    FROM ${this.name}
                    WHERE id = ? AND is_deleted = 0

                    UNION ALL

                    SELECT t.id, t.parent_id, ap.level + 1
                    FROM ${this.name} t
                    INNER JOIN ancestor_path ap ON t.id = ap.parent_id
                    WHERE t.is_deleted = 0
                )
                SELECT id FROM ancestor_path ORDER BY level DESC
            `

      const rows = (await this.dataSpace.exec2(sql, [nodeId])) as Array<{
        id: string
      }>
      if (!rows.length) {
        return null
      }

      const idChain = rows.map((row) => row.id).join("/")
      return `~/.eidos/__NODES__/${idChain}`
    }
  }
}
