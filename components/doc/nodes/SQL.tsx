import { DataSpace } from "@/worker/web-worker/DataSpace"
import { ElementTransformer } from "@lexical/markdown"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  $getNodeByKey,
  DecoratorNode,
  type LexicalNode,
  type NodeKey,
} from "lexical"
import * as React from "react"
import { ReactNode } from "react"

import { useModal } from "../hooks/useModal"
import { SqlQueryDialog } from "../plugins/SQLPlugin/SqlQueryDialog"
import { getQueryResultText } from "../utils/sql"

type SQLProps = Readonly<{
  sql: string
  nodeKey: string
}>

function SQLComponent({ sql, nodeKey }: SQLProps) {
  const [res, setRes] = React.useState("")
  const [modal, showModal] = useModal()
  const [editor] = useLexicalComposerContext()

  React.useEffect(() => {
    if (!sql) {
      return
    }
    const sqlite: DataSpace = (window as any).sqlite
    sqlite.exec2(sql).then((res: any) => {
      const text = getQueryResultText(res)
      setRes(text)
    })
  }, [sql])

  const updateSql = (sql: string) => {
    editor.update(() => {
      const node = $getNodeByKey(nodeKey) as SQLNode
      console.log(node, nodeKey)
      if ($isSQLNode(node)) {
        node.setSQL(sql)
      }
    })
  }

  const handleClick = () => {
    showModal("Insert SqlQuery", (onClose) => (
      <SqlQueryDialog
        activeEditor={editor}
        onClose={onClose}
        sql={sql}
        handleSqlChange={updateSql}
      />
    ))
  }

  return (
    <>
      {modal}
      <span
        className="inline-block cursor-pointer rounded-sm px-1 text-purple-500 hover:bg-secondary"
        onClick={handleClick}
      >
        {res}
      </span>
    </>
  )
}

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
