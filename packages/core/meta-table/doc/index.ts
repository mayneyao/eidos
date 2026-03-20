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

  // ========== Path-based Content Operations ==========

  /**
   * Read document content by path
   * Requires name uniqueness to be enabled
   */
  async read(path: string): Promise<string> {
    const resolved = await this.dataSpace.node.resolvePath(path)
    if (!resolved) {
      throw new Error(`Document not found: ${path}`)
    }
    if (resolved.node.type !== "doc") {
      throw new Error(`Node is not a document: ${path} (${resolved.node.type})`)
    }
    return this.getMarkdown(resolved.id)
  }

  /**
   * Write document content by path (overwrites existing content)
   * Requires name uniqueness to be enabled
   */
  async write(path: string, markdown: string): Promise<void> {
    const resolved = await this.dataSpace.node.resolvePath(path)
    if (!resolved) {
      throw new Error(`Document not found: ${path}`)
    }
    if (resolved.node.type !== "doc") {
      throw new Error(`Node is not a document: ${path} (${resolved.node.type})`)
    }
    await this.createOrUpdateWithMarkdown(resolved.id, markdown)
  }

  /**
   * Append content to document by path
   * Requires name uniqueness to be enabled
   */
  async append(path: string, markdown: string): Promise<void> {
    const resolved = await this.dataSpace.node.resolvePath(path)
    if (!resolved) {
      throw new Error(`Document not found: ${path}`)
    }
    if (resolved.node.type !== "doc") {
      throw new Error(`Node is not a document: ${path} (${resolved.node.type})`)
    }
    await this.createOrUpdate({
      id: resolved.id,
      text: markdown,
      type: "markdown",
      mode: "append",
    })
  }

  /**
   * Prepend content to document by path
   * Requires name uniqueness to be enabled
   */
  async prepend(path: string, markdown: string): Promise<void> {
    const resolved = await this.dataSpace.node.resolvePath(path)
    if (!resolved) {
      throw new Error(`Document not found: ${path}`)
    }
    if (resolved.node.type !== "doc") {
      throw new Error(`Node is not a document: ${path} (${resolved.node.type})`)
    }
    await this.createOrUpdate({
      id: resolved.id,
      text: markdown,
      type: "markdown",
      mode: "prepend",
    })
  }
}
