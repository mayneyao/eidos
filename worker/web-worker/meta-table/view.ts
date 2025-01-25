import { ViewTableName } from "@/lib/sqlite/const"
import {
  replaceQueryTableName,
  replaceWithFindIndexQuery,
} from "@/lib/sqlite/sql-parser"
import { IView, ViewTypeEnum } from "@/lib/store/IView"
import { getUuid } from "@/lib/utils"

import { BaseTable, BaseTableImpl } from "./base"
import { timeit } from "../helper"

export class ViewTable extends BaseTableImpl implements BaseTable<IView> {
  name = ViewTableName
  createTableSql = `
CREATE TABLE IF NOT EXISTS ${this.name} (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  table_id TEXT NOT NULL,
  query TEXT NOT NULL,
  properties TEXT,
  filter TEXT,
  order_map TEXT,
  hidden_fields TEXT,
  position REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`

  JSONFields = ["properties", "filter", "order_map", "hidden_fields"]
  async add(data: IView): Promise<IView> {
    const position = await this.getLastPosition() + 1
    await this.dataSpace.exec2(
      `INSERT INTO ${this.name} (id,name,type,table_id,query,position) VALUES (? , ? , ? , ? , ?, ?);`,
      [data.id, data.name, data.type, data.table_id, data.query, position]
    )
    return {
      ...data,
      position,
    }
  }

  async del(id: string): Promise<boolean> {
    try {
      await this.dataSpace.exec2(`DELETE FROM ${this.name} WHERE id = ?`, [id])
      return true
    } catch (error) {
      console.warn(error)
      return false
    }
  }

  async deleteByTableId(table_id: string, db = this.dataSpace.db) {
    this.dataSpace.syncExec2(
      `DELETE FROM ${this.name} WHERE table_id = ?`,
      [table_id],
      db
    )
  }

  // methods
  public async updateQuery(id: string, query: string) {
    await this.dataSpace.exec2(
      `UPDATE ${this.name} SET query = ? WHERE id = ?`,
      [query, id]
    )
  }

  public async createDefaultView(table_id: string) {
    return await this.add({
      id: getUuid(),
      name: "New View",
      type: ViewTypeEnum.Grid,
      table_id,
      query: `SELECT * FROM tb_${table_id}`,
    })
  }

  public async isRowExistInQuery(
    table_id: string,
    rowId: string,
    query: string
  ) {
    const tmpTableName = `temp_table_${getUuid().slice(0, 8)}`
    const tableName = `tb_${table_id}`
    let isExist = false
    try {
      await this.dataSpace.exec2(
        `CREATE TEMPORARY TABLE ${tmpTableName} AS SELECT * FROM ${tableName} WHERE _id = ?`,
        [rowId]
      )
      // Check if the row exists in the temporary table
      const newQuery = replaceQueryTableName(query, {
        [tableName]: tmpTableName,
      })
      const result = await this.dataSpace.exec2(newQuery)
      isExist = result.length > 0
    } catch (error) {
    } finally {
      // Drop the temporary table
      await this.dataSpace.exec2(`DROP TABLE ${tmpTableName}`)
    }
    return isExist
  }

  public async findRowIndexInQuery(
    table_id: string,
    rowId: string,
    query: string
  ): Promise<number> {
    const tableName = `tb_${table_id}`
    console.log("findRowIndexInQuery", tableName, rowId, query)
    try {
      // Check if the row exists in the temporary table
      const newQuery = replaceWithFindIndexQuery(query, rowId)
      const result = await this.dataSpace.exec2(newQuery)
      console.log("result", query, result)
    } catch (error) {
      console.error(error)
    } finally {
      // Drop the temporary table
      // await this.dataSpace.exec2(`DROP TABLE ${tmpTableName}`)
    }
    return 1
  }

  // after entity field changed, the formula field may be changed, so we need to recompute the formula field
  @timeit(100)
  public async recompute(table_id: string, rowIds: string[]) {
    const tableName = `tb_${table_id}`
    const placeholders = rowIds.map(() => "?").join(",")
    const result = await this.dataSpace.exec2(
      `SELECT * FROM ${tableName} where _id in (${placeholders})`,
      rowIds
    )
    return result
  }

  private async getLastPosition(): Promise<number> {
    const res = await this.dataSpace.exec2(
      `SELECT COALESCE(MAX(position), 0) as maxPosition from ${this.name};`
    )
    return res[0].maxPosition
  }

  public async getPosition(props: {
    tableId: string
    targetId: string
    targetDirection: "up" | "down"
  }): Promise<number> {
    const { tableId, targetId, targetDirection } = props
    const POSITION_GAP = 1 // 使用 1 作为基本间隔

    const views = await this.list(
      { table_id: tableId },
      {
        orderBy: "position",
        order: "ASC",
      }
    )

    const targetIndex = views.findIndex((view) => view.id === targetId)
    const prevIndex = targetDirection === "up" ? targetIndex - 1 : targetIndex
    const nextIndex = targetDirection === "up" ? targetIndex : targetIndex + 1
    const prevView = views[prevIndex]
    const nextView = views[nextIndex]

    if (prevIndex === -1) {
      return nextView ? nextView.position - POSITION_GAP : 1
    }

    if (!nextView) {
      return prevView.position + POSITION_GAP
    }

    if (nextView.position - prevView.position <= 1) {
      const viewsToReorder = [...views]
      let position = 1
      for (const view of viewsToReorder) {
        await this.updatePosition(view.id, position++)
      }
      return this.getPosition(props)
    }

    return Math.floor((prevView.position + nextView.position) / 2)
  }

  public async updatePosition(id: string, position: number): Promise<void> {
    await this.dataSpace.exec2(
      `UPDATE ${this.name} SET position = ? WHERE id = ?`,
      [position, id]
    )
  }

  /**
   * Update view position when dragging
   * @param dragId The id of the view being dragged
   * @param targetId The id of the target view
   * @param direction The direction relative to target ("up" | "down")
   * @param tableId The table id that these views belong to
   */
  public async movePosition(props: {
    dragId: string
    targetId: string
    direction: "up" | "down"
    tableId: string
  }): Promise<void> {
    const { dragId, targetId, direction, tableId } = props


    // Don't do anything if dragging onto itself
    if (dragId === targetId) {
      return
    }

    try {
      // Get new position
      const newPosition = await this.getPosition({
        tableId,
        targetId,
        targetDirection: direction
      })
      console.log(newPosition, dragId)

      // Update the position in database
      await this.updatePosition(dragId, newPosition)
    } catch (error) {
      console.error("Failed to move view position:", error)
      throw new Error("Failed to update view position")
    }
  }

  /**
   * Batch reorder views
   * @param viewIds Array of view ids in desired order (first = highest position)
   */
  public async reorderViews(viewIds: string[]): Promise<void> {
    if (viewIds.length === 0) return

    try {
      await this.dataSpace.db.transaction(async (db) => {
        // Start from a high number and decrease for each item
        // This ensures proper ordering while maintaining gaps for future insertions
        let position = viewIds.length * 1000

        for (const id of viewIds) {
          this.dataSpace.syncExec2(
            `UPDATE ${this.name} SET position = ? WHERE id = ?`,
            [position, id],
            db
          )
          position -= 1000
        }
      })
    } catch (error) {
      console.error("Failed to reorder views:", error)
      throw new Error("Failed to reorder views")
    }
  }
}
