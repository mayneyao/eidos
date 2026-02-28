import type { ITreeNode } from "../../types/ITreeNode"
import { BaseDocTable } from "./base"
import { WithMarkdown } from "./markdown"
import { WithProperty } from "./property"
import { WithSearch } from "./search"

export const ComposedDocTable = WithMarkdown(
  WithSearch(WithProperty(BaseDocTable))
)

export class DocTable extends ComposedDocTable {
  /**
   * Duplicate a doc
   * @param id doc id
   * @returns
   */
  public async duplicate(id: string): Promise<ITreeNode | null> {
    const doc = await this.get(id)
    if (!doc) return null
    const treeNode = await this.dataSpace.tree.duplicateNode(id)
    if (!treeNode) return null
    await this.add({
      ...doc,
      id: treeNode.id,
    })
    return treeNode
  }
}
