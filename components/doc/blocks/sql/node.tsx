import { ReactNode } from "react"
import { ElementTransformer } from "@lexical/markdown"
import {
  DecoratorNode,
  LexicalNode,
  NodeKey,
  SerializedLexicalNode,
  Spread,
} from "lexical"

import { SQLComponent } from "./component"

export type SerializedSQLNode = Spread<
  {
    sql: string
  },
  SerializedLexicalNode
>

export class SQLNode extends DecoratorNode<ReactNode> {
  __sql: string

  static getType(): string {
    return "sql"
  }

  static clone(node: SQLNode): SQLNode {
    return new SQLNode(node.__sql, node.__key)
  }

  constructor(sql: string, key?: NodeKey) {
    super(key)
    this.__sql = sql
  }

  setSQL(sql: string): void {
    const writable = this.getWritable()
    writable.__sql = sql
  }

  createDOM(): HTMLElement {
    return document.createElement("span")
  }

  updateDOM(): false {
    return false
  }

  static importJSON(data: SerializedSQLNode): SQLNode {
    const node = $createSQLNode(data.sql)
    return node
  }

  exportJSON(): SerializedSQLNode {
    return {
      sql: this.__sql,
      type: "sql",
      version: 1,
    }
  }

  decorate(): ReactNode {
    return <SQLComponent sql={this.__sql} nodeKey={this.__key} />
  }

  getTextContent(): string {
    return this.__sql
  }

  isInline(): boolean {
    return true
  }

  isIsolated(): boolean {
    return true
  }

  isKeyboardSelectable(): boolean {
    return true
  }
}

export function $createSQLNode(sql: string): SQLNode {
  return new SQLNode(sql)
}

export function $isSQLNode(
  node: LexicalNode | null | undefined
): node is SQLNode {
  return node instanceof SQLNode
}

export const SQL_NODE_TRANSFORMER: ElementTransformer = {
  dependencies: [SQLNode],
  export: (node) => {
    if (!$isSQLNode(node)) {
      return null
    }
    return `<query sql="${node.getTextContent()}" />`
  },
  regExp: /<query sql="([^"]+?)"\s?\/>\s?$/,
  replace: (textNode, _1, match) => {
    const [, sql] = match
    const sqlNode = $createSQLNode(sql)
    textNode.replace(sqlNode)
  },
  type: "element",
}
