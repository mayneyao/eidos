import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import {
    DecoratorBlockNode,
    SerializedDecoratorBlockNode,
} from "@lexical/react/LexicalDecoratorBlockNode"
import {
    EditorConfig,
    ElementFormatType,
    LexicalEditor,
    LexicalNode,
    NodeKey,
    Spread,
} from "lexical"

import { TableOfContentsComponent } from "./component"

export type SerializedTOCNode = Spread<{}, SerializedDecoratorBlockNode>

export class TableOfContentsNode extends DecoratorBlockNode {
  static getType(): string {
    return "toc"
  }

  static clone(node: TableOfContentsNode): TableOfContentsNode {
    return new TableOfContentsNode(node.__format, node.__key)
  }

  constructor(format?: ElementFormatType, key?: NodeKey) {
    super(format, key)
  }

  isKeyboardSelectable(): boolean {
    return true
  }

  getTextContent(): string {
    return "[TOC]"
  }

  createDOM(): HTMLElement {
    const node = document.createElement("div")
    node.style.position = "relative"
    return node
  }

  updateDOM(): false {
    return false
  }

  static importJSON(data: SerializedTOCNode): TableOfContentsNode {
    const node = $createTableOfContentsNode(data.format)
    return node
  }

  exportJSON(): SerializedTOCNode {
    return {
      ...super.exportJSON(),
      type: "toc",
      version: 1,
    }
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    const nodeKey = this.getKey()
    const embedBlockTheme = config.theme.embedBlock || {}
    const className = {
      base: embedBlockTheme.base || "",
      focus: embedBlockTheme.focus || "",
    }
    return (
      <BlockWithAlignableContents
        format={this.__format}
        className={className}
        nodeKey={nodeKey}
      >
        <TableOfContentsComponent />
      </BlockWithAlignableContents>
    )
  }
}

export function $createTableOfContentsNode(
  format?: ElementFormatType
): TableOfContentsNode {
  return new TableOfContentsNode(format)
}

export function $isTableOfContentsNode(
  node: LexicalNode | null | undefined
): node is TableOfContentsNode {
  return node instanceof TableOfContentsNode
}
