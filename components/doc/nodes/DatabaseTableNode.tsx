import { ReactNode } from "react"
import { DecoratorNode } from "lexical"
import { NodeKey } from "lexical/LexicalNode"

import { getRawTableNameById } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import Grid from "@/components/grid"

const DatabaseTableComponent = (props: { id: string }) => {
  const { space } = useCurrentPathInfo()
  const rawTableName = getRawTableNameById(props.id)
  return <Grid tableName={rawTableName} databaseName={space} />
}

export class DatabaseTableNode extends DecoratorNode<ReactNode> {
  __id: string

  static getType(): string {
    return "database-table"
  }

  static clone(node: DatabaseTableNode): DatabaseTableNode {
    return new DatabaseTableNode(node.__id, node.__key)
  }

  constructor(id: string, key?: NodeKey) {
    super(key)
    this.__id = id
  }

  createDOM(): HTMLElement {
    const node = document.createElement("div")
    node.style.height = "300px"
    node.style.position = "relative"
    return node
  }

  updateDOM(): false {
    return false
  }

  decorate(): ReactNode {
    return <DatabaseTableComponent id={this.__id} />
  }

  static importJSON(data: any): DatabaseTableNode {
    const node = $createDatabaseTableNode(data.id)
    return node
  }

  exportJSON() {
    return {
      id: this.__id,
      type: "database-table",
      version: 1,
    }
  }

  canInsertTextBefore(): boolean {
    return false
  }

  canInsertTextAfter(): boolean {
    return false
  }
}

export function $createDatabaseTableNode(id: string): DatabaseTableNode {
  return new DatabaseTableNode(id)
}

export function $isDatabaseTableNode(
  node: DatabaseTableNode | null | undefined
): node is DatabaseTableNode {
  return node instanceof DatabaseTableNode
}
