import type { MultilineElementTransformer } from "@lexical/markdown"
import { BlockWithAlignableContents } from "@lexical/react/LexicalBlockWithAlignableContents"
import {
  BaseMermaidNode,
  $isBaseMermaidNode,
  createMermaidTransformer,
} from "@eidos.space/lexical"
import type {
  EditorConfig,
  ElementFormatType,
  LexicalEditor,
  LexicalNode,
  NodeKey,
} from "lexical"

import { Mermaid } from "./component"

export class MermaidNode extends BaseMermaidNode {
  static getType(): string {
    return "mermaid"
  }

  static clone(node: MermaidNode): MermaidNode {
    return new MermaidNode(node.__code, node.getFormat(), node.getKey())
  }

  constructor(text: string, format?: ElementFormatType, key?: NodeKey) {
    super(text, format, key)
  }

  static importJSON(serializedNode: any): MermaidNode {
    const node = $createMermaidNode(serializedNode.code || serializedNode.text)
    node.setFormat(serializedNode.format)
    return node
  }

  decorate(_editor: LexicalEditor, config: EditorConfig): JSX.Element {
    if (this.__code.length === 0 || this.__code == null) {
      return <div>Empty Mermaid code</div>
    }
    const embedBlockTheme = config.theme.embedBlock || {}
    const className = {
      base: embedBlockTheme.base || "",
      focus: embedBlockTheme.focus || "",
    }
    const nodeKey = this.getKey()
    const format = this.getFormat()

    return (
      <BlockWithAlignableContents
        format={format}
        className={className}
        nodeKey={nodeKey}
      >
        <Mermaid text={this.__code} nodeKey={nodeKey} />
      </BlockWithAlignableContents>
    )
  }
}

export function $createMermaidNode(text: string): MermaidNode {
  return new MermaidNode(text)
}

export function $isMermaidNode(
  node: LexicalNode | null | undefined
): node is MermaidNode {
  return node instanceof MermaidNode
}

export const MERMAID_NODE_TRANSFORMER: MultilineElementTransformer =
  createMermaidTransformer(MermaidNode, (text) => $createMermaidNode(text))
