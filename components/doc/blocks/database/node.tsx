import {
  DecoratorBlockNode,
  SerializedDecoratorBlockNode,
} from "@lexical/react/LexicalDecoratorBlockNode"
import type {
  DOMConversionMap,
  DOMConversionOutput,
  DOMExportOutput,
  EditorConfig,
  ElementFormatType,
  LexicalEditor,
  LexicalNode,
  NodeKey,
  Spread,
} from "lexical"

import { DatabaseTableComponent } from "./component"

export type SerializedDatabaseTableNode = Spread<
  {
    id: string
  },
  SerializedDecoratorBlockNode
>

function convertDatabaseTableElement(
  domNode: HTMLElement
): null | DOMConversionOutput {
  const id = domNode.getAttribute("data-lexical-database-table")
  if (id) {
    const node = $createDatabaseTableNode(id)
    return { node }
  }
  return null
}

export class DatabaseTableNode extends DecoratorBlockNode {
  __id: string

  static getType(): string {
    return "database-table"
  }

  static clone(node: DatabaseTableNode): DatabaseTableNode {
    return new DatabaseTableNode(node.__id, node.__format, node.__key)
  }

  static importJSON(
    serializedNode: SerializedDatabaseTableNode
  ): DatabaseTableNode {
    const node = $createDatabaseTableNode(serializedNode.id)
    node.setFormat(serializedNode.format)
    return node
  }

  constructor(id: string, format?: ElementFormatType, key?: NodeKey) {
    super(format, key)
    this.__id = id
  }

  exportJSON(): SerializedDatabaseTableNode {
    return {
      ...super.exportJSON(),
      type: "database-table",
      version: 1,
      id: this.__id,
    }
  }

  exportDOM(): DOMExportOutput {
    const element = document.createElement("div")
    element.setAttribute("data-lexical-database-table", this.__id)
    return { element }
  }

  static importDOM(): DOMConversionMap | null {
    return {
      div: (domNode: HTMLElement) => {
        if (!domNode.hasAttribute("data-lexical-database-table")) {
          return null
        }
        return {
          conversion: convertDatabaseTableElement,
          priority: 1,
        }
      },
    }
  }

  updateDOM(): false {
    return false
  }

  getId(): string {
    return this.__id
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    const embedBlockTheme = config.theme.embedBlock || {}
    const className = {
      base: embedBlockTheme.base || "",
      focus: embedBlockTheme.focus || "",
    }
    return (
      <DatabaseTableComponent
        className={className}
        format={this.__format}
        nodeKey={this.getKey()}
        id={this.__id}
      />
    )
  }
}

export function $createDatabaseTableNode(id: string): DatabaseTableNode {
  return new DatabaseTableNode(id)
}

export function $isDatabaseTableNode(
  node: DatabaseTableNode | LexicalNode | null | undefined
): node is DatabaseTableNode {
  return node instanceof DatabaseTableNode
}
