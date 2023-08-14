
import { DataSpace } from "../DataSpace"
import { MetaTable } from "./base"
import { IView } from "./view"

interface ITable {
  id: string
  name: string
  views: IView[]
}

export class Table implements MetaTable<ITable> {
  constructor(protected dataSpace: DataSpace) {}
  add(data: ITable): Promise<ITable> {
    throw new Error("Method not implemented.")
  }
  async get(id: string): Promise<ITable | null> {
    const views = await this.dataSpace.listViews(id)
    const tableNode = await this.dataSpace.getTreeNode(id)
    if (!tableNode) {
      return null
    }
    return {
      id: tableNode.id,
      name: tableNode.name,
      views,
    }
  }
  set(id: string, data: Partial<ITable>): Promise<boolean> {
    throw new Error("Method not implemented.")
  }
  del(id: string): Promise<boolean> {
    throw new Error("Method not implemented.")
  }
}
