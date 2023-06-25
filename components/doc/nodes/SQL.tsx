import * as React from "react"
import { DataSpace } from "@/worker/DataSpace"
import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import {
  DecoratorBlockNode,
  SerializedDecoratorBlockNode,
} from "@lexical/react/LexicalDecoratorBlockNode"
import type {
  EditorConfig,
  ElementFormatType,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  Spread,
} from "lexical"

type SQLProps = Readonly<{
  className: Readonly<{
    base: string
    focus: string
  }>
  format: ElementFormatType | null
  nodeKey: NodeKey
  sql: string
}>

function SQLComponent({ className, format, nodeKey, sql }: SQLProps) {
  const [res, setRes] = React.useState("")

  React.useEffect(() => {
    if (!sql) {
      return
    }
    const sqlite: DataSpace = (window as any).sqlite
    sqlite.exec2(sql).then((res: any) => {
      setRes(JSON.stringify(res))
    })
  }, [sql])

  return (
    <BlockWithAlignableContents
      className={className}
      format={format}
      nodeKey={nodeKey}
    >
      <span>{res}</span>
    </BlockWithAlignableContents>
  )
}

export type SerializedSQLNode = Spread<
  {
    sql: string
    type: "SQL"
    version: 1
  },
  SerializedDecoratorBlockNode
>

export class SQLNode extends DecoratorBlockNode {
  sql: string

  static getType(): string {
    return "SQL"
  }

  static clone(node: SQLNode): SQLNode {
    return new SQLNode(node.sql, node.__format, node.__key)
  }

  static importJSON(serializedNode: SerializedSQLNode): SQLNode {
    const node = $createSQLNode(serializedNode.sql)
    node.setFormat(serializedNode.format)
    return node
  }

  exportJSON(): SerializedSQLNode {
    return {
      ...super.exportJSON(),
      type: "SQL",
      version: 1,
      sql: this.sql,
    }
  }

  constructor(sql: string, format?: ElementFormatType, key?: NodeKey) {
    super(format, key)
    this.sql = sql
  }

  updateDOM(): false {
    return false
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    const embedBlockTheme = config.theme.embedBlock || {}
    const className = {
      base: embedBlockTheme.base || "",
      focus: embedBlockTheme.focus || "",
    }
    return (
      <SQLComponent
        className={className}
        format={this.__format}
        nodeKey={this.getKey()}
        sql={this.sql}
      />
    )
  }

  isTopLevel(): true {
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
