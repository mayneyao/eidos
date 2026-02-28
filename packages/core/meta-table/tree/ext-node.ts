import { uuidv7 } from "@/lib/utils"
import type { BaseTreeTable } from "./base"

// Mixin to add extension node operations
type Constructor<T = {}> = new (...args: any[]) => T & BaseTreeTable

export function WithExtNode<T extends Constructor>(Base: T) {
  return class ExtNodeTreeTableMixin extends Base {
    public async createExtNode(
      ext_node_type: string,
      parent_id?: string
    ): Promise<string> {
      const extNodeId = uuidv7().split("-").join("")
      await this.dataSpace.db.transaction(async (db) => {
        await this.add({
          id: extNodeId,
          name: "",
          type: `ext__${ext_node_type}`,
          parent_id,
        })
        await this.dataSpace.extNode.add({
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
}
