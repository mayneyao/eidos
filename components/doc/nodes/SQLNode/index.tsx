import { ElementTransformer } from "@lexical/markdown"
import {
  DecoratorNode,
  type LexicalNode,
  type NodeKey
} from "lexical"
import { ReactNode } from "react"

import { SQLComponent } from "./component"

export class SQLNode extends DecoratorNode<ReactNode> {
  sql: string

  static getType(): string {
    return "SQL"
  }

  static clone(node: SQLNode): SQLNode {
    return new SQLNode(node.sql, node.__key)
  }

  static importJSON(serializedNode: any): SQLNode {
    const node = $createSQLNode(serializedNode.sql)
    // node.setFormat(serializedNode.format)
    return node
  }

  exportJSON(): any {
    return {
      type: "SQL",
      version: 1,
      sql: this.sql,
    }
  }

  constructor(sql: string, key?: NodeKey) {
    super(key)
    this.sql = sql
  }

  getTextContent(): string {
    return this.sql
  }

  setSQL(sql: string): void {
    const writable = this.getWritable()
    writable.sql = sql
  }

  updateDOM(): false {
    return false
  }

  createDOM(): HTMLElement {
    const node = document.createElement("span")
    // node.style.display = "inline-block"
    return node
  }

  decorate(): JSX.Element {
    console.log(this.sql, this.__key)
    return <SQLComponent sql={this.sql} nodeKey={this.__key} />
  }
  canInsertTextBefore(): boolean {
    return false
  }

  canInsertTextAfter(): boolean {
    return false
  }

  isInline(): boolean {
    return true
  }
}

export function $createSQLNode(sql: string): SQLNode {
  return new SQLNode(sql)
}

export function $isSQLNode(
  node: SQLNode | LexicalNode | null | undefined
): node is SQLNode {
  return node instanceof SQLNode
}

export const SQL_NODE_TRANSFORMER: ElementTransformer = {
  dependencies: [SQLNode],
  export: (node) => {
    if (!$isSQLNode(node)) {
      return null
    }
    return `<query sql="${node.sql}" />`
  },
  regExp: /<query sql="([^"]+?)"\s?\/>\s?$/,
  replace: (textNode, _1, match) => {
    const [, sql] = match
    const sqlNode = $createSQLNode(sql)
    textNode.replace(sqlNode)
  },
  type: "element",
}
