import type { ReactNode } from "react"
import {
  BaseSQLNode,
  $isBaseSQLNode,
  createSQLTransformer,
  type SerializedSQLNode,
} from "@eidos.space/lexical"
import { type LexicalNode, type NodeKey } from "lexical"

import { SQLComponent } from "./component"

export class SQLNode extends BaseSQLNode {
  static getType(): string {
    return "sql"
  }

  static clone(node: SQLNode): SQLNode {
    return new SQLNode(node.__sql, node.__key)
  }

  constructor(sql: string, key?: NodeKey) {
    super(sql, key)
  }

  static importJSON(data: SerializedSQLNode): SQLNode {
    const node = $createSQLNode(data.sql)
    return node
  }

  decorate(): ReactNode {
    return <SQLComponent sql={this.__sql} nodeKey={this.__key} />
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

export const SQL_NODE_TRANSFORMER = createSQLTransformer(SQLNode, (sql) =>
  $createSQLNode(sql)
)
