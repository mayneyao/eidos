import type { ElementTransformer } from "@lexical/markdown"
import {
  DecoratorNode,
  type EditorConfig,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical"

export type SerializedSQLNode = Spread<
  {
    sql: string
  },
  SerializedLexicalNode
>

export class BaseSQLNode extends DecoratorNode<any> {
  public __sql: string

  static getType(): string {
    return "sql"
  }

  static clone(node: BaseSQLNode): BaseSQLNode {
    return new BaseSQLNode(node.__sql, node.__key)
  }

  constructor(sql: string, key?: NodeKey) {
    super(key)
    this.__sql = sql
  }

  static importJSON(data: SerializedSQLNode): BaseSQLNode {
    return new BaseSQLNode(data.sql)
  }

  exportJSON(): SerializedSQLNode {
    return {
      sql: this.__sql,
      type: "sql",
      version: 1,
    }
  }

  getSQL(): string {
    return this.__sql
  }

  setSQL(sql: string): void {
    const writable = this.getWritable()
    writable.__sql = sql
  }

  getTextContent(): string {
    return this.__sql
  }

  decorate(_editor: LexicalEditor, _config: EditorConfig): any {
    return null
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

  createDOM(): HTMLElement {
    return document.createElement("span")
  }

  updateDOM(): false {
    return false
  }
}

export function $isBaseSQLNode(
  node: LexicalNode | null | undefined
): node is BaseSQLNode {
  return node instanceof BaseSQLNode
}

export function createSQLTransformer<T extends typeof LexicalNode>(
  nodeClass: any = BaseSQLNode,
  createNode: (sql: string) => InstanceType<T> = (sql) =>
    new nodeClass(sql) as any
): ElementTransformer {
  return {
    dependencies: [nodeClass],
    export: (node) => {
      if (!(node instanceof nodeClass)) {
        return null
      }
      return `<query sql="${(node as BaseSQLNode).getTextContent()}" />`
    },
    regExp: /<query sql="([^"]+?)"\s?\/>\s?$/,
    replace: (textNode, _1, match) => {
      const [, sql] = match
      const sqlNode = createNode(sql)
      textNode.replace(sqlNode)
    },
    type: "element",
  }
}

export const SQL_NODE_TRANSFORMER = createSQLTransformer()
