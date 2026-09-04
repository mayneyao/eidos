import {
  DecoratorBlockNode,
  type SerializedDecoratorBlockNode,
} from "@lexical/react/LexicalDecoratorBlockNode"
import {
  $applyNodeReplacement,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
  type Spread,
} from "lexical"
import { type JSX } from "react"

import { EfmBlockSelection } from "../ui/efm-block-selection"

export type EfmSourceBlockKind =
  | "commonmark"
  | "frontmatter"
  | "footnote"
  | "image"
  | "math"
  | "raw-html"
  | "reference"

type SerializedEfmSourceBlockNode = Spread<
  {
    kind: EfmSourceBlockKind
    source: string
  },
  SerializedDecoratorBlockNode
>

const SOURCE_BLOCK_LABELS: Record<EfmSourceBlockKind, string> = {
  commonmark: "Markdown source",
  frontmatter: "YAML frontmatter",
  footnote: "Footnote",
  image: "Image",
  math: "Mathematics",
  "raw-html": "Raw HTML (source only)",
  reference: "Reference definition",
}

function EfmSourceBlockView({
  kind,
  source,
}: {
  kind: EfmSourceBlockKind
  source: string
}) {
  return (
    <div
      className="eme-efm-source-block eme-efm-block-surface"
      data-efm-source-kind={kind}
      contentEditable={false}
    >
      <div className="eme-efm-source-header">
        <span className="eme-efm-source-label">
          {SOURCE_BLOCK_LABELS[kind]}
        </span>
      </div>
      <pre className="eme-efm-source-code">
        <code>{source}</code>
      </pre>
    </div>
  )
}

/**
 * An opaque, source-preserving view for EFM constructs that Lexical cannot
 * model without changing their syntax semantics. The node is deliberately
 * non-executable: even raw HTML is rendered as text.
 */
export class EfmSourceBlockNode extends DecoratorBlockNode {
  __kind: EfmSourceBlockKind
  __source: string

  static getType(): string {
    return "efm-source-block"
  }

  static clone(node: EfmSourceBlockNode): EfmSourceBlockNode {
    return new EfmSourceBlockNode(node.__source, node.__kind, node.__key)
  }

  static importJSON(
    serializedNode: SerializedEfmSourceBlockNode
  ): EfmSourceBlockNode {
    return $createEfmSourceBlockNode(
      serializedNode.source,
      serializedNode.kind
    ).setFormat(serializedNode.format)
  }

  constructor(
    source: string,
    kind: EfmSourceBlockKind = "commonmark",
    key?: NodeKey
  ) {
    super(undefined, key)
    this.__kind = kind
    this.__source = source
  }

  exportJSON(): SerializedEfmSourceBlockNode {
    return {
      ...super.exportJSON(),
      kind: this.getKind(),
      source: this.getSource(),
      type: "efm-source-block",
      version: 1,
    }
  }

  getKind(): EfmSourceBlockKind {
    return this.getLatest().__kind
  }

  getSource(): string {
    return this.getLatest().__source
  }

  setSource(source: string): this {
    const writable = this.getWritable()
    writable.__source = source
    return writable
  }

  getTextContent(): string {
    return this.getSource()
  }

  decorate(editor: LexicalEditor): JSX.Element {
    const nodeKey = this.getKey()
    return (
      <>
        <EfmBlockSelection editor={editor} nodeKey={nodeKey} />
        <EfmSourceBlockView kind={this.getKind()} source={this.getSource()} />
      </>
    )
  }
}

export function $createEfmSourceBlockNode(
  source: string,
  kind: EfmSourceBlockKind = "commonmark"
): EfmSourceBlockNode {
  return $applyNodeReplacement(new EfmSourceBlockNode(source, kind))
}

export function $isEfmSourceBlockNode(
  node: LexicalNode | null | undefined
): node is EfmSourceBlockNode {
  return node instanceof EfmSourceBlockNode
}
