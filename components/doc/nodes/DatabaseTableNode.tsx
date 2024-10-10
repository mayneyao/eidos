import { ReactNode } from "react"
import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import { DecoratorNode, EditorConfig, LexicalEditor, NodeKey } from "lexical"

import { getRawTableNameById } from "@/lib/utils"
import { useCurrentPathInfo } from "@/hooks/use-current-pathinfo"
import { Table } from "@/components/table"

const DatabaseTableComponent = (props: { id: string }) => {
  const { space } = useCurrentPathInfo()
  const rawTableName = getRawTableNameById(props.id)
  return (
    <div className="border max-h-[300px] overflow-y-auto">
      <Table tableName={rawTableName} space={space} isEmbed />
    </div>
  )
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
    // node.style.height = "300px"
    node.style.position = "relative"
    return node
  }

  updateDOM(): false {
    return false
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): ReactNode {
    const data = this.exportJSON()
    const nodeKey = this.getKey()
    const embedBlockTheme = config.theme.embedBlock || {}

    const className = {
      base: embedBlockTheme.base || "",
      focus: embedBlockTheme.focus || "",
    }
    return (
      <BlockWithAlignableContents className={className} nodeKey={nodeKey}>
        <DatabaseTableComponent id={this.__id} />
      </BlockWithAlignableContents>
    )
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
